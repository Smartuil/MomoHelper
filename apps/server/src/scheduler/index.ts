import { maimemoCredentials } from '@momo/db'
import { decryptToken } from '../security/crypto.js'
import { eq } from 'drizzle-orm'
import cron from 'node-cron'
import type { ScheduledTask } from 'node-cron'

import { db } from '../db.js'
import { getDashboardToday } from '../services/dashboard.js'
import { resumePausedJobs } from '../worker/index.js'
import { generateWeeklyReports } from '../http/routes/review.js'
import { MaimemoClient } from '@momo/maimemo'

export interface SchedulerHandle
{
  stop: () => Promise<void>
}

/**
 * 定时任务（docs/development-guide.md 第 7.7 节）。
 *
 * 这些任务必须无人值守执行：墨墨学习数据接口只有今日快照、没有历史序列，
 * 漏采一天就永久缺失一天，周报与趋势功能全部依赖快照表（C3）。
 *
 * 快照任务逐个用户调用墨墨接口，限流由 MaimemoClient 内部排队保证（C9）。
 */
export function startScheduler(): SchedulerHandle
{
  const tasks: ScheduledTask[] = []

  // 每日 00:10（北京时间由服务器 TZ=Asia/Shanghai 保证）
  tasks.push(
    cron.schedule('0 10 0 * * *', () =>
    {
      void runDailySnapshots()
    })
  )

  // 每日 23:40 遗忘事件累积（FR-15.5）：当日收尾再采一次，落 forget_events
  tasks.push(
    cron.schedule('0 40 23 * * *', () =>
    {
      void runDailySnapshots('forget-accumulate')
    })
  )

  // 每日 00:30 配额恢复：PAUSED 任务回到 PENDING（7.7 queue-resume）
  tasks.push(
    cron.schedule('0 30 0 * * *', () =>
    {
      void resumePausedJobs()
    })
  )

  // 每周一 09:00 生成上周周报（7.7 weekly-report）
  tasks.push(
    cron.schedule('0 0 9 * * 1', () =>
    {
      void generateWeeklyReports()
    })
  )

  // 每日 08:00 Token 过期巡检（C10：7 天有效期，无刷新机制）
  tasks.push(
    cron.schedule('0 0 8 * * *', () =>
    {
      void runTokenCheck()
    })
  )

  console.log(`[scheduler] 已注册 ${tasks.length} 项定时任务`)

  return {
    stop: async () =>
    {
      for (const task of tasks)
      {
        task.stop()
      }
    }
  }
}

/** 每日快照：对所有 ACTIVE 凭据用户拉取今日进度并落库（FR-15.1 / FR-15.5） */
async function runDailySnapshots(taskName = 'daily-snapshot'): Promise<void>
{
  const rows = await db
    .select()
    .from(maimemoCredentials)
    .where(eq(maimemoCredentials.tokenStatus, 'ACTIVE'))

  console.log(`[scheduler] ${taskName} 开始，共 ${rows.length} 个用户`)

  for (const record of rows)
  {
    try
    {
      const token = decryptToken(
        {
          ciphertext: record.ciphertext,
          iv: record.iv,
          authTag: record.authTag,
          keyVersion: record.keyVersion
        },
        record.userId
      )

      const client = new MaimemoClient({ token })
      await getDashboardToday(client, record.userId)
    }
    catch (error)
    {
      // 单个用户失败不阻塞其他用户；鉴权失败标记 EXPIRED（C10）
      console.error(`[scheduler] 用户 ${record.userId} 快照失败`, error)

      if (error instanceof Error && error.name === 'MaimemoAuthError')
      {
        await db
          .update(maimemoCredentials)
          .set({ tokenStatus: 'EXPIRED', updatedAt: new Date() })
          .where(eq(maimemoCredentials.userId, record.userId))
      }
    }
  }

  console.log(`[scheduler] ${taskName} 结束`)
}

/** Token 过期巡检：过期时间已到的标记 EXPIRED，前端引导重绑 */
async function runTokenCheck(): Promise<void>
{
  const rows = await db
    .select()
    .from(maimemoCredentials)
    .where(eq(maimemoCredentials.tokenStatus, 'ACTIVE'))

  const now = Date.now()
  let expired = 0

  for (const record of rows)
  {
    if (record.tokenExpiresAt && record.tokenExpiresAt.getTime() < now)
    {
      await db
        .update(maimemoCredentials)
        .set({ tokenStatus: 'EXPIRED', updatedAt: new Date() })
        .where(eq(maimemoCredentials.userId, record.userId))
      expired++
    }
  }

  console.log(`[scheduler] token-check 完成，标记过期 ${expired} 个`)
}
