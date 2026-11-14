/**
 * 词库聚合：把 8000+ 条学习记录压成页面要展示的几个分布。
 *
 * 纯函数、无副作用、不碰网络与存储——方便单测，也方便在 useMemo 里反复算。
 * 日期一律先转北京时间日期再取月份，避免 ISO 里的 UTC 16:00 被判到前一个月。
 */

import { beijingToday, toBeijingDate } from '@momo/maimemo'
import type {
  LibraryBucketDto,
  LibraryMonthRowDto,
  LibraryRecordRowDto,
  LibraryStatsDto,
  StudyResponse
} from '@momo/types'

/** 掌握度分桶：学习次数越多说明见得越多 */
const COUNT_BUCKETS: { key: string; label: string; min: number; max: number }[] = [
  { key: '1', label: '1 次', min: 0, max: 1 },
  { key: '2-5', label: '2–5 次', min: 2, max: 5 },
  { key: '6-10', label: '6–10 次', min: 6, max: 10 },
  { key: '11-20', label: '11–20 次', min: 11, max: 20 },
  { key: '20+', label: '20 次以上', min: 21, max: Number.POSITIVE_INFINITY }
]

/** 作答分布：last_response 为空的词归到「未作答」 */
const RESPONSE_LABELS: { key: string; label: string; value: StudyResponse | null }[] = [
  { key: 'FORGET', label: '忘记', value: 'FORGET' },
  { key: 'VAGUE', label: '模糊', value: 'VAGUE' },
  { key: 'FAMILIAR', label: '认识', value: 'FAMILIAR' },
  { key: 'NONE', label: '未作答', value: null }
]

const TAG_LABELS: { key: string; label: string }[] = [
  { key: 'STICKING', label: '顽固 STICKING' },
  { key: 'WELL_FAMILIAR', label: '熟词 WELL_FAMILIAR' },
  { key: 'NONE', label: '无标签' }
]

/** 任意日期字段 → 北京时间 YYYY-MM-DD；无法解析返回 null */
export function beijingDayOf(value?: string): string | null
{
  if (!value)
  {
    return null
  }

  // 接口日期可能是纯日期，也可能是「北京时间 00:00 的 UTC 表示」
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000+08:00` : value
  )

  if (Number.isNaN(date.getTime()))
  {
    return null
  }

  return toBeijingDate(date)
}

/** 近 N 个月的 YYYY-MM 序列（升序，末位为当前月） */
export function recentMonthKeys(count = 12, today = beijingToday()): string[]
{
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const keys: string[] = []

  for (let i = count - 1; i >= 0; i--)
  {
    // Date.UTC 会自动处理跨年（month 为负时回退到上一年）
    keys.push(new Date(Date.UTC(year, month - 1 - i, 1)).toISOString().slice(0, 7))
  }

  return keys
}

function toBucket(
  key: string,
  label: string,
  count: number,
  total: number
): LibraryBucketDto
{
  return { key, label, count, ratio: total === 0 ? 0 : count / total }
}

export function analyzeLibrary(
  records: LibraryRecordRowDto[],
  options: { months?: number } = {}
): LibraryStatsDto
{
  const total = records.length
  const monthCount = options.months ?? 12

  let studyCountSum = 0
  let singleStudyCount = 0
  let stickingCount = 0

  const bucketCounts = COUNT_BUCKETS.map(() => 0)
  const responseCounts = new Map<string, number>()
  const tagCounts = new Map<string, number>()
  const addedByMonth = new Map<string, number>()
  const firstByMonth = new Map<string, number>()

  for (const record of records)
  {
    const count = record.studyCount ?? 0

    studyCountSum += count

    if (count <= 1)
    {
      singleStudyCount++
    }

    for (let i = 0; i < COUNT_BUCKETS.length; i++)
    {
      const bucket = COUNT_BUCKETS[i]!

      if (count >= bucket.min && count <= bucket.max)
      {
        bucketCounts[i]!++
        break
      }
    }

    const response = record.lastResponse ?? null
    const responseKey = response ?? 'NONE'
    responseCounts.set(responseKey, (responseCounts.get(responseKey) ?? 0) + 1)

    const hasSticking = record.tags.includes('STICKING')
    const hasFamiliar = record.tags.includes('WELL_FAMILIAR')

    if (hasSticking)
    {
      stickingCount++
    }

    const tagKey = hasSticking ? 'STICKING' : hasFamiliar ? 'WELL_FAMILIAR' : 'NONE'
    tagCounts.set(tagKey, (tagCounts.get(tagKey) ?? 0) + 1)

    const addedMonth = beijingDayOf(record.addDate)?.slice(0, 7)
    const firstMonth = beijingDayOf(record.firstStudyDate)?.slice(0, 7)

    if (addedMonth)
    {
      addedByMonth.set(addedMonth, (addedByMonth.get(addedMonth) ?? 0) + 1)
    }

    if (firstMonth)
    {
      firstByMonth.set(firstMonth, (firstByMonth.get(firstMonth) ?? 0) + 1)
    }
  }

  // 窗口之前的加入数作为累计基数
  const months = recentMonthKeys(monthCount)
  const windowStart = months[0] ?? ''
  let cumulative = 0

  for (const [month, count] of addedByMonth)
  {
    if (month < windowStart)
    {
      cumulative += count
    }
  }

  const monthRows: LibraryMonthRowDto[] = months.map((month) =>
  {
    const added = addedByMonth.get(month) ?? 0
    const firstStudied = firstByMonth.get(month) ?? 0

    cumulative += added

    return {
      month,
      added,
      firstStudied,
      retention: added === 0 ? null : firstStudied / added,
      cumulative
    }
  })

  return {
    total,
    avgStudyCount: total === 0 ? 0 : Math.round((studyCountSum / total) * 10) / 10,
    singleStudyCount,
    stickingCount,
    countBuckets: COUNT_BUCKETS.map((bucket, i) =>
      toBucket(bucket.key, bucket.label, bucketCounts[i]!, total)
    ),
    tagBuckets: TAG_LABELS.map((tag) =>
      toBucket(tag.key, tag.label, tagCounts.get(tag.key) ?? 0, total)
    ),
    responseBuckets: RESPONSE_LABELS.map((item) =>
      toBucket(item.key, item.label, responseCounts.get(item.value ?? 'NONE') ?? 0, total)
    ),
    months: monthRows
  }
}
