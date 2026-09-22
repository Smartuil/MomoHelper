import { AiClient, generateDailyReview, generateReport } from '@momo/ai'
import { toBeijingDate } from '@momo/maimemo'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { db } from '../../db.js'
import { aiGenerations, dailyReviews, dailyStudySnapshots, forgetEvents, periodicReports } from '@momo/db'
import { validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'

/**
 * 复盘与报告路由（FR-12 / 13，docs 第 8.11 节）。
 * AC-12.1：当日数据不可用则拒绝生成；AC-13.1：报告必须带 dataCompleteness。
 */
export const reviewRoutes = new Hono<AppEnv>()

reviewRoutes.use('*', requireSession)

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .default(toBeijingDate(new Date()))

/** 每日复盘读取（未生成返回 null） */
reviewRoutes.get('/review/daily', async (c) =>
{
  const date = dateSchema.parse(c.req.query('date') ?? undefined)

  const rows = await db
    .select()
    .from(dailyReviews)
    .where(and(eq(dailyReviews.userId, c.get('userId')), eq(dailyReviews.reviewDate, date)))
    .limit(1)

  return c.json({ data: { date, review: rows[0] ?? null } })
})

/** 生成每日复盘（AC-12.2：唯一约束避免不一致文案，重复生成覆盖更新） */
reviewRoutes.post('/review/daily/generate', async (c) =>
{
  const userId = c.get('userId')
  const parsed = z
    .object({ date: dateSchema.optional() })
    .safeParse(await c.req.json().catch(() => null))

  const date = parsed.success && parsed.data.date ? parsed.data.date : toBeijingDate(new Date())

  // AC-12.1：当日快照不存在 → 拒绝
  const snapshotRows = await db
    .select()
    .from(dailyStudySnapshots)
    .where(
      and(eq(dailyStudySnapshots.userId, userId), eq(dailyStudySnapshots.snapshotDate, date))
    )
    .limit(1)

  const snapshot = snapshotRows[0]

  if (!snapshot)
  {
    throw validationFailed('当日没有学习数据快照，无法生成复盘')
  }

  const forgetCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(forgetEvents)
    .where(and(eq(forgetEvents.userId, userId), eq(forgetEvents.eventDate, date)))

  const metrics = {
    date,
    finished: snapshot.finished,
    total: snapshot.total,
    studyTimeMs: snapshot.studyTimeMs,
    isReliable: snapshot.isReliable,
    forgottenEvents: forgetCountRows[0]?.count ?? 0
  }

  const ai = new AiClient({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL })
  const content = await generateDailyReview(ai, metrics)

  const inserted = await db
    .insert(dailyReviews)
    .values({ userId, reviewDate: date, content, metrics })
    .onConflictDoUpdate({
      target: [dailyReviews.userId, dailyReviews.reviewDate],
      set: { content, metrics, updatedAt: new Date() }
    })
    .returning()

  await db.insert(aiGenerations).values({
    userId,
    scene: 'DAILY_REVIEW',
    model: 'deepseek-chat',
    inputDigest: `${date}|f=${snapshot.finished}/${snapshot.total}`,
    output: content
  })

  return c.json({ data: { date, review: inserted[0] } })
})

/** 周报（上周一 ~ 上周日） */
reviewRoutes.get('/reports/weekly', async (c) =>
{
  const { start, end } = lastWeekRange()
  const payload = await getOrCreateReport(c.get('userId'), 'WEEKLY', start, end)

  return c.json(payload)
})

/** 月报（上月 1 日 ~ 月末） */
reviewRoutes.get('/reports/monthly', async (c) =>
{
  const { start, end } = lastMonthRange()
  const payload = await getOrCreateReport(c.get('userId'), 'MONTHLY', start, end)

  return c.json(payload)
})

/** 供 scheduler 调用：为所有 ACTIVE 用户生成上周周报（7.7 weekly-report） */
export async function generateWeeklyReports(): Promise<void>
{
  const { start, end } = lastWeekRange()
  const rows = await db
    .selectDistinct({ userId: dailyStudySnapshots.userId })
    .from(dailyStudySnapshots)
    .where(gte(dailyStudySnapshots.snapshotDate, start))

  for (const row of rows)
  {
    try
    {
      await getOrCreateReport(row.userId, 'WEEKLY', start, end)
    }
    catch (error)
    {
      console.error(`[scheduler] weekly-report 用户 ${row.userId} 生成失败`, error)
    }
  }

  console.log(`[scheduler] weekly-report 结束，共 ${rows.length} 个用户`)
}

/* ============================= 内部实现 ============================= */

/** 上周一 ~ 上周日（北京时区） */
function lastWeekRange(): { start: string; end: string }
{
  const today = toBeijingDate(new Date())
  const todayUtcMs = new Date(`${today}T00:00:00.000+08:00`).getTime()
  const weekday = (new Date(todayUtcMs).getUTCDay() + 6) % 7 // 周一=0

  const mondayThisWeek = todayUtcMs - weekday * 86_400_000

  return {
    start: toBeijingDate(new Date(mondayThisWeek - 7 * 86_400_000)),
    end: toBeijingDate(new Date(mondayThisWeek - 86_400_000))
  }
}

/** 上月 1 日 ~ 月末（北京时区） */
function lastMonthRange(): { start: string; end: string }
{
  const today = toBeijingDate(new Date())
  const firstOfThisMonthMs = new Date(`${today.slice(0, 7)}-01T00:00:00.000+08:00`).getTime()
  const firstOfLastMonth = toBeijingDate(new Date(firstOfThisMonthMs - 86_400_000)).slice(0, 8) + '01'
  const lastOfLastMonth = toBeijingDate(new Date(firstOfThisMonthMs - 86_400_000))

  return { start: firstOfLastMonth, end: lastOfLastMonth }
}

/** 报告读取或生成（快照完整度 < 0.7 时 UI 需提示，AC-13.1） */
async function getOrCreateReport(
  userId: string,
  periodType: 'WEEKLY' | 'MONTHLY',
  start: string,
  end: string
): Promise<{ data: object }>
{
  const existing = await db
    .select()
    .from(periodicReports)
    .where(
      and(
        eq(periodicReports.userId, userId),
        eq(periodicReports.periodType, periodType),
        eq(periodicReports.periodStart, start)
      )
    )
    .limit(1)

  if (existing[0])
  {
    return reportPayload(existing[0])
  }

  const snapshots = await db
    .select()
    .from(dailyStudySnapshots)
    .where(
      and(
        eq(dailyStudySnapshots.userId, userId),
        gte(dailyStudySnapshots.snapshotDate, start),
        lte(dailyStudySnapshots.snapshotDate, end)
      )
    )
    .orderBy(asc(dailyStudySnapshots.snapshotDate))

  const periodDays = Math.round(
    (new Date(`${end}T00:00:00.000+08:00`).getTime() -
      new Date(`${start}T00:00:00.000+08:00`).getTime()) /
      86_400_000
  ) + 1

  const reliableDays = snapshots.filter((row) => row.isReliable).length
  const completeness = Math.round((reliableDays / periodDays) * 100) / 100

  const bestDay = snapshots.reduce<{ date: string; finished: number } | null>(
    (best, row) =>
      best === null || row.finished > best.finished
        ? { date: row.snapshotDate, finished: row.finished }
        : best,
    null
  )

  const metrics = {
    periodType,
    start,
    end,
    finished: snapshots.reduce((sum, row) => sum + row.finished, 0),
    studyTimeMs: snapshots.reduce((sum, row) => sum + row.studyTimeMs, 0),
    daysWithData: snapshots.length,
    periodDays,
    reliableDays,
    bestDay
  }

  const ai = new AiClient({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL })
  const content = await generateReport(ai, metrics)

  const inserted = await db
    .insert(periodicReports)
    .values({
      userId,
      periodType,
      periodStart: start,
      periodEnd: end,
      content,
      dataCompleteness: completeness.toFixed(2)
    })
    .onConflictDoUpdate({
      target: [periodicReports.userId, periodicReports.periodType, periodicReports.periodStart],
      set: { content, dataCompleteness: completeness.toFixed(2), updatedAt: new Date() }
    })
    .returning()

  await db.insert(aiGenerations).values({
    userId,
    scene: `${periodType}_REPORT`,
    model: 'deepseek-chat',
    inputDigest: `${start}~${end}|days=${snapshots.length}`,
    output: content
  })

  return reportPayload(inserted[0]!)
}

function reportPayload(report: typeof periodicReports.$inferSelect): { data: object }
{
  return {
    data: {
      report,
      dataCompleteness: Number(report.dataCompleteness)
    }
  }
}
