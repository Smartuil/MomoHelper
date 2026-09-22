import type { DashboardTodayDto, FocusWordDto } from '@momo/types'
import { beijingToday } from '@momo/maimemo'
import { getStudyProgress, getTodayItems } from '@momo/maimemo'
import type { MaimemoClient } from '@momo/maimemo'
import { dailyStudySnapshots, forgetEvents } from '@momo/db'
import { desc, eq } from 'drizzle-orm'

import { db } from '../db.js'

/**
 * 今日看板（FR-2）+ 每日快照（FR-15.1）+ 遗忘事件累积（FR-15.5）。
 *
 * C2：学习数据接口公测不可用时降级为最近一次快照，dataReliable=false；
 * C3：无历史序列，快照表是趋势功能的唯一数据源，实时拉取成功时顺带落快照。
 */
export async function getDashboardToday(
  client: MaimemoClient,
  userId: string
): Promise<DashboardTodayDto>
{
  try
  {
    const [progress, items] = await Promise.all([
      getStudyProgress(client),
      getTodayItems(client)
    ])

    const today = beijingToday()

    const newWords = items.filter((item) => item.is_new).length
    const reviewWords = items.filter((item) => !item.is_new).length
    const unfinishedWords = items.filter((item) => !item.is_finished).length
    const forgottenWords = items.filter(
      (item) => item.is_finished && item.first_response === 'FORGET'
    ).length

    const dto: DashboardTodayDto = {
      total: progress.total,
      finished: progress.finished,
      remaining: Math.max(0, progress.total - progress.finished),
      studyTimeMs: progress.study_time,
      completionRate: progress.total === 0 ? null : progress.finished / progress.total,
      newWords,
      reviewWords,
      unfinishedWords,
      forgottenWords,
      dataReliable: true,
      capturedAt: new Date().toISOString()
    }

    // 成功拉取即落快照（upsert 到北京时间当日，FR-15.1）
    await db
      .insert(dailyStudySnapshots)
      .values({
        userId,
        snapshotDate: today,
        finished: progress.finished,
        total: progress.total,
        studyTimeMs: progress.study_time,
        isReliable: true,
        capturedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [dailyStudySnapshots.userId, dailyStudySnapshots.snapshotDate],
        set: {
          finished: progress.finished,
          total: progress.total,
          studyTimeMs: progress.study_time,
          isReliable: true,
          capturedAt: new Date(),
          updatedAt: new Date()
        }
      })

    // 遗忘事件累积（FR-15.5：词云难度视角与高频遗忘词的数据源）
    const forgotten = items.filter(
      (item) => item.is_finished && item.first_response === 'FORGET'
    )

    if (forgotten.length > 0)
    {
      await db
        .insert(forgetEvents)
        .values(
          forgotten.map((item) => ({
            userId,
            vocId: item.voc_id,
            spelling: item.voc_spelling,
            eventDate: today,
            response: 'FORGET',
            source: 'TODAY_ITEMS'
          }))
        )
        .onConflictDoNothing()
    }

    return dto
  }
  catch (error)
  {
    // 仅学习数据不可用走降级；Token 失效等错误继续向上抛
    if (error instanceof Error && error.name === 'MaimemoStudyUnavailableError')
    {
      console.warn('[dashboard] 学习数据拉取失败，降级为最近快照:', error.message)
      return getLatestSnapshot(userId)
    }

    throw error
  }
}

/** 降级路径：最近一次有效快照 + dataReliable=false（AC-2.2） */
export async function getLatestSnapshot(userId: string): Promise<DashboardTodayDto>
{
  const rows = await db
    .select()
    .from(dailyStudySnapshots)
    .where(eq(dailyStudySnapshots.userId, userId))
    .orderBy(desc(dailyStudySnapshots.snapshotDate))
    .limit(1)

  const snapshot = rows[0]

  if (!snapshot)
  {
    return {
      total: 0,
      finished: 0,
      remaining: 0,
      studyTimeMs: 0,
      completionRate: null,
      newWords: 0,
      reviewWords: 0,
      unfinishedWords: 0,
      forgottenWords: 0,
      dataReliable: false,
      capturedAt: new Date().toISOString()
    }
  }

  return {
    total: snapshot.total,
    finished: snapshot.finished,
    remaining: Math.max(0, snapshot.total - snapshot.finished),
    studyTimeMs: snapshot.studyTimeMs,
    completionRate:
      snapshot.total === 0 ? null : snapshot.finished / snapshot.total,
    newWords: 0,
    reviewWords: 0,
    unfinishedWords: 0,
    forgottenWords: 0,
    dataReliable: false,
    capturedAt: snapshot.capturedAt.toISOString()
  }
}

/** 今日遗忘词列表（FR-3.1：is_finished 且 first_response = FORGET） */
export async function getTodayForgotten(client: MaimemoClient): Promise<FocusWordDto[]>
{
  const items = await getTodayItems(client)

  return items
    .filter((item) => item.is_finished && item.first_response === 'FORGET')
    .map((item) => ({
      vocId: item.voc_id,
      spelling: item.voc_spelling,
      isNew: item.is_new,
      firstResponse: item.first_response,
      tags: []
    }))
}
