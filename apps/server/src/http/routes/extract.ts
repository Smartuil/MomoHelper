import { AiClient, extractWords } from '@momo/ai'
import { queryVocabulary } from '@momo/maimemo'
import { Hono } from 'hono'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { db } from '../../db.js'
import { aiGenerations } from '@momo/db'
import { validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { getMaimemoClient } from '../../services/maimemo-client.js'

/**
 * 文本生词提取路由（FR-10，docs 第 8.9 节）。
 * AC-10.1：只返回候选词表，不直接落库，供用户编辑后自行加入计划/词本。
 */
export const extractRoutes = new Hono<AppEnv>()

extractRoutes.use('*', requireSession)

const extractSchema = z.object({
  text: z.string().min(10).max(6000)
})

extractRoutes.post('/extract', async (c) =>
{
  const userId = c.get('userId')
  const parsed = extractSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供 10~6000 字的英文文本')
  }

  const ai = new AiClient({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL })
  const result = await extractWords(ai, parsed.data.text)

  // 去重并按墨墨词库分类（C12：判 data.voc）
  const uniqueWords = [...new Set(result.words.map((word) => word.trim().toLowerCase()))].slice(0, 150)
  const client = await getMaimemoClient(userId)

  const vocabMap = new Map<string, { id: string; spelling: string }>()

  for (let i = 0; i < uniqueWords.length; i += 500)
  {
    const part = await queryVocabulary(client, uniqueWords.slice(i, i + 500))

    for (const [key, value] of part)
    {
      vocabMap.set(key, value)
    }
  }

  await db.insert(aiGenerations).values({
    userId,
    scene: 'EXTRACT',
    model: 'deepseek-chat',
    inputDigest: `${parsed.data.text.length} chars`,
    output: result
  })

  return c.json({
    data: {
      candidates: uniqueWords.map((spelling) => ({
        spelling,
        exists: vocabMap.has(spelling),
        vocId: vocabMap.get(spelling)?.id ?? null
      }))
    }
  })
})
