/**
 * 三件核心功能用到的共享类型。
 * 墨墨 API 字段保持服务端原样（snake_case），页面 DTO 用 camelCase。
 */

/* ============================= 墨墨 API 域 ============================= */

/** 今日作答结果 */
export type StudyResponse = 'FORGET' | 'VAGUE' | 'FAMILIAR'

/** 单词级标签：实测为字符串数组，多数为空数组 */
export type StudyRecordTag = 'STICKING' | 'WELL_FAMILIAR'

/** 墨墨响应统一包裹层 */
export interface MaimemoEnvelopeError
{
  code: string
  msg: string
  info: string
}

export interface MaimemoEnvelope<T>
{
  errors: MaimemoEnvelopeError[]
  data: T
  success: boolean
}

/** 今日进度（单点快照）。study_time 为毫秒。 */
export interface MaimemoStudyProgress
{
  finished: number
  total: number
  study_time: number
}

/** 今日单词条目 */
export interface MaimemoStudyTodayItem
{
  voc_id: string
  voc_spelling: string
  order: number
  first_response?: StudyResponse
  is_new: boolean
  is_finished: boolean
}

/** 单词级学习记录。日期字段按 UTC+8 日期边界存储。 */
export interface MaimemoStudyRecord
{
  voc_id: string
  voc_spelling: string
  add_date?: string
  first_study_date?: string
  last_study_date?: string
  next_study_date?: string
  last_response?: StudyResponse
  /** 学习次数（每日最多计入 1 次） */
  study_count: number
  tags: StudyRecordTag[]
}

/** 云词本（目前仅用于校验 Token，列表条目可能不含 content） */
export interface MaimemoNotepad
{
  id: string
  title: string
  content: string
  tags?: string[]
}

/* ============================= 页面 DTO ============================= */

/** 今日看板 */
export interface DashboardTodayDto
{
  total: number
  finished: number
  remaining: number
  studyTimeMs: number
  /** total = 0 时返回 null，不出现除零 */
  completionRate: number | null
  newWords: number
  reviewWords: number
  unfinishedWords: number
  forgottenWords: number
  dataReliable: boolean
  capturedAt: string
}

/** 需要关注的单词条目（看板 / 遗忘词列表共用） */
export interface FocusWordDto
{
  vocId: string
  spelling: string
  isNew: boolean
  firstResponse?: StudyResponse
  lastResponse?: StudyResponse
  studyCount?: number
  tags: StudyRecordTag[]
}

/** 学习趋势单日数据点（来自 localStorage 每日快照） */
export interface DashboardTrendPointDto
{
  /** 北京时区日期，YYYY-MM-DD */
  date: string
  finished: number
  total: number
  studyTimeMs: number
  isReliable: boolean
}

/** 学习趋势序列 */
export interface DashboardHistoryDto
{
  days: DashboardTrendPointDto[]
}
