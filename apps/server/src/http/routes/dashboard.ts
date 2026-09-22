import { Hono } from 'hono'
import { z } from 'zod'

import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { getDashboardHistory, getDashboardToday } from '../../services/dashboard.js'
import { getMaimemoClient } from '../../services/maimemo-client.js'

/**
 * 今日看板路由（FR-2 / FR-15.1，docs 第 8.3 节）。遗忘词域见 forget.ts。
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

