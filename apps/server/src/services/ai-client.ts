import { AiClient } from '@momo/ai'
import { aiCredentials } from '@momo/db'
import { eq } from 'drizzle-orm'

import { env } from '../config/env.js'
import { db } from '../db.js'
import { aiKeyMissing } from '../http/errors.js'
import { decryptScopedSecret } from '../security/crypto.js'

/**
 * AI 客户端解析层（唯一出口）。
 *
 * 取 Key 的优先级：用户自带（ai_credentials） → 服务器 .env。
 * 所有调用点都必须经这里，禁止再直接读 env.DEEPSEEK_API_KEY，
 * 否则「设置页填了 Key 却不生效」这类问题会反复出现。
 *
 * Key 只在服务器内存中解密，绝不下发前端（约定 14.3）。
 */

export interface ResolvedAi
{
  client: AiClient
  /** USER：用户自带；SERVER：服务器 .env 兜底 */
  source: 'USER' | 'SERVER'
  baseUrl: string
  keyHint: string | null
  lastVerifiedAt: Date | null
}

/** 服务器 .env 里的 Key（空串视为未配置，避免部署时留空值误判为已配置） */
function serverKey(): string | null
{
  const key = env.DEEPSEEK_API_KEY?.trim()
  return key ? key : null
}

export function isServerKeyConfigured(): boolean
{
  return serverKey() !== null
}

/** 读取用户保存的 AI 凭据（不解密），供设置页展示状态 */
export async function getAiCredential(userId: string)
{
  const rows = await db
    .select()
    .from(aiCredentials)
    .where(eq(aiCredentials.userId, userId))
    .limit(1)

  return rows[0] ?? null
}

/** 解析当前用户可用的 AI 客户端；两者都没有时抛 ai_key_missing 引导去设置页 */
export async function resolveAi(userId: string): Promise<ResolvedAi>
{
  const record = await getAiCredential(userId)

  if (record)
  {
    let apiKey: string

    try
    {
      apiKey = decryptScopedSecret(
        {
          ciphertext: record.ciphertext,
          iv: record.iv,
          authTag: record.authTag,
          keyVersion: record.keyVersion
        },
        userId,
        'ai'
      )
    }
    catch
    {
      // 主密钥轮换或密文被篡改：只能让用户重填，不做任何静默降级
      throw aiKeyMissing('已保存的 AI Key 无法解密，请在设置中重新填写')
    }

    const baseUrl = record.baseUrl?.trim() || env.DEEPSEEK_BASE_URL

    return {
      client: new AiClient({ apiKey, baseUrl }),
      source: 'USER',
      baseUrl,
      keyHint: record.keyHint,
      lastVerifiedAt: record.lastVerifiedAt
    }
  }

  const fallbackKey = serverKey()

  if (!fallbackKey)
  {
    throw aiKeyMissing()
  }

  return {
    client: new AiClient({ apiKey: fallbackKey, baseUrl: env.DEEPSEEK_BASE_URL }),
    source: 'SERVER',
    baseUrl: env.DEEPSEEK_BASE_URL,
    keyHint: null,
    lastVerifiedAt: null
  }
}

/** 大多数调用点只关心客户端本身 */
export async function resolveAiClient(userId: string): Promise<AiClient>
{
  const resolved = await resolveAi(userId)
  return resolved.client
}
