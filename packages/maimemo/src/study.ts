import type {
  MaimemoStudyProgress,
  MaimemoStudyRecord,
  MaimemoStudyTodayItem
} from '@momo/types'
import { z } from 'zod'

import type { MaimemoClient } from './client.js'
import { MaimemoStudyUnavailableError } from './errors.js'

/**
 * 学习数据接口（公测，C2）。
 *
 * 该组接口不保证可用，任何失败都会包装为 MaimemoStudyUnavailableError，
 * 上层必须走降级路径（展示最近快照），不能把错误直接抛给用户。
 *
 * 注意：请求字段以真机实测为准，未实测的字段标注了假设，联调时修正。
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
    throw wrapStudyError(error)
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
    throw wrapStudyError(error)
  }
}

export interface QueryStudyRecordsParams
{
  /** 只返回总词数（实测 count=8614 即通过此参数取得） */
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
    throw wrapStudyError(error)
  }
}

export interface AddWordsParams
{
  /**
   * 墨墨词 ID 列表（voc_id）。官方接口要求 words[{id}] 结构而非拼写，
   * 拼写 → voc_id 的解析由调用方经 queryVocabulary 完成。
   */
  words: { id: string }[]
  /** 加入计划并立即复习（不受 C5 等级限制），FR-11.8 */
  advance?: boolean
}

/** 批量加入学习计划。单次上限 1000，超出由调用方分批（AC-9.1）。 */
export async function addWords(
  client: MaimemoClient,
  params: AddWordsParams
): Promise<number>
{
  const data = await client.request<{ added_count?: number }>(
    'POST',
    '/study/add_words',
    {
      words: params.words,
      advance: params.advance
    },
    // 写操作不重试（NFR-3.2）
    { retries: 0 }
  )

  return data.added_count ?? params.words.length
}

/**
 * 将单词提前到当下复习（C5：需账号等级 ≥ 10，无预检接口，只能失败后处理）。
 * 官方接口要求 voc_ids；调用方需把 MaimemoApiError 转译为「等级不足」提示并推荐 addWords advance。
 */
export async function advanceStudy(client: MaimemoClient, vocIds: string[]): Promise<number>
{
  const data = await client.request<{ advanced_count?: number }>(
    'POST',
    '/study/advance_study',
    { voc_ids: vocIds },
    { retries: 0 }
  )

  return data.advanced_count ?? vocIds.length
}

/** 公测接口的一切失败统一转译为不可用错误（C2 降级入口） */
function wrapStudyError(error: unknown): MaimemoStudyUnavailableError
{
  if (error instanceof MaimemoStudyUnavailableError)
  {
    return error
  }

  return new MaimemoStudyUnavailableError(
    `学习数据接口不可用: ${error instanceof Error ? error.message : String(error)}`
  )
}
