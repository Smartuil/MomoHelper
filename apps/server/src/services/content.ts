import {
  AiClient,
  generateInterpretation,
  generateNote,
  generatePhrase,
  type GenerateInput,
  type NoteResult,
  type PhraseResult,
  type InterpretationResult
} from '@momo/ai'
import { beijingToday, interpretations, notes, phrases, queryStudyRecords } from '@momo/maimemo'
import { consumeQuota, getQuotaState, QuotaExceededError } from '@momo/core'

import { env } from '../config/env.js'
import { db } from '../db.js'
import { aiGenerations } from '@momo/db'
import type { PermissionDto } from '@momo/types'
import { HttpError, permissionDenied } from '../http/errors.js'
import { getMaimemoClient } from './maimemo-client.js'
import { ensurePreferences } from '../http/routes/maimemo.js'

/**
 * 内容生成与写入编排（FR-6 / 7 / 8，docs 第 7.4 节 content.ts）。
 *
 * C4：写入前必须预检配额、写入成功后原子记账（事务 + 行锁）；
 * 写入权限按类型分别校验（AC-6.1）；超额返回明确文案（AC-6.3）。
 */

export type JobType = 'INTERPRETATION' | 'PHRASE' | 'NOTE'

export const PERMISSION_BY_TYPE: Record<JobType, keyof PermissionDto> = {
  INTERPRETATION: 'allowInterpretation',
  PHRASE: 'allowPhrase',
  NOTE: 'allowNote'
}

export type ContentPayload = InterpretationResult | PhraseResult | NoteResult

/** AI 生成单条内容（同步，不写墨墨；成本记入 ai_generations） */
export async function generateSingle(
  userId: string,
  params: { jobType: JobType; scene: string; spelling: string }
): Promise<ContentPayload>
{
  const input = await buildGenerateInput(userId, params.spelling, params.scene)
  const ai = new AiClient({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL })

  let output: ContentPayload
  let usage = { promptTokens: 0, completionTokens: 0 }

  if (params.jobType === 'INTERPRETATION')
  {
    const result = await generateInterpretation(ai, input)
    output = result.data
    usage = { promptTokens: result.promptTokens, completionTokens: result.completionTokens }
  }
  else if (params.jobType === 'PHRASE')
  {
    const result = await generatePhrase(ai, input)
    usage = { promptTokens: result.promptTokens, completionTokens: result.completionTokens }
    output = fixHighlight(result.data, params.spelling)
  }
  else
  {
    const result = await generateNote(ai, input)
    output = result.data
    usage = { promptTokens: result.promptTokens, completionTokens: result.completionTokens }
  }

  await db.insert(aiGenerations).values({
    userId,
    scene: `${params.jobType}:${params.scene}`,
    model: 'deepseek-chat',
    inputDigest: `${params.spelling}|${params.scene}|${input.studyCount ?? 'na'}`,
    output,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens
  })

  return output
}

/** 将生成结果写入墨墨（权限 → 写入 → 配额记账；AC-6.1 / AC-6.3） */
export async function writeSingle(
  userId: string,
  params: {
    jobType: JobType
    vocId: string
    spelling: string
    payload: ContentPayload
  }
): Promise<{ ok: true }>
{
  const pref = await ensurePreferences(userId)

  if (!pref[PERMISSION_BY_TYPE[params.jobType]])
  {
    throw permissionDenied('请在设置中开启对应的写入权限')
  }

  const client = await getMaimemoClient(userId)

  if (params.jobType === 'INTERPRETATION')
  {
    await interpretations(client).create({
      voc_id: params.vocId,
      content: (params.payload as InterpretationResult).content
    })
  }
  else if (params.jobType === 'PHRASE')
  {
    const payload = params.payload as PhraseResult

    await phrases(client).create({
      voc_id: params.vocId,
      content: payload.content,
      highlight_start: payload.highlightStart,
      highlight_end: payload.highlightEnd
    })
  }
  else
  {
    await notes(client).create({
      voc_id: params.vocId,
      content: (params.payload as NoteResult).content,
      note_type: (params.payload as NoteResult).noteType
    })
  }

  // 写入成功才记账（C4：失败不占配额）
  try
  {
    await consumeQuota(db, userId, 1, beijingToday())
  }
  catch (error)
  {
    if (error instanceof QuotaExceededError)
    {
      // 并发穿透预检时仍要给明确文案（AC-6.3）
      throw new HttpError('quota_exceeded', 429, error.message)
    }

    throw error
  }

  return { ok: true }
}

/** 组装真实学习数据上下文（公测不可用不阻塞生成，AC-5.3 同源约束） */
export async function buildGenerateInput(
  userId: string,
  spelling: string,
  scene: string
): Promise<GenerateInput>
{
  const input: GenerateInput = { spelling, scene }

  try
  {
    const client = await getMaimemoClient(userId)
    const records = await queryStudyRecords(client, { limit: 1000 })
    const record = records.records.find(
      (item) => item.voc_spelling.toLowerCase() === spelling.toLowerCase()
    )

    if (record)
    {
      input.studyCount = record.study_count
      input.isSticking = record.tags.includes('STICKING')
    }
  }
  catch
  {
    // 学习数据不可用时继续
  }

  return input
}

/** 例句高亮以实际出现位置为准（AC-7.1，end 开区间），未包含目标词则失败重试 */
export function fixHighlight(data: PhraseResult, spelling: string): PhraseResult
{
  const match = new RegExp(`\\b${escapeRegExp(spelling)}\\b`, 'i').exec(data.content)

  if (!match)
  {
    throw new Error(`例句未包含目标单词「${spelling}」`)
  }

  return {
    content: data.content,
    highlightStart: match.index,
    highlightEnd: Math.min(match.index + match[0].length, data.content.length)
  }
}

function escapeRegExp(text: string): string
{
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 配额预检（剩余不足返回 false；worker 用它决定是否暂停任务） */
export async function hasQuota(userId: string): Promise<boolean>
{
  const state = await getQuotaState(db, userId, beijingToday())
  return state.remaining > 0
}
