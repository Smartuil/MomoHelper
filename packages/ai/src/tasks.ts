import { z } from 'zod'

import type { AiClient } from './client'

/**
 * 第一版只保留两个 AI 任务：遗忘原因诊断、AI 问词。
 * 输出统一经 Zod 校验后才交给 UI；prompt 固定部分前置以命中上下文缓存。
 */

export interface GenerationOutput<T>
{
  data: T
  promptTokens: number
  completionTokens: number
}

/* ============================= 遗忘原因诊断 ============================= */

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
  /** 是否开启思考模式：由用户在遗忘词页选择，代码不做默认 */
  thinking: boolean
  studyCount?: number
  lastResponse?: string
  tags?: string[]
}

export async function diagnoseForget(
  client: AiClient,
  input: ForgetDiagnosisInput
): Promise<GenerationOutput<ForgetDiagnosis>>
{
  const result = await client.complete({
    // V4-Pro 定位深度推理；思考模式由用户选择后经 thinking 透传
    model: 'deepseek-v4-pro',
    thinking: input.thinking,
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

  return {
    data: forgetReasonSchema.parse(JSON.parse(result.content)),
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens
  }
}

/* ============================= AI 问词（流式） ============================= */

const ASK_SYSTEM_PROMPT = `你是贴着墨墨背单词工作流的 AI 问词助手。回答要求：
1. 简洁准确，优先给结论再给解释；
2. 涉及词根、发音、词源时说明这是推测，不作绝对化表述；
3. 用户提供了学习数据时，结合真实数据回答（该词学过几次、是否顽固词），不得编造数据；
4. 中文回答，例句用英文；
5. 可使用轻量 Markdown：**加粗**、*斜体*、\`行内代码\`、- 无序列表、1. 有序列表、# 标题；不要使用表格、链接、代码块、图片。`

export interface AskContext
{
  spelling?: string
  studyCount?: number
  isSticking?: boolean
  history?: { role: 'user' | 'assistant'; content: string }[]
}

/** 组装问词消息（单轮 MVP，后续可接多轮对话） */
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
