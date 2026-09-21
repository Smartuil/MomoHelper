import { decryptToken } from '../security/crypto.js'
import { env } from '../config/env.js'
import { db } from '../db.js'
import { MaimemoClient } from '@momo/maimemo'
import { maimemoCredentials } from '@momo/db'
import { eq } from 'drizzle-orm'
import { tokenInvalid } from '../http/errors.js'

/**
 * 获取当前用户的墨墨客户端。
 *
 * Token 只在服务器内存中解密（PRD 8.1：不落盘、不进日志、不下发前端）。
 * 无凭据或 Token 已标记失效时抛 401 maimemo_token_invalid。
 */
export async function getMaimemoClient(userId: string): Promise<MaimemoClient>
{
  const rows = await db
    .select()
    .from(maimemoCredentials)
    .where(eq(maimemoCredentials.userId, userId))
    .limit(1)

  const record = rows[0]

  if (!record)
  {
    throw tokenInvalid('尚未绑定墨墨 Token')
  }

  if (record.tokenStatus === 'INVALID' || record.tokenStatus === 'EXPIRED')
  {
    throw tokenInvalid()
  }

  let token: string

  try
  {
    token = decryptToken(
      {
        ciphertext: record.ciphertext,
        iv: record.iv,
        authTag: record.authTag,
        keyVersion: record.keyVersion
      },
      userId
    )
  }
  catch
  {
    throw tokenInvalid()
  }

  return new MaimemoClient({ token })
}

/** 将墨墨鉴权错误统一转译为 token_invalid（触发前端重绑引导，C10） */
export function isAuthError(error: unknown): boolean
{
  return error instanceof Error && error.name === 'MaimemoAuthError'
}
