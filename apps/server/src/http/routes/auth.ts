import { users } from '@momo/db'
import { createSessionToken, SESSION_COOKIE } from '@momo/core'
import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'

import { env } from '../../config/env.js'
import { db } from '../../db.js'
import { validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'

/**
 * 认证路由（FR-1 前置）。
 *
 * 微信登录资质到位前，MVP 提供开发登录（DEV_LOGIN=true 时开放）；
 * users 表已预留 unionid / openid / maimemo_sub 字段，后续增量接入。
 */
export const authRoutes = new Hono<AppEnv>()

authRoutes.post('/auth/dev', async (c) =>
{
  if (env.NODE_ENV === 'production' && !env.DEV_LOGIN)
  {
    throw validationFailed('开发登录未开启')
  }

  const body = await c.req.json<{ nickname?: string }>().catch(() => ({}) as never)
  const nickname = body.nickname?.slice(0, 32) || '开发者'

  const result = await db
    .insert(users)
    .values({ nickname, openIdWeb: `dev-${nickname}` })
    .onConflictDoNothing()
    .returning()

  let user = result[0]

  if (!user)
  {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.openIdWeb, `dev-${nickname}`))
      .limit(1)

    user = existing[0]
  }

  if (!user)
  {
    throw validationFailed('登录失败，请重试')
  }

  const token = createSessionToken(user.id, env.SESSION_SECRET)

  // Cookie 不写死 domain（约定 4.3.4），跟随当前域名；
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  })

  return c.json({ data: { userId: user.id, nickname: user.nickname } })
})

authRoutes.post('/auth/logout', (c) =>
{
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ data: { ok: true } })
})

authRoutes.get('/auth/me', requireSession, async (c) =>
{
  const userId = c.get('userId')
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  const user = rows[0]

  return c.json({
    data: {
      userId,
      nickname: user?.nickname ?? null,
      avatarUrl: user?.avatarUrl ?? null
    }
  })
})
