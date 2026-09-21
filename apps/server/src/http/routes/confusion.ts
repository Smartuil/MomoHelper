import { analyzeConfusion } from '@momo/ai'
import type { ConfusionResult } from '@momo/ai'
import type { FocusWordDto } from '@momo/types'
import { findSimilarWords } from '@momo/core'
import { AiClient } from '@momo/ai'
import { getTodayItems, queryStudyRecords } from '@momo/maimemo'
import { Hono } from 'hono'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { db } from '../../db.js'
import { confusionGroups } from '@momo/db'
import { validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { getMaimemoClient, isAuthError } from '../../services/maimemo-client.js'

/**
 * 易混词诊断路由（FR-4，docs 第 8.5 节）。
 *
 * C6：墨墨无相似词数据，形近词由本地编辑距离在已知词集合内计算，
 * 响应必须带 scannedWordCount（AC-4.3），UI 说明覆盖范围。
 */
export const confusionRoutes = new Hono<AppEnv>()

confusionRoutes.use('*', requireSession)

/** 收集已知词集合：今日词表 + 学习记录（公测失败时只用今日词表） */
async function collectKnownWords(userId: string): Promise<{ words: string[]; degraded: boolean }>
{
  const client = await getMaimemoClient(userId)

  try
  {
    const [items, records] = await Promise.all([
      getTodayItems(client),
      queryStudyRecords(client, { limit: 1000 })
    ])

    const words = [
      ...items.map((item) => item.voc_spelling),
      ...records.records.map((record) => record.voc_spelling)
    ]

    return { words, degraded: false }
  }
  catch (error)
  {
    if (isAuthError(error))
    {
      throw error
    }

    const items = await getTodayItems(client).catch(() => [])
    return { words: items.map((item) => item.voc_spelling), degraded: true }
  }
}

/** 形近词候选（本地编辑距离，FR-4.1 ~ FR-4.3） */
confusionRoutes.get('/confusion/candidates', async (c) =>
{
  const userId = c.get('userId')
  const maxDistance = Math.min(Number(c.req.query('maxDistance') ?? 1), 2)

  const { words, degraded } = await collectKnownWords(userId)
  const pairs = findSimilarWords(words, maxDistance)

  return c.json({
    data: {
      scannedWordCount: new Set(words).size,
      degraded,
      pairs
    }
  })
})

const analyzeSchema = z.object({
  words: z.array(z.string().min(1)).min(2).max(5)
})

/** AI 对比分析（FR-4.7 / FR-4.8：对比解释 + 最小对比例句） */
confusionRoutes.post('/confusion/analyze', async (c) =>
{
  const userId = c.get('userId')
  const parsed = analyzeSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('需要提供 2~5 个待对比的单词')
  }

  const ai = new AiClient({
    apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: env.DEEPSEEK_BASE_URL
  })

  let result: ConfusionResult

  try
  {
    result = await analyzeConfusion(ai, parsed.data.words)
  }
  catch (error)
  {
    // AI 输出两次校验失败或接口异常时给出可读错误（NFR-4.3）
    throw validationFailed(
      `AI 分析暂时不可用：${error instanceof Error ? error.message.slice(0, 120) : '未知错误'}`
    )
  }

  // 累积易混词组（周报「最常混淆词组」的数据源，api-capability-gap 第五节 4）
  await db
    .insert(confusionGroups)
    .values({
      userId,
      words: parsed.data.words,
      source: 'AI'
    })
    .onConflictDoNothing()

  return c.json({ data: result })
})

/** 今日遗忘 + 易混候选一次取齐（看板「需要关注」列表用，FR-2.10 P1 可后接） */
confusionRoutes.get('/confusion/focus', async (c) =>
{
  const userId = c.get('userId')
  const client = await getMaimemoClient(userId)

  let words: FocusWordDto[] = []

  try
  {
    const items = await getTodayItems(client)
    words = items
      .filter((item) => !item.is_finished || item.first_response === 'FORGET')
      .map((item) => ({
        vocId: item.voc_id,
        spelling: item.voc_spelling,
        isNew: item.is_new,
        firstResponse: item.first_response,
        tags: []
      }))
  }
  catch (error)
  {
    if (isAuthError(error))
    {
      throw error
    }
  }

  return c.json({ data: { words } })
})
