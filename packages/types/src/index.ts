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

/** 今日词表明细行（今日页面词表卡用） */
export interface TodayWordRowDto
{
  vocId: string
  spelling: string
  order: number
  isNew: boolean
  isFinished: boolean
  firstResponse?: StudyResponse
}

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
  /** 今日词表明细（dataReliable = false 时为空——快照不存词表） */
  todayWords: TodayWordRowDto[]
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

/* ============================= 词库 ============================= */

/** 词库词表行：query_study_records 全字段的 camelCase 版 */
export interface LibraryRecordRowDto
{
  vocId: string
  spelling: string
  /** 学习次数（每日最多计 1 次） */
  studyCount: number
  lastResponse?: StudyResponse
  tags: StudyRecordTag[]
  addDate?: string
  firstStudyDate?: string
  lastStudyDate?: string
  nextStudyDate?: string
}

/** 通用计数桶（掌握度分桶 / 标签分布 / 作答分布共用） */
export interface LibraryBucketDto
{
  key: string
  label: string
  count: number
  /** 占总数比例，total = 0 时为 0 */
  ratio: number
}

/** 词库月度聚合行 */
export interface LibraryMonthRowDto
{
  /** YYYY-MM */
  month: string
  /** 当月加入词数（add_date） */
  added: number
  /** 当月首次学习词数（first_study_date） */
  firstStudied: number
  /** 首学 / 加入；当加入为 0 时 null */
  retention: number | null
  /** 截至该月累计加入词数 */
  cumulative: number
}

/** 词库聚合结果（只存聚合、不存原始记录时用；当前页面直接用原始记录现算） */
export interface LibraryStatsDto
{
  total: number
  /** 平均学习次数，保留一位小数 */
  avgStudyCount: number
  /** 只学过 1 次的词数 */
  singleStudyCount: number
  /** 带 STICKING 标签的词数 */
  stickingCount: number
  countBuckets: LibraryBucketDto[]
  tagBuckets: LibraryBucketDto[]
  responseBuckets: LibraryBucketDto[]
  months: LibraryMonthRowDto[]
}

/** 全量拉取结果元信息 */
export interface LibrarySnapshotDto
{
  records: LibraryRecordRowDto[]
  /** 接口 as_count 返回的总词数；拿不到时为 null */
  total: number | null
  /** 是否翻页取全（false 说明被分页边界或安全阀截断） */
  complete: boolean
  /** ISO 时间戳 */
  fetchedAt: string
}
