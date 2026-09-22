import type { FocusWordDto } from '@momo/types'
import { queryStudyRecords } from '@momo/maimemo'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { getDashboardHistory, getDashboardToday, getTodayForgotten } from '../../services/dashboard.js'
import { getMaimemoClient, isAuthError } from '../../services/maimemo-client.js'

/**
 * 今日看板与遗忘词路由（FR-2 / FR-3，docs 第 8.3 / 8.4 节）。
 */
export const dashboardRoutes = new Hono<AppEnv>()

dashboardRoutes.use('*', requireSession)

dashboardRoutes.get('/dashboard/today', async (c) =>
{
  const userId = c.get('userId')
  const client = await getMaimemoClient(userId)

  const dto = await getDashboardToday(client, userId)
  return c.json({ data: dto })
})

/** 学习趋势（近 N 天快照序列；纯本地数据，不调墨墨） */
dashboardRoutes.get('/dashboard/history', async (c) =>
{
  const days = z.coerce.number().int().min(7).max(60).default(14).parse(
    c.req.query('days') ?? undefined
  )

  const dto = await getDashboardHistory(c.get('userId'), days)
  return c.json({ data: dto })
})

/** 强制刷新（跳过缓存语义上等同于实时拉取） */
dashboardRoutes.post('/dashboard/refresh', async (c) =>
{
  const userId = c.get('userId')
  const client = await getMaimemoClient(userId)

  const dto = await getDashboardToday(client, userId)
  return c.json({ data: dto })
})

/** 今日遗忘词（FR-3.1） */
dashboardRoutes.get('/forget/today', async (c) =>
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

/** 顽固词（FR-3.5：tags 含 STICKING；学习记录接口公测同样需降级） */
dashboardRoutes.get('/forget/sticking', async (c) =>
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
