import { SESSION_COOKIE, verifySessionToken } from '@momo/core'
import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'

import { env } from '../../config/env.js'
import { unauthorized } from '../errors.js'

export interface AppEnv
{
  Variables:
  {
    userId: string
    clientIp: string
  }
}

/**
 * 会话校验中间件。
 *
 * 未登录返回 401（code=unauthorized）；userId 注入 context 供路由使用。
 */
export const requireSession = createMiddleware<AppEnv>(async (c, next) =>
{
  const token = getCookie(c, SESSION_COOKIE)
  const payload = verifySessionToken(token, env.SESSION_SECRET)

  if (!payload)
  {
    throw unauthorized()
  }

  c.set('userId', payload.userId)
  await next()
})
