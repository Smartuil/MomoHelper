import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 会话签名（HMAC-SHA256）。
 *
 * Cookie 不写死 domain（约定 4.3.4），签名密钥只来自 SESSION_SECRET。
 * MVP 阶段账号体系用签名会话；微信登录（unionid / openid）在有资质后接入，
 * users 表字段已预留。
 */

export const SESSION_COOKIE = 'momo_session'

export interface SessionPayload
{
  userId: string
  /** 过期时间（Unix 毫秒） */
  exp: number
}

export function createSessionToken(userId: string, secret: string, ttlDays = 30): string
{
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000
  }

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = sign(body, secret)

  return `${body}.${sig}`
}

export function verifySessionToken(token: string | undefined, secret: string): SessionPayload | null
{
  if (!token)
  {
    return null
  }

  const dot = token.lastIndexOf('.')

  if (dot <= 0)
  {
    return null
  }

  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expected = sign(body, secret)
  const actual = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)

  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf))
  {
    return null
  }

  try
  {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload

    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number')
    {
      return null
    }

    if (payload.exp < Date.now())
    {
      return null
    }

    return payload
  }
  catch
  {
    return null
  }
}

function sign(body: string, secret: string): string
{
  return createHmac('sha256', secret).update(body).digest('base64url')
}
