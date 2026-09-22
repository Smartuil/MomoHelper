/**
 * 共享类型与枚举（docs/development-guide.md 第 7.1 / 7.2 节）。
 *
 * 本包不依赖任何运行时，前后端共用。
 * 墨墨 API 的字段命名保持服务端原样（snake_case），平台 API 用 camelCase。
 */

/* ============================= 墨墨 API 域 ============================= */

/** 今日作答结果（实测字段值，api-capability-gap.md 第七节） */
export type StudyResponse = 'FORGET' | 'VAGUE' | 'FAMILIAR'

/** 单词级标签：字符串数组，多数为空数组（不可假设为枚举字符串，实测结论五） */
export type StudyRecordTag = 'STICKING' | 'WELL_FAMILIAR'

/** 墨墨响应统一包裹层（实测结论三：技能文档未记载） */
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

/**
 * Vocabulary 只有两个字段（api-capability-gap.md 第二节）。
 * 无音标、词频、词根等任何词典数据（C6）。
 */
export interface MaimemoVocabulary
{
  id: string
  spelling: string
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

/** 单词级学习记录。日期字段按 UTC+8 日期边界存储（C14）。 */
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

/** 云词本（content 可能是不规范内容，C13，解析必须容错） */
export interface MaimemoNotepad
{
  id: string
  title: string
  content: string
  tags?: string[]
}

/* ============================= 平台统一响应 ============================= */

export type ApiErrorCode =
  | 'unauthorized'
  | 'maimemo_token_invalid'
  | 'maimemo_unavailable'
  | 'permission_denied'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'not_found'
  | 'validation_failed'
  | 'internal_error'

export interface ApiSuccess<T>
{
  data: T
}

export interface ApiFailure
{
  error: {
    code: ApiErrorCode
    message: string
  }
}

/* ============================= 平台业务枚举 ============================= */

/** 墨墨 Token 状态（C10：有效期 7 天，无刷新机制） */
export type TokenStatus = 'ACTIVE' | 'EXPIRED' | 'INVALID'

/**
 * 凭据来源。
 * MANUAL：用户粘贴个人 token（现阶段唯一来源）；
 * OIDC：墨墨开放平台授权登录（预留，接入后启用）。
 */
export type CredentialType = 'MANUAL' | 'OIDC'

/** 内容写入任务类型（释义 / 例句 / 助记共用 600 条/天配额，C4） */
export type ContentJobType = 'INTERPRETATION' | 'PHRASE' | 'NOTE'

/** 生成场景 */
export type ContentScene =
  | 'CONCISE'
  | 'EXAM'
  | 'WORK'
  | 'TECH'
  | 'PAPER'
  | 'CONTRAST'

export type ContentJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED'

export type ContentItemStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'DONE'
  | 'FAILED'
  | 'SKIPPED'

/** 遗忘原因固定枚举（用于分类统计，PRD FR-3.6） */
export type ForgetReason =
  | 'SPELLING_SIMILAR'
  | 'ABSTRACT_MEANING'
  | 'RARE_SENSE'
  | 'CN_MEANING_CONFLICT'
  | 'COLLOCATION_WEAK'
  | 'ROOT_DIVERGENCE'
  | 'LACK_CONTEXT'

/** 遗忘事件来源（FR-15.5：平台自行累积，不依赖 API） */
export type ForgetEventSource = 'TODAY_ITEMS' | 'STUDY_RECORDS'

/** 易混词发现方式（C6：本地编辑距离或 AI 推测） */
export type ConfusionSource = 'EDIT_DISTANCE' | 'AI'

/** 周报 / 月报 */
export type ReportPeriodType = 'WEEKLY' | 'MONTHLY'

/* ============================= 平台 DTO ============================= */

/** 今日看板（GET /api/dashboard/today，docs/development-guide.md 第 8.3 节） */
export interface DashboardTodayDto
{
  total: number
  finished: number
  remaining: number
  studyTimeMs: number
  /** total = 0 时返回 null，不出现除零（AC-2.3） */
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

/** 遗忘词区间查询（近似统计，AC-3.2 响应必须带 approximate） */
export interface ForgetRangeDto
{
  approximate: true
  description: string
  words: FocusWordDto[]
}

/** Token 状态（GET /api/maimemo/token） */
export interface TokenStatusDto
{
  status: TokenStatus
  credentialType: CredentialType
  expiresAt: string | null
  lastVerifiedAt: string | null
}

/** 写入权限开关（默认全关，保守策略） */
export interface PermissionDto
{
  allowInterpretation: boolean
  allowPhrase: boolean
  allowNote: boolean
  allowNotepad: boolean
  allowStudyPlan: boolean
}

/** 配额状态（GET /api/system/quota） */
export interface QuotaDto
{
  /** 配额归属日期（北京时间） */
  quotaDate: string
  used: number
  limit: 600
  remaining: number
}

/** 今日进度（墨墨原始数据经适配层后的形态） */
export interface StudyProgressDto
{
  finished: number
  total: number
  studyTimeMs: number
  dataReliable: boolean
  capturedAt: string
}

/** 学习趋势单日数据点（来自每日快照，GET /api/dashboard/history） */
export interface DashboardTrendPointDto
{
  /** 北京时区日期，YYYY-MM-DD */
  date: string
  finished: number
  total: number
  studyTimeMs: number
  isReliable: boolean
}

/** 学习趋势序列（GET /api/dashboard/history） */
export interface DashboardHistoryDto
{
  days: DashboardTrendPointDto[]
}
