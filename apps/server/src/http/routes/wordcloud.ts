import { getTodayItems, queryStudyRecords } from '@momo/maimemo'
import { Hono } from 'hono'
import { z } from 'zod'

import { validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { getMaimemoClient, isAuthError } from '../../services/maimemo-client.js'

/**
 * 词云路由（FR-16 基础版 T32 + 首字母结构视角，docs 第 8.12 节）。
 * AC-16.1：必须带 totalScanned；AC-16.5：截断必须标注；AC-16.2：必须带图例。
 */
export const wordcloudRoutes = new Hono<AppEnv>()

wordcloudRoutes.use('*', requireSession)

const TOP_N = 100

wordcloudRoutes.get('/wordcloud', async (c) =>
{
  const view = z
    .enum(['DIFFICULTY', 'PROGRESS', 'STRUCTURE'])
    .default('DIFFICULTY')
    .parse(c.req.query('view') ?? undefined)

  const range = z
    .enum(['TODAY', 'DAYS_7', 'DAYS_30', 'ALL'])
    .default('DAYS_7')
    .parse(c.req.query('range') ?? undefined)

  const groupBy = z
    .enum(['INITIAL', 'THEME', 'ROOT'])
    .default('INITIAL')
    .parse(c.req.query('groupBy') ?? undefined)

  if (view === 'STRUCTURE' && groupBy !== 'INITIAL')
  {
    throw validationFailed('主题 / 词根分组需要 AI 语义归类，将在后续版本提供')
  }

  const client = await getMaimemoClient(c.get('userId'))

  try
  {
    if (view === 'PROGRESS' || view === 'DIFFICULTY' || view === 'STRUCTURE')
    {
      // TODAY 视角：今日词表作答（首答状态即当日状态）
      if (range === 'TODAY')
      {
        const items = await getTodayItems(client)
        const words = items.map((item) => ({
          text: item.voc_spelling,
          weight: 1,
          state:
            item.first_response === 'FORGET'
              ? 'forget'
              : item.first_response === 'VAGUE'
                ? 'vague'
                : item.is_finished
                  ? 'familiar'
                  : 'neutral',
          ...(view === 'STRUCTURE' ? { group: initialGroup(item.voc_spelling) } : {})
        }))

        return c.json(
          buildResponse(view, words, items.length)
        )
      }

      // 其余区间：单词级学习记录（C3：无按天序列，weight 取累计学习次数）
      const result = await queryStudyRecords(client, { limit: 1000 })
      const words = result.records.map((record) => ({
        text: record.voc_spelling,
        weight: record.study_count,
        state: record.tags.includes('STICKING')
          ? 'forget'
          : record.tags.includes('WELL_FAMILIAR')
            ? 'familiar'
            : record.last_response === 'FORGET'
              ? 'forget'
              : record.last_response === 'VAGUE'
                ? 'vague'
                : 'familiar',
        ...(view === 'STRUCTURE' ? { group: initialGroup(record.voc_spelling) } : {})
      }))

      return c.json(buildResponse(view, words, result.records.length))
    }

    throw new Error('unreachable')
  }
  catch (error)
  {
    if (isAuthError(error))
    {
      throw error
    }

    if (error instanceof Error && error.name === 'MaimemoStudyUnavailableError')
    {
      return c.json({ data: { view, words: [], totalScanned: 0, truncated: false, legend: LEGEND, degraded: true } })
    }

    throw error
  }
})

const LEGEND = {
  size: '标签大小 = 学习次数（权重）',
  color: '红 = 遗忘 / 顽固，黄 = 模糊，绿 = 熟悉，灰 = 未作答'
}

function buildResponse(
  view: string,
  words: { text: string; weight: number; state: string; group?: string }[],
  totalScanned: number
): { data: object }
{
  // 按权重取 Top N（AC-16.5）
  const sorted = [...words].sort((a, b) => b.weight - a.weight)
  const truncated = sorted.length > TOP_N
  const top = sorted.slice(0, TOP_N).map((word) => ({
    ...word,
    ...(view === 'STRUCTURE' ? { group: word.group ?? initialGroup(word.text) } : {})
  }))

  return {
    data: {
      view,
      words: top,
      totalScanned,
      truncated,
      legend: LEGEND
    }
  }
}

function initialGroup(spelling: string): string
{
  const letter = spelling[0]?.toUpperCase() ?? '#'

  return /^[A-Z]$/.test(letter) ? letter : '#'
}
