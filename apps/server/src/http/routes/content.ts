import {
  interpretationSchema,
  noteSchema,
  phraseSchema,
  type NoteResult,
  type PhraseResult,
  type InterpretationResult
} from '@momo/ai'
import { beijingToday, interpretations, notes, phrases, queryVocabulary } from '@momo/maimemo'
import { getQuotaState, QuotaExceededError } from '@momo/core'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import { db } from '../../db.js'
import { contentWriteItems, contentWriteJobs } from '@momo/db'
import { HttpError, permissionDenied, validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { ensurePreferences } from './maimemo.js'
import { getMaimemoClient } from '../../services/maimemo-client.js'
import {
  PERMISSION_BY_TYPE,
  generateSingle,
  writeSingle,
  type JobType
} from '../../services/content.js'

/**
 * 内容生成与写入路由（FR-6 / 7 / 8，docs 第 8.7 节）。
 *
 * AC-6.1：写入前校验权限开关；AC-6.3：超额返回明确文案；
 * 幂等：同一用户同词同类型同场景的唯一约束，重复提交不产生重复任务项。
 */
export const contentRoutes = new Hono<AppEnv>()

contentRoutes.use('*', requireSession)

const jobTypeSchema = z.enum(['INTERPRETATION', 'PHRASE', 'NOTE'])
const sceneSchema = z.enum(['CONCISE', 'EXAM', 'WORK', 'TECH', 'PAPER', 'CONTRAST'])

/** 单条生成（同步返回，不落库、不写墨墨） */
contentRoutes.post('/content/generate', async (c) =>
{
  const userId = c.get('userId')
  const parsed = z
    .object({
      spelling: z.string().min(1).max(64),
      jobType: jobTypeSchema,
      scene: sceneSchema
    })
    .safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供单词、内容类型与生成场景')
  }

  const client = await getMaimemoClient(userId)
  const voc = (await queryVocabulary(client, [parsed.data.spelling])).get(
    parsed.data.spelling.trim().toLowerCase()
  )

  if (!voc)
  {
    throw validationFailed(`「${parsed.data.spelling}」不在墨墨词库中`)
  }

  const payload = await generateSingle(userId, {
    jobType: parsed.data.jobType,
    scene: parsed.data.scene,
    spelling: parsed.data.spelling
  })

  return c.json({
    data: {
      jobType: parsed.data.jobType,
      scene: parsed.data.scene,
      spelling: parsed.data.spelling,
      vocId: voc.id,
      payload
    }
  })
})

/** 批量生成任务：入队立即返回 jobId（拼写 → vocId 解析，词库不存在的跳过） */
contentRoutes.post('/content/jobs', async (c) =>
{
  const userId = c.get('userId')
  const parsed = z
    .object({
      jobType: jobTypeSchema,
      scene: sceneSchema,
      spellings: z.array(z.string().min(1).max(64)).min(1).max(500)
    })
    .safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供单词列表、内容类型与生成场景')
  }

  const pref = await ensurePreferences(userId)

  if (!pref[PERMISSION_BY_TYPE[parsed.data.jobType]])
  {
    throw permissionDenied('批量写入需要在设置中开启对应的写入权限')
  }

  const client = await getMaimemoClient(userId)

  // 词库解析（每批 500）
  const vocabMap = new Map<string, { id: string; spelling: string }>()

  for (let i = 0; i < parsed.data.spellings.length; i += 500)
  {
    const part = await queryVocabulary(client, parsed.data.spellings.slice(i, i + 500))

    for (const [key, value] of part)
    {
      vocabMap.set(key, value)
    }
  }

  const resolved = parsed.data.spellings
    .map((spelling) => vocabMap.get(spelling.trim().toLowerCase()))
    .filter((voc): voc is NonNullable<typeof voc> => voc !== null)

  if (resolved.length === 0)
  {
    throw validationFailed('提交的单词均不在墨墨词库中')
  }

  const job = (
    await db
      .insert(contentWriteJobs)
      .values({
        userId,
        jobType: parsed.data.jobType,
        scene: parsed.data.scene,
        totalCount: resolved.length,
        quotaDate: beijingToday()
      })
      .returning()
  )[0]!

  // 幂等键冲突（用户-类型-词-场景已存在）直接跳过
  const inserted = await db
    .insert(contentWriteItems)
    .values(
      resolved.map((voc) => ({
        jobId: job.id,
        userId,
        jobType: parsed.data.jobType,
        scene: parsed.data.scene,
        vocId: voc.id,
        spelling: voc.spelling
      }))
    )
    .onConflictDoNothing()
    .returning({ id: contentWriteItems.id })

  await db
    .update(contentWriteJobs)
    .set({ totalCount: inserted.length, updatedAt: new Date() })
    .where(eq(contentWriteJobs.id, job.id))

  return c.json({
    data: {
      jobId: job.id,
      createdItems: inserted.length,
      resolvedCount: resolved.length,
      unknownSpellings: parsed.data.spellings.length - resolved.length
    }
  })
})

/** 任务列表（最近 20 个） */
contentRoutes.get('/content/jobs', async (c) =>
{
  const rows = await db
    .select()
    .from(contentWriteJobs)
    .where(eq(contentWriteJobs.userId, c.get('userId')))
    .orderBy(desc(contentWriteJobs.createdAt))
    .limit(20)

  return c.json({ data: { jobs: rows } })
})

/** 任务进度（已写 / 失败 / 待执行 + 剩余配额） */
contentRoutes.get('/content/jobs/:id', async (c) =>
{
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(contentWriteJobs)
    .where(and(eq(contentWriteJobs.id, c.req.param('id')), eq(contentWriteJobs.userId, userId)))
    .limit(1)

  const job = rows[0]

  if (!job)
  {
    throw validationFailed('任务不存在')
  }

  const items = await db
    .select({
      id: contentWriteItems.id,
      spelling: contentWriteItems.spelling,
      status: contentWriteItems.status,
      error: contentWriteItems.error
    })
    .from(contentWriteItems)
    .where(eq(contentWriteItems.jobId, job.id))

  const quota = await getQuotaState(db, userId, beijingToday())

  return c.json({
    data: {
      job,
      items,
      quota
    }
  })
})

/** 取消任务（未完成的部分不再执行） */
contentRoutes.post('/content/jobs/:id/cancel', async (c) =>
{
  const userId = c.get('userId')
  const jobId = c.req.param('id')

  await db
    .update(contentWriteJobs)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(
      and(
        eq(contentWriteJobs.id, jobId),
        eq(contentWriteJobs.userId, userId),
        inArray(contentWriteJobs.status, ['PENDING', 'RUNNING', 'PAUSED'])
      )
    )

  await db
    .update(contentWriteItems)
    .set({ status: 'CANCELLED', error: '任务已取消', updatedAt: new Date() })
    .where(
      and(
        eq(contentWriteItems.jobId, jobId),
        inArray(contentWriteItems.status, ['PENDING', 'RUNNING'])
      )
    )

  return c.json({ data: { ok: true } })
})

/** 单条写入墨墨（用户确认后调用） */
contentRoutes.post('/content/write', async (c) =>
{
  const userId = c.get('userId')
  const parsed = z
    .object({
      jobType: jobTypeSchema,
      scene: sceneSchema,
      spelling: z.string().min(1).max(64),
      payload: z.unknown()
    })
    .safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('写入参数不合法')
  }

  const client = await getMaimemoClient(userId)
  const voc = (await queryVocabulary(client, [parsed.data.spelling])).get(
    parsed.data.spelling.trim().toLowerCase()
  )

  if (!voc)
  {
    throw validationFailed(`「${parsed.data.spelling}」不在墨墨词库中`)
  }

  // payload 结构按类型校验
  let payload: InterpretationResult | PhraseResult | NoteResult

  try
  {
    if (parsed.data.jobType === 'INTERPRETATION')
    {
      payload = interpretationSchema.parse(parsed.data.payload)
    }
    else if (parsed.data.jobType === 'PHRASE')
    {
      payload = phraseSchema.parse(parsed.data.payload)
    }
    else
    {
      payload = noteSchema.parse(parsed.data.payload)
    }
  }
  catch
  {
    throw validationFailed('内容格式不合法，请重新生成')
  }

  try
  {
    await writeSingle(userId, {
      jobType: parsed.data.jobType,
      vocId: voc.id,
      spelling: parsed.data.spelling,
      payload
    })
  }
  catch (error)
  {
    if (error instanceof QuotaExceededError)
    {
      throw new HttpError('quota_exceeded', 429, error.message)
    }

    throw error
  }

  return c.json({ data: { ok: true } })
})

/** 已写入内容列表 */
contentRoutes.get('/content/written', async (c) =>
{
  const userId = c.get('userId')
  const type = c.req.query('type')

  const conditions = [eq(contentWriteItems.userId, userId), eq(contentWriteItems.status, 'DONE')]

  if (type)
  {
    conditions.push(eq(contentWriteItems.jobType, jobTypeSchema.parse(type)))
  }

  const rows = await db
    .select()
    .from(contentWriteItems)
    .where(and(...conditions))
    .orderBy(desc(contentWriteItems.writtenAt))
    .limit(100)

  return c.json({ data: { items: rows } })
})

/** 删除已写入内容（尽力删除墨墨侧内容 + 平台标记移除） */
contentRoutes.delete('/content/written/:type/:id', async (c) =>
{
  const userId = c.get('userId')
  const jobType = jobTypeSchema.parse(c.req.param('type'))
  const itemId = c.req.param('id')

  const rows = await db
    .select()
    .from(contentWriteItems)
    .where(
      and(
        eq(contentWriteItems.id, itemId),
        eq(contentWriteItems.userId, userId),
        eq(contentWriteItems.jobType, jobType)
      )
    )
    .limit(1)

  const item = rows[0]

  if (!item)
  {
    throw validationFailed('记录不存在')
  }

  // 尽力删除墨墨侧内容：按 vocId 列出后按内容匹配（墨墨 create 响应未确认返回 ID）
  const payload = item.payload as { content?: string } | null

  if (payload?.content)
  {
    try
    {
      const client = await getMaimemoClient(userId)

      if (jobType === 'INTERPRETATION')
      {
        const list = await interpretations(client).list(item.vocId)
        const target = list.find((draft) => draft.content === payload.content)

        if (target?.id)
        {
          await interpretations(client).remove(target.id)
        }
      }
      else if (jobType === 'PHRASE')
      {
        const list = await phrases(client).list(item.vocId)
        const target = list.find((draft) => draft.content === payload.content)

        if (target?.id)
        {
          await phrases(client).remove(target.id)
        }
      }
      else
      {
        const list = await notes(client).list(item.vocId)
        const target = list.find((draft) => draft.content === payload.content)

        if (target?.id)
        {
          await notes(client).remove(target.id)
        }
      }
    }
    catch
    {
      // 墨墨侧删除失败不阻塞平台侧移除（C1：只能操作自己创建的内容）
    }
  }

  await db
    .update(contentWriteItems)
    .set({ status: 'CANCELLED', error: '用户删除', updatedAt: new Date() })
    .where(eq(contentWriteItems.id, item.id))

  return c.json({ data: { ok: true } })
})
