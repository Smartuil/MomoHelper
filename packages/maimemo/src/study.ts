import type {
  MaimemoStudyProgress,
  MaimemoStudyRecord,
  MaimemoStudyTodayItem
} from '@momo/types'
import { z } from 'zod'

import type { MaimemoClient } from './client'
import { MaimemoAuthError, MaimemoStudyUnavailableError } from './errors'

/**
 * 学习数据接口（公测，不保证可用）。
 * 任何失败都包装为 MaimemoStudyUnavailableError，上层走本地快照降级路径。
 */

const progressSchema = z.object({
  progress: z.object({
    finished: z.number(),
    total: z.number(),
    study_time: z.number()
  })
})

const todayItemsSchema = z.object({
  today_items: z.array(z.any()).optional()
})

const recordsSchema = z.object({
  records: z.array(z.any()).optional(),
  count: z.number().optional()
})

/** 获取今日学习进度。study_time 为毫秒。 */
export async function getStudyProgress(client: MaimemoClient): Promise<MaimemoStudyProgress>
{
  try
  {
    const data = await client.request<unknown>('POST', '/study/get_study_progress', {})
    const parsed = progressSchema.parse(data)
    return parsed.progress
  }
  catch (error)
  {
    rethrowStudyError(error)
  }
}

/** 获取今日学习词表（含遗忘 / 未完成标记） */
export async function getTodayItems(client: MaimemoClient): Promise<MaimemoStudyTodayItem[]>
{
  try
  {
    // limit 显式拉满：接口默认仅返回 50 条，看板统计需要全量今日词表
    const data = await client.request<unknown>('POST', '/study/get_today_items', {
      limit: 1000
    })
    const parsed = todayItemsSchema.parse(data)
    return (parsed.today_items ?? []) as MaimemoStudyTodayItem[]
  }
  catch (error)
  {
    rethrowStudyError(error)
  }
}

export interface QueryStudyRecordsParams
{
  /** 只返回总词数 */
  asCount?: boolean
  nextStudyDateStart?: string
  nextStudyDateEnd?: string
  limit?: number
}

export interface QueryStudyRecordsResult
{
  count?: number
  records: MaimemoStudyRecord[]
}

/** 查询单词级学习记录（支持 as_count、next_study_date 区间） */
export async function queryStudyRecords(
  client: MaimemoClient,
  params: QueryStudyRecordsParams = {}
): Promise<QueryStudyRecordsResult>
{
  try
  {
    // next_study_date 为嵌套对象（.start / .end），非扁平字段
    const data = await client.request<unknown>('POST', '/study/query_study_records', {
      as_count: params.asCount,
      next_study_date:
        params.nextStudyDateStart || params.nextStudyDateEnd
          ? {
              ...(params.nextStudyDateStart ? { start: params.nextStudyDateStart } : {}),
              ...(params.nextStudyDateEnd ? { end: params.nextStudyDateEnd } : {})
            }
          : undefined,
      limit: params.limit
    })

    const parsed = recordsSchema.parse(data)

    return {
      count: parsed.count,
      records: (parsed.records ?? []) as MaimemoStudyRecord[]
    }
  }
  catch (error)
  {
    rethrowStudyError(error)
  }
}

export interface QueryAllStudyRecordsOptions
{
  /** 每页条数，接口上限 1000 */
  pageSize?: number
  /** 安全阀：最多翻多少页，避免异常数据下无限循环 */
  maxPages?: number
  /** 每翻完一页回吐一次已拉取条数，供 UI 显示进度 */
  onProgress?: (loaded: number, total: number | null) => void
}

export interface QueryAllStudyRecordsResult
{
  records: MaimemoStudyRecord[]
  /** as_count 返回的总词数；拿不到为 null（不影响结果） */
  total: number | null
  /** false = 被分页边界或安全阀截断，UI 需标注数据可能不全 */
  complete: boolean
}

/**
 * 全量拉取单词级学习记录（8000+ 词时分页取全）。
 *
 * 接口单次 limit 上限 1000、无 offset，只能按 next_study_date 滑动窗口：
 * as_count 拿总数 → 每页取满后把窗口起点挪到「本页最后一个复习日期的次日」。
 * next_study_date 是北京时间 00:00 的 UTC 表示（如 2027-07-04T16:00:00.000Z），
 * 因此追加 24h 得到的 ISO 字符串与接口返回值同格式，不会因时区解析偏 8 小时。
 *
 * 频控无压力：8000 词约 9 次请求，远低于 20 次 / 10 秒的限额。
 */
export async function queryStudyRecordsAll(
  client: MaimemoClient,
  options: QueryAllStudyRecordsOptions = {}
): Promise<QueryAllStudyRecordsResult>
{
  const pageSize = options.pageSize ?? 1000
  const maxPages = options.maxPages ?? 40

  const countResult = await queryStudyRecords(client, { asCount: true })
  const total = countResult.count ?? null

  const seen = new Set<string>()
  const records: MaimemoStudyRecord[] = []
  let start: string | undefined
  let complete = true

  for (let page = 0; page < maxPages; page++)
  {
    const result = await queryStudyRecords(client, {
      limit: pageSize,
      nextStudyDateStart: start
    })

    // 边界可能重叠（同一复习日跨页），按 voc_id 去重
    let fresh = 0

    for (const record of result.records)
    {
      if (seen.has(record.voc_id))
      {
        continue
      }

      seen.add(record.voc_id)
      records.push(record)
      fresh++
    }

    options.onProgress?.(records.length, total)

    if (result.records.length < pageSize)
    {
      break
    }

    if (fresh === 0)
    {
      // 满页却没有一条新词：说明 next_study_date 窗口过滤没生效，翻下去也是原地打转
      complete = false
      break
    }

    const lastDate = lastStudyDate(result.records)

    if (!lastDate)
    {
      // 满页但尾部没有复习日期：无法再切窗口，尾部可能漏词
      complete = false
      break
    }

    const next = shiftStudyDate(lastDate, 1)

    if (next === start)
    {
      // 同一天塞满整页，窗口切不动
      complete = false
      break
    }

    start = next

    if (page === maxPages - 1)
    {
      complete = false
    }
  }

  return { records, total, complete }
}

/** 从后往前找最后一个存在的 next_study_date */
function lastStudyDate(records: MaimemoStudyRecord[]): string | undefined
{
  for (let i = records.length - 1; i >= 0; i--)
  {
    const date = records[i]?.next_study_date

    if (date)
    {
      return date
    }
  }

  return undefined
}

/** 日期加 N 天，返回与接口一致的 ISO 字符串（纯日期输入按北京 00:00 解释） */
function shiftStudyDate(value: string, days: number): string
{
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000+08:00`)
    : new Date(value)

  return new Date(base.getTime() + days * 86_400_000).toISOString()
}

/**
 * 公测接口失败的统一处理（降级入口）。
 *
 * 401 鉴权失败必须原样上抛：页面要引导用户重新绑定 Token，
 * 而不是把失效凭据伪装成「接口暂不可用、显示旧快照」。
 * 其余失败（含业务错误、频控、网络）一律转译为不可用错误，由上层降级。
 */
function rethrowStudyError(error: unknown): never
{
  if (error instanceof MaimemoStudyUnavailableError || error instanceof MaimemoAuthError)
  {
    throw error
  }

  throw new MaimemoStudyUnavailableError(
    `学习数据接口不可用: ${error instanceof Error ? error.message : String(error)}`
  )
}
