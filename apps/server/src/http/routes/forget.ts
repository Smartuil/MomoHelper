import { AiClient, diagnoseForget } from '@momo/ai'
import {
  advanceStudy,
  createNotepad,
  getNotepad,
  listNotepads,
  queryStudyRecords,
  toBeijingDate,
  updateNotepad
} from '@momo/maimemo'
import { MaimemoApiError, MaimemoNetworkError } from '@momo/maimemo'
import { Hono } from 'hono'
import { z } from 'zod'

import type { FocusWordDto } from '@momo/types'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { env } from '../../config/env.js'
import { db } from '../../db.js'
import { aiGenerations, forgetEvents } from '@momo/db'
import { maimemoUnavailable, permissionDenied, validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { ensurePreferences } from './maimemo.js'
import { getMaimemoClient, isAuthError } from '../../services/maimemo-client.js'
import { getTodayForgotten } from '../../services/dashboard.js'

/**
 * 遗忘词域路由（FR-3，docs 第 8.4 节）。
 *
 * C2：学习数据接口公测不可用时降级；C5：提前复习等级不足只能失败后处理。
 */
export const forgetRoutes = new Hono<AppEnv>()

forgetRoutes.use('*', requireSession)

/** 今日遗忘词（FR-3.1：is_finished 且 first_response = FORGET） */
forgetRoutes.get('/forget/today', async (c) =>
{
  const client = await getMaimemoClient(c.get('userId'))

  try
  {
    const words = await getTodayForgotten(client)
    return c.json({ data: { words } })
  }
  catch (error)
  {
    if (isAuthError(error))
    {
      throw error
    }

    // C2 降级：公测接口不可用返回空列表并标注
    return c.json({
      data: { words: [] as FocusWordDto[], degraded: true }
    })
  }
})

/** 区间遗忘词（FR-3.2，近似：基于平台累积的 forget_events，AC-3.2） */
forgetRoutes.get('/forget/range', async (c) =>
{
  const days = z.coerce.number().int().refine((v) => v === 7 || v === 30).default(7).parse(
    c.req.query('days') ?? undefined
  )

  const start = toBeijingDate(new Date(Date.now() - (days - 1) * 86_400_000))

  const rows = await db
    .select({
      vocId: forgetEvents.vocId,
      spelling: forgetEvents.spelling,
      count: sql<number>`count(*)::int`,
      lastDate: sql<string>`max(${forgetEvents.eventDate})::text`
    })
    .from(forgetEvents)
    .where(and(eq(forgetEvents.userId, c.get('userId')), gte(forgetEvents.eventDate, start)))
    .groupBy(forgetEvents.vocId, forgetEvents.spelling)
    .orderBy(desc(sql`count(*)`))

  return c.json({
    data: {
      approximate: true,
      description: `基于平台累积的遗忘事件（自绑定起记录），最近 ${days} 天共 ${rows.length} 个词；墨墨不提供按天历史，故为近似统计。`,
      words: rows
    }
  })
})

/** 顽固词（FR-3.5：tags 含 STICKING；学习记录接口公测同样需降级） */
forgetRoutes.get('/forget/sticking', async (c) =>
{
  const client = await getMaimemoClient(c.get('userId'))

  try
  {
    const result = await queryStudyRecords(client, { limit: 1000 })
    const words = result.records
      .filter((record) => record.tags.includes('STICKING'))
      .map((record) => ({
        vocId: record.voc_id,
        spelling: record.voc_spelling,
        isNew: false,
        lastResponse: record.last_response,
        studyCount: record.study_count,
        tags: record.tags
      }))

    return c.json({ data: { words } })
  }
  catch (error)
  {
    if (isAuthError(error))
    {
      throw error
    }

    return c.json({ data: { words: [], degraded: true } })
  }
})

/** 高频遗忘词（FR-3.7：forget_events 聚合，Top 50） */
forgetRoutes.get('/forget/frequent', async (c) =>
{
  const rows = await db
    .select({
      vocId: forgetEvents.vocId,
      spelling: forgetEvents.spelling,
      count: sql<number>`count(*)::int`,
      lastDate: sql<string>`max(${forgetEvents.eventDate})::text`
    })
    .from(forgetEvents)
    .where(eq(forgetEvents.userId, c.get('userId')))
    .groupBy(forgetEvents.vocId, forgetEvents.spelling)
    .orderBy(desc(sql`count(*)`))
    .limit(50)

  return c.json({ data: { words: rows } })
})

const diagnoseSchema = z.object({
  spelling: z.string().min(1).max(64)
})

/** 遗忘原因诊断（FR-3.6：AI 固定枚举；deepseek-reasoner） */
forgetRoutes.post('/forget/diagnose', async (c) =>
{
  const userId = c.get('userId')
  const parsed = diagnoseSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供待诊断的单词')
  }

  // 学习上下文（公测不可用不阻塞诊断，仅缺数据）
  let studyCount: number | undefined
  let lastResponse: string | undefined
  let tags: string[] = []

  try
  {
    const client = await getMaimemoClient(userId)
    const records = await queryStudyRecords(client, { limit: 1000 })
    const record = records.records.find(
      (item) => item.voc_spelling.toLowerCase() === parsed.data.spelling.toLowerCase()
    )

    if (record)
    {
      studyCount = record.study_count
      lastResponse = record.last_response
      tags = record.tags
    }
  }
  catch
  {
    // 学习数据不可用时继续，上下文缺失由 prompt 容忍
  }

  const ai = new AiClient({
    apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: env.DEEPSEEK_BASE_URL
  })

  const diagnosis = await diagnoseForget(ai, {
    spelling: parsed.data.spelling,
    studyCount,
    lastResponse,
    tags
  })

  // 成本记录（7.2：每次调用写入 ai_generations）
  await db.insert(aiGenerations).values({
    userId,
    scene: 'FORGET_DIAGNOSE',
    model: 'deepseek-reasoner',
    inputDigest: `${parsed.data.spelling}|${studyCount ?? 'na'}|${tags.join(',') || 'na'}`,
    output: diagnosis
  })

  return c.json({ data: diagnosis })
})

const notepadSchema = z.object({
  words: z.array(z.string().min(1).max(64)).min(1).max(1000)
})

const STICKING_NOTEPAD_TITLE = '顽固词本'

/** 加入顽固词本（FR-3.8：find-or-create + 读改写追加，C11） */
forgetRoutes.post('/forget/notepad', async (c) =>
{
  const userId = c.get('userId')
  const parsed = notepadSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供待加入的单词列表')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowNotepad)
  {
    throw permissionDenied('加入词本需要在设置中开启「云词本」权限')
  }

  const client = await getMaimemoClient(userId)

  // find-or-create：按平台侧固定标题查找
  const notepads = await listNotepads(client)
  let target = notepads.find((item) => item.title === STICKING_NOTEPAD_TITLE)

  if (!target)
  {
    target = await createNotepad(client, {
      title: STICKING_NOTEPAD_TITLE,
      content: '',
      tags: ['STICKING']
    })
  }

  // 读改写保护（C11）：先取最新内容再追加
  const latest = await getNotepad(client, target.id)
  const existing = splitNotepadWords(latest.content)
  const seen = new Set(existing)
  let added = 0

  for (const word of parsed.data.words)
  {
    const key = word.trim().toLowerCase()

    if (key && !seen.has(key))
    {
      seen.add(key)
      existing.push(word.trim())
      added++
    }
  }

  await updateNotepad(client, target.id, {
    title: latest.title,
    content: existing.join('\n'),
    tags: latest.tags ?? []
  })

  return c.json({ data: { notepadId: target.id, added, total: existing.length } })
})

const advanceSchema = z.object({
  vocIds: z.array(z.string().min(1)).min(1).max(1000)
})

/** 提前复习（FR-3.10：C5 等级 ≥ 10，失败区分「等级不足」与「接口不可用」） */
forgetRoutes.post('/forget/advance', async (c) =>
{
  const userId = c.get('userId')
  const parsed = advanceSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供待提前复习的单词 ID')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowStudyPlan)
  {
    throw permissionDenied('提前复习需要在设置中开启「学习计划」权限')
  }

  const client = await getMaimemoClient(userId)

  try
  {
    const advancedCount = await advanceStudy(client, parsed.data.vocIds)
    return c.json({ data: { advancedCount } })
  }
  catch (error)
  {
    if (error instanceof MaimemoNetworkError)
    {
      throw maimemoUnavailable('墨墨接口暂不可用，请稍后重试')
    }

    if (error instanceof MaimemoApiError)
    {
      // C5：无法预检等级，只能失败后提示
      throw validationFailed(
        '提前复习需要墨墨账号等级 ≥ 10；可改用「加入学习计划」并选择立即复习'
      )
    }

    throw error
  }
})

/** C13 容错解析（与 notepads.ts 同规则） */
function splitNotepadWords(content: string): string[]
{
  if (!content)
  {
    return []
  }

  return content
    .split(/[\n,;，；]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /^[A-Za-z][A-Za-z'-]*$/.test(line))
}
