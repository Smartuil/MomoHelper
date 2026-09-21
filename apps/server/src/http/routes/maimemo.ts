import { maimemoCredentials, userPreferences } from '@momo/db'
import { beijingToday } from '@momo/maimemo'
import { MaimemoClient, queryVocabulary } from '@momo/maimemo'
import { encryptToken } from '../../security/crypto.js'
import { db } from '../../db.js'
import { validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'

import { Hono } from 'hono'
import { eq } from 'drizzle-orm'

/**
 * 墨墨连接与权限路由（FR-1，docs 第 8.2 节）。
 *
 * AC-1.2：校验不通过的 Token 不落库；
 * AC-1.3：写入类操作在权限未开启时被拒绝（由各写入路由检查）；
 * C10：绑定成功按 7 天有效期记录 expires_at，供过期提醒。
 */
export const maimemoRoutes = new Hono<AppEnv>()

maimemoRoutes.use('*', requireSession)

/** 绑定 Token：先调墨墨验证，通过才加密落库 */
maimemoRoutes.post('/maimemo/token', async (c) =>
{
  const userId = c.get('userId')
  const body = await c.req.json<{ token?: string }>().catch(() => ({}) as never)
  const token = body.token?.trim()

  if (!token || token.length < 8)
  {
    throw validationFailed('请输入有效的墨墨 Open API Token')
  }

  // 用轻量接口验证 Token 有效性（任一鉴权接口均可）
  const probe = new MaimemoClient({ token })

  try
  {
    await queryVocabulary(probe, ['test'])
  }
  catch (error)
  {
    if (error instanceof Error && error.name === 'MaimemoAuthError')
    {
      throw validationFailed('Token 无效：墨墨返回鉴权失败，请重新获取')
    }

    // 网络等其他错误不落库，也不放行
    throw validationFailed('Token 校验失败：墨墨接口暂不可用，请稍后重试')
  }

  const encrypted = encryptToken(token, userId)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db
    .insert(maimemoCredentials)
    .values({
      userId,
      credentialType: 'MANUAL',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      tokenStatus: 'ACTIVE',
      tokenExpiresAt: expiresAt,
      lastVerifiedAt: new Date()
    })
    .onConflictDoUpdate({
      target: maimemoCredentials.userId,
      set: {
        credentialType: 'MANUAL',
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        tokenStatus: 'ACTIVE',
        tokenExpiresAt: expiresAt,
        lastVerifiedAt: new Date(),
        updatedAt: new Date()
      }
    })

  return c.json({
    data: {
      status: 'ACTIVE',
      credentialType: 'MANUAL',
      expiresAt: expiresAt.toISOString()
    }
  })
})

/** Token 状态与剩余有效期（C10 过期提醒数据源） */
maimemoRoutes.get('/maimemo/token', async (c) =>
{
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(maimemoCredentials)
    .where(eq(maimemoCredentials.userId, userId))
    .limit(1)

  const record = rows[0]

  return c.json({
    data: {
      status: record?.tokenStatus ?? 'NONE',
      credentialType: record?.credentialType ?? null,
      expiresAt: record?.tokenExpiresAt?.toISOString() ?? null,
      lastVerifiedAt: record?.lastVerifiedAt?.toISOString() ?? null
    }
  })
})

/** 解绑：物理删除凭据行（FR-1.7） */
maimemoRoutes.delete('/maimemo/token', async (c) =>
{
  const userId = c.get('userId')
  await db.delete(maimemoCredentials).where(eq(maimemoCredentials.userId, userId))
  return c.json({ data: { ok: true } })
})

/** 读写入权限 */
maimemoRoutes.get('/maimemo/permissions', async (c) =>
{
  const userId = c.get('userId')
  const pref = await ensurePreferences(userId)

  return c.json({
    data: {
      allowInterpretation: pref.allowInterpretation,
      allowPhrase: pref.allowPhrase,
      allowNote: pref.allowNote,
      allowNotepad: pref.allowNotepad,
      allowStudyPlan: pref.allowStudyPlan
    }
  })
})

/** 更新写入权限（AC-6.1 的数据源） */
maimemoRoutes.put('/maimemo/permissions', async (c) =>
{
  const userId = c.get('userId')
  const body = await c.req
    .json<{
      allowInterpretation?: boolean
      allowPhrase?: boolean
      allowNote?: boolean
      allowNotepad?: boolean
      allowStudyPlan?: boolean
    }>()
    .catch(() => ({}) as never)

  await ensurePreferences(userId)

  await db
    .update(userPreferences)
    .set({
      ...(body.allowInterpretation !== undefined
        ? { allowInterpretation: body.allowInterpretation }
        : {}),
      ...(body.allowPhrase !== undefined ? { allowPhrase: body.allowPhrase } : {}),
      ...(body.allowNote !== undefined ? { allowNote: body.allowNote } : {}),
      ...(body.allowNotepad !== undefined ? { allowNotepad: body.allowNotepad } : {}),
      ...(body.allowStudyPlan !== undefined ? { allowStudyPlan: body.allowStudyPlan } : {}),
      updatedAt: new Date()
    })
    .where(eq(userPreferences.userId, userId))

  return c.json({ data: { ok: true } })
})

/** 获取（必要时初始化）用户偏好。quota_reset_date 用北京时间今天（C4 / C14）。 */
export async function ensurePreferences(userId: string)
{
  const rows = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)

  if (rows[0])
  {
    return rows[0]
  }

  const inserted = await db
    .insert(userPreferences)
    .values({ userId, quotaResetDate: beijingToday() })
    .onConflictDoNothing()
    .returning()

  if (inserted[0])
  {
    return inserted[0]
  }

  const retry = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)

  return retry[0]!
}
