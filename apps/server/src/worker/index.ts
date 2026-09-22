import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { contentWriteItems, contentWriteJobs } from '@momo/db'
import { db } from '../db.js'
import {
  PERMISSION_BY_TYPE,
  generateSingle,
  hasQuota,
  writeSingle,
  type ContentPayload,
  type JobType
} from '../services/content.js'
import { ensurePreferences } from '../http/routes/maimemo.js'

export interface WorkerHandle
{
  stop: () => Promise<void>
}

/**
 * 内容写入队列消费（docs/development-guide.md 第 7.6 节）。
 *
 * 约束：
 * - 全局并发 WORKER_CONCURRENCY（进程内串行），保护机器不被批量任务打爆；
 * - 状态机：PENDING → RUNNING → DONE；FAILED 重试最多 3 次后 SKIPPED；
 * - 配额不足 → 整个任务 PAUSED，次日 queue-resume 恢复（C4 分天执行）；
 * - 幂等：payload 已生成的内容重试时不重复调用 AI；
 * - 墨墨 C9 限流由 MaimemoClient 内部排队保证。
 */
export function startWorker(): WorkerHandle
{
  let running = true
  let pending = Promise.resolve()

  const loop = async (): Promise<void> =>
  {
    while (running)
    {
      let processed = false

      try
      {
        processed = await processNextItem()
      }
      catch (error)
      {
        console.error('[worker] 处理循环异常', error)
      }

      if (!processed)
      {
        await sleep(2000)
      }
    }
  }

  pending = loop()

  return {
    stop: async () =>
    {
      running = false
      await pending
    }
  }
}

/** 处理一条任务；返回是否实际处理（无待处理任务返回 false） */
async function processNextItem(): Promise<boolean>
{
  // 事务抢占：FOR UPDATE SKIP LOCKED，多进程部署也安全
  const item = await db.transaction(async (tx) =>
  {
    const rows = await tx
      .select()
      .from(contentWriteItems)
      .where(eq(contentWriteItems.status, 'PENDING'))
      .orderBy(asc(contentWriteItems.createdAt))
      .limit(1)
      .for('update', { skipLocked: true })

    const claimed = rows[0]

    if (!claimed)
    {
      return null
    }

    await tx
      .update(contentWriteItems)
      .set({ status: 'RUNNING', updatedAt: new Date() })
      .where(eq(contentWriteItems.id, claimed.id))

    // 任务从 PENDING 进入 RUNNING
    await tx
      .update(contentWriteJobs)
      .set({ status: 'RUNNING', updatedAt: new Date() })
      .where(and(eq(contentWriteJobs.id, claimed.jobId), eq(contentWriteJobs.status, 'PENDING')))

    return claimed
  })

  if (!item)
  {
    return false
  }

  try
  {
    await handleItem(item)
  }
  catch (error)
  {
    console.error(`[worker] 任务项处理异常 item=${item.id}`, error)
    await failItem(item, error instanceof Error ? error.message : String(error))
  }

  await refreshJobCounters(item.jobId)

  return true
}

type ItemRow = typeof contentWriteItems.$inferSelect

/** 单条任务的完整处理流程（docs 7.6 顺序） */
async function handleItem(item: ItemRow): Promise<void>
{
  // 1. 权限开关（未开启 → SKIPPED + 原因）
  const pref = await ensurePreferences(item.userId)

  if (!pref[PERMISSION_BY_TYPE[item.jobType as JobType]])
  {
    await markSkipped(item, '对应的写入权限未开启')
    return
  }

  // 2. 当日剩余配额（不足 → 任务暂停，等次日续跑）
  if (!(await hasQuota(item.userId)))
  {
    await pauseJob(item.jobId)
    return
  }

  // 3. AI 生成（幂等：重试时已有 payload 则跳过）
  let payload = item.payload as ContentPayload | null

  if (!payload)
  {
    payload = await generateSingle(item.userId, {
      jobType: item.jobType as JobType,
      scene: item.scene,
      spelling: item.spelling
    })

    await db
      .update(contentWriteItems)
      .set({ payload, updatedAt: new Date() })
      .where(eq(contentWriteItems.id, item.id))
  }

  // 4-5. 解密 Token + 调墨墨写入（在 writeSingle 内完成）
  // 6. 成功后更新状态并记账配额（writeSingle 内 consumeQuota）
  await writeSingle(item.userId, {
    jobType: item.jobType as JobType,
    vocId: item.vocId,
    spelling: item.spelling,
    payload
  })

  await db
    .update(contentWriteItems)
    .set({ status: 'DONE', error: null, writtenAt: new Date(), updatedAt: new Date() })
    .where(eq(contentWriteItems.id, item.id))
}

/** 失败处理：attempts + 1，超 3 次 SKIPPED，否则回 PENDING 等待重试 */
async function failItem(item: ItemRow, message: string): Promise<void>
{
  const attempts = item.attempts + 1
  const nextStatus = attempts >= 3 ? 'SKIPPED' : 'PENDING'

  console.error(`[worker] 任务项失败 item=${item.id} attempts=${attempts}: ${message}`)

  await db
    .update(contentWriteItems)
    .set({ status: nextStatus, attempts, error: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(contentWriteItems.id, item.id))
}

async function markSkipped(item: ItemRow, reason: string): Promise<void>
{
  await db
    .update(contentWriteItems)
    .set({ status: 'SKIPPED', error: reason, updatedAt: new Date() })
    .where(eq(contentWriteItems.id, item.id))
}

/** 配额不足：整个任务暂停（当日不再消费），次日 queue-resume 恢复 */
async function pauseJob(jobId: string): Promise<void>
{
  await db
    .update(contentWriteJobs)
    .set({ status: 'PAUSED', updatedAt: new Date() })
    .where(and(eq(contentWriteJobs.id, jobId), inArray(contentWriteJobs.status, ['PENDING', 'RUNNING'])))

  console.log(`[worker] 配额不足，任务 ${jobId} 已暂停至次日`)
}

/** 重算任务进度：DONE/FAILED 计数 + 是否完结 */
async function refreshJobCounters(jobId: string): Promise<void>
{
  const rows = await db
    .select({
      status: contentWriteItems.status,
      count: sql<number>`count(*)::int`
    })
    .from(contentWriteItems)
    .where(eq(contentWriteItems.jobId, jobId))
    .groupBy(contentWriteItems.status)

  const counts = new Map(rows.map((row) => [row.status, row.count]))
  const doneCount = counts.get('DONE') ?? 0
  const failedCount = (counts.get('FAILED') ?? 0) + (counts.get('SKIPPED') ?? 0)
  const openCount = (counts.get('PENDING') ?? 0) + (counts.get('RUNNING') ?? 0)

  await db
    .update(contentWriteJobs)
    .set({
      doneCount,
      failedCount,
      ...(openCount === 0 ? { status: 'DONE' } : {}),
      updatedAt: new Date()
    })
    .where(and(eq(contentWriteJobs.id, jobId), inArray(contentWriteJobs.status, ['PENDING', 'RUNNING'])))
}

/** 供 scheduler 调用：新的一天配额恢复，PAUSED 任务回到 PENDING（7.7 queue-resume） */
export async function resumePausedJobs(): Promise<void>
{
  const result = await db
    .update(contentWriteJobs)
    .set({ status: 'PENDING', updatedAt: new Date() })
    .where(eq(contentWriteJobs.status, 'PAUSED'))

  console.log(`[scheduler] queue-resume 完成，恢复 ${result.rowCount ?? 0} 个暂停任务`)
}

function sleep(ms: number): Promise<void>
{
  return new Promise((resolve) => setTimeout(resolve, ms))
}
