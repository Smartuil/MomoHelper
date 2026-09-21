import { getQuotaState } from '@momo/core'
import { beijingToday } from '@momo/maimemo'
import { Hono } from 'hono'

import { db } from '../../db.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'

/**
 * 系统状态路由（docs 第 8.13 节）。
 */
export const systemRoutes = new Hono<AppEnv>()

systemRoutes.use('*', requireSession)

/** 当日配额使用情况（NFR-5.2：配额使用对用户透明） */
systemRoutes.get('/system/quota', async (c) =>
{
  const userId = c.get('userId')
  const state = await getQuotaState(db, userId, beijingToday())

  return c.json({ data: state })
})
