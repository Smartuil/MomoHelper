import { z } from 'zod'

import type { AiClient } from './client.js'

/**
 * AI 任务封装：prompt 固定部分前置（命中上下文缓存，V4），
 * 可变参数放在后面；输出统一 Zod 校验（NFR-4.3，约定 4.3.7）。
 *
 * C6：词根 / 发音 / 同根属推测，输出必须带 isSpeculative 标注供 UI 展示。
 */

/* ============================= 易混词对比（FR-4.7 / FR-4.8） ============================= */

export const confusionResultSchema = z.object({
  pairs: z
    .array(
      z.object({
        word: z.string(),
        pos: z.string(),
        meaning: z.string(),
        example: z.string(),
        /** 差异提示（如 a**d**apt / a**d**opt 的差异位置描述） */
        distinct: z.string()
      })
    )
    .min(2),
  /** 「别再混」一句话记忆提示（FR-4.9） */
  memo: z.string(),
  isSpeculative: z.boolean().default(false)
})

export type ConfusionResult = z.infer<typeof confusionResultSchema>

const CONFUSION_SYSTEM_PROMPT = `你是英语词汇教学专家。用户给出一组易混淆的英文单词，请输出 json 格式的对比分析。

json 格式如下：
{
  "pairs": [
    { "word": "adapt", "pos": "v.", "meaning": "中文释义", "example": "英文例句", "distinct": "与其他词的差异提示" }
  ],
  "memo": "一句中文的『别再混』记忆提示",
  "isSpeculative": false
}

要求：
1. 每个单词一个 pair，包含词性、简洁中文释义、一条地道英文例句；
2. distinct 指出该词与组内其他词的核心差异（词义侧重、用法或搭配）；
3. memo 用一句话概括区分技巧；
4. 若涉及词根、词源推断，isSpeculative 为 true，措辞避免绝对化。
只输出 json，不要输出其他内容。`

export async function analyzeConfusion(
  client: AiClient,
  words: string[]
): Promise<ConfusionResult>
{
  const result = await client.complete({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: CONFUSION_SYSTEM_PROMPT },
      { role: 'user', content: `易混词组：${words.join(' / ')}` }
    ],
    jsonMode: true,
    maxTokens: 1500,
    temperature: 0.3
  })

  return confusionResultSchema.parse(JSON.parse(result.content))
}

/* ============================= 遗忘原因诊断（FR-3.6） ============================= */

export const forgetReasonSchema = z.object({
  reason: z.enum([
    'SPELLING_SIMILAR',
    'ABSTRACT_MEANING',
    'RARE_SENSE',
    'CN_MEANING_CONFLICT',
    'COLLOCATION_WEAK',
    'ROOT_DIVERGENCE',
    'LACK_CONTEXT'
  ]),
  explanation: z.string(),
  suggestion: z.string(),
  isSpeculative: z.boolean().default(true)
})

export type ForgetDiagnosis = z.infer<typeof forgetReasonSchema>

const FORGET_SYSTEM_PROMPT = `你是英语词汇记忆诊断专家。根据单词及其学习数据，推断用户遗忘该词的主要原因，输出 json。

reason 必须从以下枚举中选择（用于分类统计）：
SPELLING_SIMILAR（拼写相似）/ ABSTRACT_MEANING（词义抽象）/ RARE_SENSE（熟词僻义）/
CN_MEANING_CONFLICT（中文释义混淆）/ COLLOCATION_WEAK（搭配不熟）/
ROOT_DIVERGENCE（词根相同但含义分叉）/ LACK_CONTEXT（缺少真实语境）

json 格式：
{ "reason": "...", "explanation": "中文解释为什么容易忘", "suggestion": "中文补救建议", "isSpeculative": true }

要求：推断属于推测，explanation 与 suggestion 措辞避免绝对化。只输出 json。`

export interface ForgetDiagnosisInput
{
  spelling: string
  studyCount?: number
  lastResponse?: string
  tags?: string[]
}

export async function diagnoseForget(
  client: AiClient,
  input: ForgetDiagnosisInput
): Promise<ForgetDiagnosis>
{
  const result = await client.complete({
    model: 'deepseek-reasoner',
    messages: [
      { role: 'system', content: FORGET_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `单词：${input.spelling}\n学习次数：${input.studyCount ?? '未知'}\n最近作答：${input.lastResponse ?? '未知'}\n标签：${(input.tags ?? []).join(',') || '无'}`
      }
    ],
    jsonMode: true,
    maxTokens: 800,
    temperature: 0.3
  })

  return forgetReasonSchema.parse(JSON.parse(result.content))
}

/* ============================= AI 问词（FR-5，流式） ============================= */

const ASK_SYSTEM_PROMPT = `你是贴着墨墨背单词工作流的 AI 问词助手。回答要求：
1. 简洁准确，优先给结论再给解释；
2. 涉及词根、发音、词源时说明这是推测，不作绝对化表述；
3. 用户提供了学习数据时，结合真实数据回答（该词学过几次、是否顽固词），不得编造数据；
4. 中文回答，例句用英文。`

export interface AskContext
{
  spelling?: string
  studyCount?: number
  isSticking?: boolean
  history?: { role: 'user' | 'assistant'; content: string }[]
}

/** 组装问词消息（单轮 MVP；Q2 多轮对话留待评审） */
export function buildAskMessages(question: string, context?: AskContext)
{
  const contextLines: string[] = []

  if (context?.spelling)
  {
    contextLines.push(`涉及单词：${context.spelling}`)
  }

  if (typeof context?.studyCount === 'number')
  {
    contextLines.push(`学习次数：${context.studyCount}（真实数据）`)
  }

  if (context?.isSticking)
  {
    contextLines.push('该词为官方顽固词（STICKING）')
  }

  const userContent =
    contextLines.length > 0 ? `${contextLines.join('\n')}\n\n问题：${question}` : question

  return [
    { role: 'system' as const, content: ASK_SYSTEM_PROMPT },
    ...(context?.history ?? []),
    { role: 'user' as const, content: userContent }
  ]
}

/* ============================= 内容生成（FR-6 / 7 / 8） ============================= */

/** 生成场景说明（FR-6.3 的六种语气），拼接进可变参数段 */
export const SCENE_HINTS: Record<string, string> = {
  CONCISE: '简洁实用：最小可用释义/例句，口语友好',
  EXAM: '考试向：贴合四六级/考研常见考法',
  WORK: '职场商务：正式书面语，覆盖商务搭配',
  TECH: '科技互联网：覆盖技术语境常用义',
  PAPER: '学术论文：学术语域，术语化表达',
  CONTRAST: '易混对比：强调与形近/近义词的区分点'
}

/** 助记类型固定枚举（AC-8.1，避免自由枚举污染墨墨数据） */
export const NOTE_TYPES = ['ROOT', 'ASSOCIATION', 'STORY', 'CONTRAST'] as const

export const interpretationSchema = z.object({
  content: z.string().min(1).max(500)
})

export type InterpretationResult = z.infer<typeof interpretationSchema>

const INTERPRETATION_SYSTEM_PROMPT = `你是英语词汇内容编辑。为给定单词生成一条自定义释义，输出 json。
json 格式：{ "content": "中文释义（可含词性标注，如 n. 洗涤剂）" }
要求：1. 准确、简洁，符合给定场景的语域；2. 只输出 json。`

export interface GenerateInput
{
  spelling: string
  scene: string
  studyCount?: number
  isSticking?: boolean
}

export interface GenerationOutput<T>
{
  data: T
  promptTokens: number
  completionTokens: number
}

export async function generateInterpretation(
  client: AiClient,
  input: GenerateInput
): Promise<GenerationOutput<InterpretationResult>>
{
  const result = await client.complete({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: INTERPRETATION_SYSTEM_PROMPT },
      { role: 'user', content: buildContentUserPrompt(input) }
    ],
    jsonMode: true,
    maxTokens: 300,
    temperature: 0.4
  })

  return {
    data: interpretationSchema.parse(JSON.parse(result.content)),
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens
  }
}

export const phraseSchema = z.object({
  content: z.string().min(1).max(300),
  highlightStart: z.number().int().min(0),
  highlightEnd: z.number().int().min(1)
})

export type PhraseResult = z.infer<typeof phraseSchema>

const PHRASE_SYSTEM_PROMPT = `你是英语词汇内容编辑。为给定单词生成一条地道英文例句，输出 json。
json 格式：{ "content": "英文例句（必须包含该单词）", "highlightStart": 0, "highlightEnd": 5 }
highlight 区间标注单词在例句中的字符位置，end 为开区间（不含 end）。只输出 json。
注意：即使给出高亮区间，调用方也会按实际出现位置重新计算，请确保例句完整包含该单词。`

export async function generatePhrase(
  client: AiClient,
  input: GenerateInput
): Promise<GenerationOutput<PhraseResult>>
{
  const result = await client.complete({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: PHRASE_SYSTEM_PROMPT },
      { role: 'user', content: buildContentUserPrompt(input) }
    ],
    jsonMode: true,
    maxTokens: 300,
    temperature: 0.6
  })

  return {
    data: phraseSchema.parse(JSON.parse(result.content)),
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens
  }
}

export const noteSchema = z.object({
  content: z.string().min(1).max(500),
  noteType: z.enum(['ROOT', 'ASSOCIATION', 'STORY', 'CONTRAST'])
})

export type NoteResult = z.infer<typeof noteSchema>

const NOTE_SYSTEM_PROMPT = `你是英语词汇记忆专家。为给定单词生成一条助记内容，输出 json。
json 格式：{ "content": "中文助记（词根拆解 / 联想 / 小故事 / 对比记忆）", "noteType": "ROOT|ASSOCIATION|STORY|CONTRAST" }
noteType 必须从四个枚举中选择，与助记方式对应。只输出 json。`

export async function generateNote(
  client: AiClient,
  input: GenerateInput
): Promise<GenerationOutput<NoteResult>>
{
  const result = await client.complete({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: NOTE_SYSTEM_PROMPT },
      { role: 'user', content: buildContentUserPrompt(input) }
    ],
    jsonMode: true,
    maxTokens: 500,
    temperature: 0.6
  })

  return {
    data: noteSchema.parse(JSON.parse(result.content)),
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens
  }
}

/** 可变参数段：单词 + 场景 + 真实学习数据（固定部分已前置命中缓存，V4） */
function buildContentUserPrompt(input: GenerateInput): string
{
  const sceneHint = SCENE_HINTS[input.scene] ?? SCENE_HINTS['CONCISE']
  const lines = [
    `单词：${input.spelling}`,
    `场景：${input.scene}（${sceneHint}）`
  ]

  if (typeof input.studyCount === 'number')
  {
    lines.push(`学习次数：${input.studyCount}（真实数据，学过多次的词助记要更有区分度）`)
  }

  if (input.isSticking)
  {
    lines.push('该词为官方顽固词（STICKING）')
  }

  return lines.join('\n')
}

/* ============================= 学习计划建议（FR-11.5） ============================= */

export const planAdviceSchema = z.object({
  advice: z.string().min(1).max(800)
})

export type PlanAdviceResult = z.infer<typeof planAdviceSchema>

const PLAN_ADVICE_SYSTEM_PROMPT = `你是词汇学习规划师。根据用户的真实学习数据给出学习计划建议，输出 json。
json 格式：{ "advice": "中文建议（100 字内，给具体可执行的动作，引用数据时不编造）" }
只输出 json。`

export interface PlanAdviceInput
{
  totalWords: number
  pressure: { date: string; count: number }[]
  recentFinished: { date: string; finished: number }[]
}

export async function generatePlanAdvice(
  client: AiClient,
  input: PlanAdviceInput
): Promise<PlanAdviceResult>
{
  const result = await client.complete({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: PLAN_ADVICE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `计划总词数：${input.totalWords}\n未来复习压力：${input.pressure
          .map((p) => `${p.date}:${p.count}`)
          .join('，')}\n近期完成：${input.recentFinished
          .map((p) => `${p.date}:${p.finished}`)
          .join('，')}`
      }
    ],
    jsonMode: true,
    maxTokens: 400,
    temperature: 0.5
  })

  return planAdviceSchema.parse(JSON.parse(result.content))
}

/* ============================= 每日复盘（FR-12） ============================= */

export const dailyReviewSchema = z.object({
  summary: z.string().min(1).max(300),
  highlights: z.array(z.string().min(1)).max(5),
  problems: z.array(z.string().min(1)).max(5),
  suggestions: z.array(z.string().min(1)).max(5)
})

export type DailyReviewResult = z.infer<typeof dailyReviewSchema>

const DAILY_REVIEW_SYSTEM_PROMPT = `你是词汇学习复盘助手。根据用户当日的真实学习数据生成复盘，输出 json。
json 格式：
{ "summary": "一句话总结", "highlights": ["做得好的点"], "problems": ["暴露的问题"], "suggestions": ["明日改进建议"] }
要求：1. 只基于给出的数据，不编造；2. 每条一句话，具体不空洞。只输出 json。`

export async function generateDailyReview(
  client: AiClient,
  metrics: Record<string, unknown>
): Promise<DailyReviewResult>
{
  const result = await client.complete({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: DAILY_REVIEW_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(metrics) }
    ],
    jsonMode: true,
    maxTokens: 700,
    temperature: 0.5
  })

  return dailyReviewSchema.parse(JSON.parse(result.content))
}

/* ============================= 周报 / 月报（FR-13） ============================= */

export const reportSchema = z.object({
  summary: z.string().min(1).max(400),
  highlights: z.array(z.string().min(1)).max(5),
  focus: z.array(z.string().min(1)).max(5)
})

export type ReportResult = z.infer<typeof reportSchema>

const REPORT_SYSTEM_PROMPT = `你是词汇学习分析助手。根据一段周期内的真实学习数据生成报告，输出 json。
json 格式：{ "summary": "周期总结（引用数据）", "highlights": ["亮点"], "focus": ["下周期关注点"] }
要求：只基于给出的数据；数据不完整时措辞保守。只输出 json。`

export async function generateReport(
  client: AiClient,
  metrics: Record<string, unknown>
): Promise<ReportResult>
{
  const result = await client.complete({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: REPORT_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(metrics) }
    ],
    jsonMode: true,
    maxTokens: 700,
    temperature: 0.5
  })

  return reportSchema.parse(JSON.parse(result.content))
}

/* ============================= 文本生词提取（FR-10） ============================= */

export const extractWordsSchema = z.object({
  words: z.array(z.string().min(1).max(64)).max(150)
})

export type ExtractWordsResult = z.infer<typeof extractWordsSchema>

const EXTRACT_SYSTEM_PROMPT = `你是英语教学助手。从用户提供的文本中提取值得学习的英语单词或短语，输出 json。
json 格式：{ "words": ["candidate", "words"] }
要求：
1. 排除 the/is/and 等极基础功能词与专有名词；
2. 优先提取低频词、学术词、多义熟词僻义与地道短语；
3. 最多 100 个，按学习价值从高到低排列；
4. 输出原形（小写）。只输出 json。`

export async function extractWords(
  client: AiClient,
  text: string
): Promise<ExtractWordsResult>
{
  const result = await client.complete({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
      { role: 'user', content: text.slice(0, 4000) }
    ],
    jsonMode: true,
    maxTokens: 900,
    temperature: 0.3
  })

  return extractWordsSchema.parse(JSON.parse(result.content))
}
