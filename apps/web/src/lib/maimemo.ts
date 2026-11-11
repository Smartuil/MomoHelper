/**
 * 墨墨 Open API 浏览器直连层。
 *
 * open.maimemo.com 对浏览器 CORS 全开（2026-11-11 实测：反射 Origin、
 * 放行 Authorization 头与 GET/POST/DELETE），因此无需后端代理。
 * 数据封装复用 @momo/maimemo —— 真机实测过的 Envelope 解析、错误映射
 * 与 UTC+8 日期处理（响应包裹层、tags 数组等实测结论都封装在里面）。
 *
 * 每日快照存 localStorage：替代原后端的快照表 + 定时任务。
 * 墨墨没有历史序列接口（C3），趋势完全依赖快照；纯前端下没有无人值守
 * 采集，打开页面当天才会留一个点，未打开的日期在趋势图上缺一天。
 */

import {
  MaimemoClient,
  MaimemoStudyUnavailableError,
  beijingToday,
  toBeijingDate,
  getStudyProgress,
  getTodayItems,
  queryStudyRecords,
  listNotepads
} from '@momo/maimemo'
import type {
  DashboardHistoryDto,
  DashboardTodayDto,
  FocusWordDto
} from '@momo/types'

import { getMaimemoToken } from './settings'

/** 未配置墨墨 Token：页面应引导去设置页，不是错误 */
export class MaimemoNotConfiguredError extends Error
{
  constructor()
  {
    super('尚未配置墨墨 Token，请先到设置页绑定')
    this.name = 'MaimemoNotConfiguredError'
  }
}

/**
 * 墨墨请求走同源代理：EdgeOne 边缘函数把 /api/memo/* 转发给墨墨（服务器间
 * 请求不带 Origin，绕过墨墨对跨域请求的 403 限制）。见 edge-functions/api/memo/[[default]].js
 */
const MAIMEMO_PROXY_BASE = '/api/memo'

/** 每次调用现取 Token：设置页换绑后无需重建任何实例 */
export function getMaimemoClient(): MaimemoClient
{
  const token = getMaimemoToken()

  if (!token)
  {
    throw new MaimemoNotConfiguredError()
  }

  return new MaimemoClient({ token, baseUrl: MAIMEMO_PROXY_BASE })
}

/**
 * 校验新粘贴的 Token：调 notepads 列表（轻量、稳定、不依赖学习数据公测权限）。
 * 401/鉴权失败 → MaimemoAuthError；网络失败 → MaimemoNetworkError；其余视为通过。
 */
export async function verifyMaimemoToken(token: string): Promise<void>
{
  const client = new MaimemoClient({ token, baseUrl: MAIMEMO_PROXY_BASE })
  await listNotepads(client)
}

// ============================ 每日快照 ============================

interface LocalSnapshot
{
  /** 北京时间日期，YYYY-MM-DD */
  date: string
  finished: number
  total: number
  studyTimeMs: number
  capturedAt: string
}

const SNAPSHOT_KEY = 'momo.dailySnapshots'
/** 最多保留一年，localStorage 体积可控（每条约 90 字节） */
const SNAPSHOT_MAX = 366

function loadSnapshots(): LocalSnapshot[]
{
  try
  {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    const list = raw ? (JSON.parse(raw) as LocalSnapshot[]) : []
    return Array.isArray(list) ? list : []
  }
  catch
  {
    return []
  }
}

function upsertSnapshot(snapshot: LocalSnapshot): void
{
  try
  {
    const list = loadSnapshots().filter((item) => item.date !== snapshot.date)
    list.push(snapshot)
    list.sort((a, b) => a.date.localeCompare(b.date))
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list.slice(-SNAPSHOT_MAX)))
  }
  catch
  {
    // 快照写失败不影响看板主流程
  }
}

/** 最近一次快照转看板数据：dataReliable = false，UI 标注「可能不是最新」（C2） */
function latestSnapshotAsToday(): DashboardTodayDto
{
  const list = loadSnapshots()
  const snapshot = list[list.length - 1]

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
    completionRate: snapshot.total === 0 ? null : snapshot.finished / snapshot.total,
    newWords: 0,
    reviewWords: 0,
    unfinishedWords: 0,
    forgottenWords: 0,
    dataReliable: false,
    capturedAt: snapshot.capturedAt
  }
}

// ============================ 今日看板 ============================

/**
 * 今日看板：实时拉取进度 + 今日词表并聚合，成功即留存当日快照。
 * 学习数据接口公测不可用时（C2）降级为最近快照；
 * Token 失效（401）继续上抛，由页面引导重新绑定。
 */
export async function getDashboardToday(): Promise<DashboardTodayDto>
{
  const client = getMaimemoClient()

  try
  {
    const [progress, items] = await Promise.all([
      getStudyProgress(client),
      getTodayItems(client)
    ])

    const newWords = items.filter((item) => item.is_new).length
    const reviewWords = items.filter((item) => !item.is_new).length
    const unfinishedWords = items.filter((item) => !item.is_finished).length
    const forgottenWords = items.filter(
      (item) => item.is_finished && item.first_response === 'FORGET'
    ).length

    upsertSnapshot({
      date: beijingToday(),
      finished: progress.finished,
      total: progress.total,
      studyTimeMs: progress.study_time,
      capturedAt: new Date().toISOString()
    })

    return {
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
  }
  catch (error)
  {
    if (error instanceof MaimemoStudyUnavailableError)
    {
      return latestSnapshotAsToday()
    }

    throw error
  }
}

/** 学习趋势：近 N 天本地快照序列（纯本地读取，无网络请求） */
export function getDashboardHistory(days: number): DashboardHistoryDto
{
  const startDate = toBeijingDate(new Date(Date.now() - (days - 1) * 86_400_000))
  const rows = loadSnapshots().filter((item) => item.date >= startDate)

  return {
    days: rows.map((row) => ({
      date: row.date,
      finished: row.finished,
      total: row.total,
      studyTimeMs: row.studyTimeMs,
      isReliable: true
    }))
  }
}

// ============================ 遗忘词 ============================

export interface ForgottenResult
{
  words: FocusWordDto[]
  /** 公测接口不可用，返回的是空列表 + 降级标注（C2） */
  degraded: boolean
}

/** 今日遗忘词：已完成且首次作答为「忘记」（FR-3.1） */
export async function getTodayForgotten(): Promise<ForgottenResult>
{
  const client = getMaimemoClient()

  try
  {
    const items = await getTodayItems(client)

    return {
      words: items
        .filter((item) => item.is_finished && item.first_response === 'FORGET')
        .map((item) => ({
          vocId: item.voc_id,
          spelling: item.voc_spelling,
          isNew: item.is_new,
          firstResponse: item.first_response,
          tags: []
        })),
      degraded: false
    }
  }
  catch (error)
  {
    if (error instanceof MaimemoStudyUnavailableError)
    {
      return { words: [], degraded: true }
    }

    throw error
  }
}

/** 顽固词：学习记录标签含 STICKING（FR-3.5） */
export async function getStickingWords(): Promise<ForgottenResult>
{
  const client = getMaimemoClient()

  try
  {
    const records = await queryStudyRecords(client, { limit: 1000 })

    return {
      words: records.records
        .filter((item) => item.tags.includes('STICKING'))
        .map((item) => ({
          vocId: item.voc_id,
          spelling: item.voc_spelling,
          isNew: false,
          lastResponse: item.last_response,
          studyCount: item.study_count,
          tags: item.tags
        })),
      degraded: false
    }
  }
  catch (error)
  {
    if (error instanceof MaimemoStudyUnavailableError)
    {
      return { words: [], degraded: true }
    }

    throw error
  }
}
