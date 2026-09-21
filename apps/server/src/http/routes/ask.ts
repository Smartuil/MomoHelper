import { AiClient, buildAskMessages } from '@momo/ai'
import { queryStudyRecords } from '@momo/maimemo'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { getMaimemoClient } from '../../services/maimemo-client.js'

/**
 * AI 问词（FR-5，SSE 流式，docs 第 8.6 节）。
 *
 * AC-5.3：结合真实学习数据回答，不得编造——
 * 服务器先查学习记录，把 study_count / STICKING 作为上下文注入 prompt。
 */
export const askRoutes = new Hono<AppEnv>()

askRoutes.use('*', requireSession)

const askSchema = z.object({
  question: z.string().min(1).max(500),
  spelling: z.string().max(64).optional()
})

askRoutes.post('/ask', async (c) =>
{
  const userId = c.get('userId')
  const parsed = askSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请输入问题')
  }

  // 收集真实学习数据（公测失败不阻塞问答，仅缺上下文）
  let studyCount: number | undefined
  let isSticking = false

  if (parsed.data.spelling)
  {
    try
    {
      const client = await getMaimemoClient(userId)
      const records = await queryStudyRecords(client, { limit: 1000 })
      const record = records.records.find(
        (item) => item.voc_spelling.toLowerCase() === parsed.data.spelling!.toLowerCase()
      )

      if (record)
      {
        studyCount = record.study_count
        isSticking = record.tags.includes('STICKING')
      }
    }
    catch
    {
      // 学习数据不可用时继续，AC-5.3 允许无数据但禁止编造
    }
  }

  const ai = new AiClient({
    apiKey: env.DEEPSEEK_API_KEY,
    baseUrl: env.DEEPSEEK_BASE_URL
  })

  const messages = buildAskMessages(parsed.data.question, {
    spelling: parsed.data.spelling,
    studyCount,
    isSticking
  })

  return streamSSE(c, async (stream) =>
  {
    await stream.writeSSE({ data: JSON.stringify({ event: 'start' }) })

    try
    {
      await ai.streamComplete(
        {
          model: 'deepseek-chat',
          messages,
          maxTokens: 1200,
          temperature: 0.5
        },
        (delta) =>
        {
          void stream.writeSSE({ data: JSON.stringify({ event: 'delta', text: delta }) })
        }
      )

      await stream.writeSSE({ data: JSON.stringify({ event: 'done' }) })
    }
    catch (error)
    {
      await stream.writeSSE({
        data: JSON.stringify({
          event: 'error',
          message: 'AI 服务暂时不可用，请稍后重试'
        })
      })

      console.error('[ask] 流式回答失败', error)
    }
  })
})
