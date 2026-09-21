import type { MaimemoVocabulary } from '@momo/types'
import { z } from 'zod'

import type { MaimemoClient } from './client.js'

/**
 * 单词查询接口。
 *
 * C12（实测结论四）：查不到时 HTTP 200、success 仍为 true、data 为空对象。
 * 判断单词是否在墨墨词库，必须判 data.voc 是否存在，绝不能依赖 success。
 */

const queryDataSchema = z.object({
  voc: z
    .array(
      z.object({
        id: z.string(),
        spelling: z.string()
      })
    )
    .optional()
})

/**
 * 批量查询拼写对应的 voc_id。
 *
 * 请求字段名 spellings 为合理假设（未实测），联调时以真实规范修正。
 * 返回 Map：spelling → Vocabulary，查不到的拼写不出现在 Map 中。
 */
export async function queryVocabulary(
  client: MaimemoClient,
  spellings: string[]
): Promise<Map<string, MaimemoVocabulary>>
{
  const uniqueSpellings = [...new Set(spellings.map((s) => s.trim().toLowerCase()))]

  if (uniqueSpellings.length === 0)
  {
    return new Map()
  }

  const data = await client.request<unknown>('POST', '/vocabulary/query', {
    spellings: uniqueSpellings
  })

  const parsed = queryDataSchema.parse(data)
  const result = new Map<string, MaimemoVocabulary>()

  for (const voc of parsed.voc ?? [])
  {
    result.set(voc.spelling.toLowerCase(), voc)
  }

  return result
}

/** 查询单个拼写是否在墨墨词库（C12：判 data.voc） */
export async function lookupSpelling(
  client: MaimemoClient,
  spelling: string
): Promise<MaimemoVocabulary | null>
{
  const map = await queryVocabulary(client, [spelling])
  return map.get(spelling.trim().toLowerCase()) ?? null
}
