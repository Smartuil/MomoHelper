import { AiClient, generatePlanAdvice } from '@momo/ai'
import { addWords, queryStudyRecords, queryVocabulary, toBeijingDate } from '@momo/maimemo'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { db } from '../../db.js'
import { aiGenerations, dailyStudySnapshots } from '@momo/db'
import { permissionDenied, validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { ensurePreferences } from './maimemo.js'
import { getMaimemoClient } from '../../services/maimemo-client.js'

/**
 * 学习计划辅助路由（FR-11，docs 第 8.10 节）。
 * AC-11.2：AI 建议必须附带数据依据，不得只给结论。
 */
export const planRoutes = new Hono<AppEnv>()

planRoutes.use('*', requireSession)

/** 计划总词数（as_count，C3 实测字段） */
planRoutes.get('/plan/summary', async (c) =>
{
  const client = await getMaimemoClient(c.get('userId'))

  try
  {
    const result = await queryStudyRecords(client, { asCount: true })
    return c.json({ data: { total: result.count ?? 0 } })
  }
  catch (error)
  {
    if (error instanceof Error && error.name === 'MaimemoStudyUnavailableError')
    {
      return c.json({ data: { total: null, degraded: true } })
    }

    throw error
  }
})

/** 未来复习压力：按天 as_count 查询 next_study_date 落在当日窗口的词数 */
planRoutes.get('/plan/pressure', async (c) =>
{
  const days = z.coerce.number().int().min(7).max(30).default(7).parse(
    c.req.query('days') ?? undefined
  )

  const client = await getMaimemoClient(c.get('userId'))
  const out: { date: string; count: number }[] = []

  for (let i = 0; i < days; i++)
  {
    const date = toBeijingDate(new Date(Date.now() + i * 86_400_000))
    const startUtc = new Date(`${date}T00:00:00.000+08:00`)
    const endUtc = new Date(startUtc.getTime() + 86_400_000)

    try
    {
      const result = await queryStudyRecords(client, {
        nextStudyDateStart: startUtc.toISOString(),
        nextStudyDateEnd: endUtc.toISOString(),
        asCount: true
      })

      out.push({ date, count: result.count ?? 0 })
    }
    catch (error)
    {
      if (error instanceof Error && error.name === 'MaimemoStudyUnavailableError')
      {
        return c.json({ data: { days: [], degraded: true } })
      }

      throw error
    }
  }

  return c.json({ data: { days: out } })
})

/** AI 学习建议（AC-11.2：附带数据依据） */
planRoutes.get('/plan/advice', async (c) =>
{
  const userId = c.get('userId')
  const client = await getMaimemoClient(userId)

  // 汇总真实数据
  let totalWords = 0

  try
  {
    const result = await queryStudyRecords(client, { asCount: true })
    totalWords = result.count ?? 0
  }
  catch
  {
    // 学习数据不可用时按 0 继续
  }

  const pressure: { date: string; count: number }[] = []

  for (let i = 0; i < 7; i++)
  {
    const date = toBeijingDate(new Date(Date.now() + i * 86_400_000))
    const startUtc = new Date(`${date}T00:00:00.000+08:00`)

    try
    {
      const result = await queryStudyRecords(client, {
        nextStudyDateStart: startUtc.toISOString(),
        nextStudyDateEnd: new Date(startUtc.getTime() + 86_400_000).toISOString(),
        asCount: true
      })

      pressure.push({ date, count: result.count ?? 0 })
    }
    catch
    {
      pressure.push({ date, count: 0 })
    }
  }

  const snapshots = await db
    .select()
    .from(dailyStudySnapshots)
    .where(eq(dailyStudySnapshots.userId, userId))
    .orderBy(desc(dailyStudySnapshots.snapshotDate))
    .limit(7)

  const recentFinished = snapshots
    .reverse()
    .map((row) => ({ date: row.snapshotDate, finished: row.finished }))

  const advice = await generatePlanAdvice(
    new AiClient({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL }),
    { totalWords, pressure, recentFinished }
  )

  await db.insert(aiGenerations).values({
    userId,
    scene: 'PLAN_ADVICE',
    model: 'deepseek-chat',
    inputDigest: `total=${totalWords}|pressure=${pressure.map((p) => p.count).join(',')}`,
    output: advice
  })

  // 数据依据：来自真实查询的结论（AC-11.2）
  const basis = [
    `计划总词数 ${totalWords}`,
    pressure.length > 0
      ? `未来 7 天复习量 ${pressure.reduce((sum, p) => sum + p.count, 0)} 词，峰值 ${Math.max(...pressure.map((p) => p.count))} 词`
      : '未来 7 天暂无到期复习数据',
    recentFinished.length > 0
      ? `近 ${recentFinished.length} 天日均完成 ${Math.round(recentFinished.reduce((sum, p) => sum + p.finished, 0) / recentFinished.length)} 词`
      : '暂无近期完成记录'
  ]

  return c.json({ data: { advice: advice.advice, basis } })
})

const addReviewSchema = z.object({
  spellings: z.array(z.string().min(1).max(64)).min(1).max(1000)
})

/** 加词并立即复习（FR-11.8：add_words advance，不受 C5 等级限制） */
planRoutes.post('/plan/add-and-review', async (c) =>
{
  const userId = c.get('userId')
  const parsed = addReviewSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供待加入的单词列表')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowStudyPlan)
  {
    throw permissionDenied('加入学习计划需要在设置中开启「学习计划」权限')
  }

  const client = await getMaimemoClient(userId)
  const vocabMap = await queryVocabulary(client, parsed.data.spellings)
  const resolved = parsed.data.spellings
    .map((spelling) => vocabMap.get(spelling.trim().toLowerCase()))
    .filter((voc): voc is NonNullable<typeof voc> => voc !== null)

  if (resolved.length === 0)
  {
    throw validationFailed('提交的单词均不在墨墨词库中')
  }

  const addedCount = await addWords(client, {
    words: resolved.map((voc) => ({ id: voc.id })),
    advance: true
  })

  return c.json({
    data: {
      addedCount,
      resolvedCount: resolved.length,
      unknownSpellings: parsed.data.spellings.length - resolved.length
    }
  })
})
