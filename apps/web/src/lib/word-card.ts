/**
 * 单词词卡数据源（方案 A：墨墨自建优先，AI 兜底）。
 *
 * 右栏面板点单词 → 弹词卡：
 * 1. 墨墨 Token 已绑：voc_id → 自建释义/例句，有则展示（标注「我的自建」）；
 * 2. 无自建内容（多数情况——官方词库释义不开放）或墨墨未绑：DeepSeek 生成（标注「AI 生成」）。
 *
 * 结果按词缓存到 localStorage（有效期 24h），重复点击不发请求。
 */

import { explainWord, type WordExplanation } from '@momo/ai'
import {
  getVocabularyBySpelling,
  listInterpretations,
  listPhrases,
  type MaimemoInterpretation,
  type MaimemoPhrase
} from '@momo/maimemo'

import { getAiClient } from './ai'
import { getMaimemoClient } from './maimemo'
import { getAiThinkingMode, getMaimemoToken } from './settings'

/** 词卡统一展示形状 */
export interface WordCard
{
  spelling: string
  /** 数据来源：我的自建 / AI 生成 */
  source: 'mine' | 'ai'
  phonetic: string
  /** 词性+释义文本（自建时为用户原文，AI 时为生成文本） */
  definitions: string[]
  example?: string
  exampleTranslation?: string
  fetchedAt: string
}

const CACHE_KEY = 'momo.wordCards'
const CACHE_TTL_MS = 24 * 3600_000

interface CacheEntry
{
  card: WordCard
  at: string
}

function loadCache(): Map<string, CacheEntry>
{
  try
  {
    const raw = localStorage.getItem(CACHE_KEY)
    const list = raw ? (JSON.parse(raw) as [string, CacheEntry][]) : []
    return new Map(Array.isArray(list) ? list : [])
  }
  catch
  {
    return new Map()
  }
}

function saveCache(cache: Map<string, CacheEntry>): void
{
  try
  {
    // 上限 300 词，超出丢弃最旧
    const entries = [...cache.entries()].slice(-300)
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries))
  }
  catch
  {
    // 忽略
  }
}

export function getCachedWordCard(spelling: string): WordCard | null
{
  const entry = loadCache().get(spelling.toLowerCase())
  if (!entry) return null

  return Date.now() - new Date(entry.at).getTime() < CACHE_TTL_MS ? entry.card : null
}

/** AI 兜底：DeepSeek 生成词条解释（思考模式跟随全局选择） */
async function generateByAi(spelling: string): Promise<WordCard>
{
  const client = getAiClient()
  const thinking = getAiThinkingMode() === 'on'
  const { data } = await explainWord(client, { spelling, thinking })

  return {
    spelling,
    source: 'ai',
    phonetic: data.phonetic,
    definitions: data.definitions
      .split(/[;；\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
    example: data.example,
    exampleTranslation: data.exampleTranslation,
    fetchedAt: new Date().toISOString()
  }
}

/** 墨墨自建内容 → 词卡 */
function fromMine(
  spelling: string,
  interpretations: MaimemoInterpretation[],
  phrases: MaimemoPhrase[]
): WordCard
{
  const published = interpretations.filter((item) => item.status !== 'DELETED')

  return {
    spelling,
    source: 'mine',
    phonetic: '',
    definitions: published.map((item) => item.interpretation),
    example: phrases[0]?.phrase,
    exampleTranslation: phrases[0]?.interpretation,
    fetchedAt: new Date().toISOString()
  }
}

/**
 * 取词卡：先查缓存 → 墨墨自建（有内容即用）→ AI 兜底。
 * 墨墨接口失败（未绑 Token / 网络异常 / 接口不可用）不阻塞，直接走 AI。
 */
export async function getWordCard(spelling: string): Promise<WordCard>
{
  const cached = getCachedWordCard(spelling)

  if (cached)
  {
    return cached
  }

  if (getMaimemoToken())
  {
    try
    {
      const maimemo = getMaimemoClient()
      const voc = await getVocabularyBySpelling(maimemo, spelling)

      if (voc)
      {
        const [interpretations, phrases] = await Promise.all([
          listInterpretations(maimemo, voc.id),
          listPhrases(maimemo, voc.id)
        ])
        const usable = interpretations.filter((item) => item.status !== 'DELETED')

        if (usable.length > 0 || phrases.length > 0)
        {
          const card = fromMine(spelling, interpretations, phrases)
          saveCache(new Map([...loadCache(), [spelling.toLowerCase(), { card, at: card.fetchedAt }]]))
          return card
        }
      }
    }
    catch
    {
      // 墨墨失败不阻塞，AI 兜底
    }
  }

  const card = await generateByAi(spelling)
  saveCache(new Map([...loadCache(), [spelling.toLowerCase(), { card, at: card.fetchedAt }]]))
  return card
}
