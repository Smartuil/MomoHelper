/**
 * UTC+8 日期工具（C14）。
 *
 * 墨墨日期字段按北京时间日期边界存储，实测 next_study_date 形如
 * 2027-07-04T16:00:00.000Z，实际表示北京时间 2027-07-05 00:00。
 * 所有"今天"的判断必须以北京时间为准，不能依赖服务器本地时区。
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 任意时刻对应的北京时间日期，格式 YYYY-MM-DD */
export function toBeijingDate(input: Date = new Date()): string
{
  const shifted = new Date(input.getTime() + BEIJING_OFFSET_MS)
  return shifted.toISOString().slice(0, 10)
}

/** 当前北京时间日期 */
export function beijingToday(): string
{
  return toBeijingDate(new Date())
}

/** 北京时间某日 00:00 对应的 UTC 时刻 */
export function beijingDayStartUtc(dateStr: string): Date
{
  return new Date(`${dateStr}T00:00:00.000+08:00`)
}

/** 北京时间某日 24:00（即次日 00:00）对应的 UTC 时刻 */
export function beijingDayEndUtc(dateStr: string): Date
{
  return new Date(`${dateStr}T00:00:00.000+08:00`) // 语义上为该日结束，供区间查询使用
}
