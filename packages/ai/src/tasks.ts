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
