import { AiAuthError, AiClient, AiUnavailableError } from '@momo/ai'
import { getQuotaState } from '@momo/core'
import { aiCredentials } from '@momo/db'
import { beijingToday } from '@momo/maimemo'
import { Hono } from 'hono'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { db } from '../../db.js'
import { encryptScopedSecret, hintKey } from '../../security/crypto.js'
import { isServerKeyConfigured } from '../../services/ai-client.js'
import { validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'

import { eq } from 'drizzle-orm'

/**
 * 系统状态与设置路由（docs 第 8.13 节）。
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

/**
 * AI 服务配置（BYOK）。
 *
 * 用户可自带 DeepSeek Key；不填则回落到服务器 .env。
 * 明文 Key 只在内存与密文中存在：读接口只回 hint（末 4 位），
 * 绝不把完整 Key 回传前端（约定 14.3）。
 */
const aiConfigSchema = z.object({
  apiKey: z.string().trim().min(8, 'Key 长度不足').max(300, 'Key 过长'),
  /** 允许自建代理；留空表示跟随服务器 DEEPSEEK_BASE_URL */
  baseUrl: z.union([z.literal(''), z.string().trim().url('接入点必须是合法 URL')]).optional()
})

/** 组装前端可见的配置快照（不含任何明文） */
function toDto(record: {
  provider: string
  baseUrl: string | null
  keyHint: string | null
  lastVerifiedAt: Date | null
} | null)
{
  return {
    source: record ? ('USER' as const) : isServerKeyConfigured() ? ('SERVER' as const) : ('NONE' as const),
    provider: record?.provider ?? 'DEEPSEEK',
    baseUrl: record?.baseUrl ?? null,
    keyHint: record?.keyHint ?? null,
    lastVerifiedAt: record?.lastVerifiedAt?.toISOString() ?? null,
    envConfigured: isServerKeyConfigured(),
    effectiveBaseUrl: record?.baseUrl?.trim() || env.DEEPSEEK_BASE_URL,
    models: { chat: 'deepseek-chat', reasoner: 'deepseek-reasoner' }
  }
}

systemRoutes.get('/system/ai', async (c) =>
{
  const userId = c.get('userId')
  const rows = await db.select().from(aiCredentials).where(eq(aiCredentials.userId, userId)).limit(1)

  return c.json({ data: toDto(rows[0] ?? null) })
})

/** 保存个人 Key：先探测可用性，通过才落库（校验失败不覆盖旧 Key） */
systemRoutes.put('/system/ai', async (c) =>
{
  const userId = c.get('userId')
  const parsed = aiConfigSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed(parsed.error.issues[0]?.message ?? '请填写有效的 DeepSeek API Key')
  }

  const apiKey = parsed.data.apiKey
  const baseUrl = parsed.data.baseUrl?.trim() || null
  const probe = new AiClient({ apiKey, baseUrl: baseUrl ?? env.DEEPSEEK_BASE_URL })

  try
  {
    await probe.verify()
  }
  catch (error)
  {
    if (error instanceof AiAuthError)
    {
      throw validationFailed('API Key 无效：AI 服务返回鉴权失败')
    }

    if (error instanceof AiUnavailableError)
    {
      throw validationFailed('校验失败：AI 服务暂不可用，请稍后重试')
    }

    throw validationFailed('校验失败：无法连接 AI 服务')
  }

  const encrypted = encryptScopedSecret(apiKey, userId, 'ai')
  const verifiedAt = new Date()

  await db
    .insert(aiCredentials)
    .values({
      userId,
      provider: 'DEEPSEEK',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      baseUrl,
      keyHint: hintKey(apiKey),
      lastVerifiedAt: verifiedAt
    })
    .onConflictDoUpdate({
      target: aiCredentials.userId,
      set: {
        provider: 'DEEPSEEK',
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        baseUrl,
        keyHint: hintKey(apiKey),
        lastVerifiedAt: verifiedAt,
        updatedAt: verifiedAt
      }
    })

  return c.json({
    data: toDto({
      provider: 'DEEPSEEK',
      baseUrl,
      keyHint: hintKey(apiKey),
      lastVerifiedAt: verifiedAt
    })
  })
})

/** 清除个人 Key，回落到服务器配置（没有则 AI 功能不可用） */
systemRoutes.delete('/system/ai', async (c) =>
{
  const userId = c.get('userId')

  await db.delete(aiCredentials).where(eq(aiCredentials.userId, userId))

  return c.json({ data: toDto(null) })
})
