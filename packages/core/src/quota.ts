import { eq, sql } from 'drizzle-orm'

import type { Db } from '@momo/db'
import { userPreferences } from '@momo/db'

/**
 * 每日配额记账（C4：释义 + 例句 + 助记合计每天最多 600 条）。
 *
 * 校验与扣减必须原子（事务 + FOR UPDATE 行锁），
 * 否则并发任务会超配额写入墨墨（AC-I）。
 */

export const DAILY_QUOTA_LIMIT = 600

export class QuotaExceededError extends Error
{
  readonly used: number
  readonly limit: number

  constructor(used: number, limit: number)
  {
    super(`今日配额已用尽（${used}/${limit}），剩余任务将于明日执行`)
    this.name = 'QuotaExceededError'
    this.used = used
    this.limit = limit
  }
}

export interface QuotaState
{
  quotaDate: string
  used: number
  limit: number
  remaining: number
}

/** 读取（必要时先初始化）用户偏好行并返回配额状态 */
export async function getQuotaState(db: Db, userId: string, beijingToday: string): Promise<QuotaState>
{
  return db.transaction(async (tx) =>
  {
    const rows = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .for('update')

    let pref = rows[0]

    if (!pref)
    {
      const inserted = await tx
        .insert(userPreferences)
        .values({ userId, quotaResetDate: beijingToday })
        .returning()

      pref = inserted[0]!
    }

    const used = pref.quotaResetDate === beijingToday ? pref.dailyQuotaUsed : 0

    return {
      quotaDate: beijingToday,
      used,
      limit: DAILY_QUOTA_LIMIT,
      remaining: Math.max(0, DAILY_QUOTA_LIMIT - used)
    }
  })
}

/**
 * 原子扣减配额。跨天先重置；不足时抛 QuotaExceededError，不部分扣减。
 */
export async function consumeQuota(
  db: Db,
  userId: string,
  count: number,
  beijingToday: string
): Promise<QuotaState>
{
  return db.transaction(async (tx) =>
  {
    const rows = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .for('update')

    let pref = rows[0]

    if (!pref)
    {
      const inserted = await tx
        .insert(userPreferences)
        .values({ userId, quotaResetDate: beijingToday })
        .returning()

      pref = inserted[0]!
    }

    // 跨天重置（C4 按北京时间自然日）
    const used = pref.quotaResetDate === beijingToday ? pref.dailyQuotaUsed : 0

    if (used + count > DAILY_QUOTA_LIMIT)
    {
      throw new QuotaExceededError(used, DAILY_QUOTA_LIMIT)
    }

    await tx
      .update(userPreferences)
      .set({
        dailyQuotaUsed: used + count,
        quotaResetDate: beijingToday,
        updatedAt: sql`now()`
      })
      .where(eq(userPreferences.userId, userId))

    const nextUsed = used + count

    return {
      quotaDate: beijingToday,
      used: nextUsed,
      limit: DAILY_QUOTA_LIMIT,
      remaining: Math.max(0, DAILY_QUOTA_LIMIT - nextUsed)
    }
  })
}
