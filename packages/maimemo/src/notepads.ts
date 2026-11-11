import type { MaimemoNotepad } from '@momo/types'
import { z } from 'zod'

import type { MaimemoClient } from './client'

/**
 * 云词本列表：目前唯一用途是校验用户粘贴的墨墨 Token。
 * 实测列表条目不含 content（只有详情接口返回），因此按可选字段容错。
 */

const notepadSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().optional().default(''),
  tags: z.array(z.string()).optional()
})

const listSchema = z.object({
  notepads: z.array(z.any()).optional()
})

export async function listNotepads(client: MaimemoClient): Promise<MaimemoNotepad[]>
{
  const data = await client.request<unknown>('GET', '/notepads')
  const parsed = listSchema.parse(data)

  return (parsed.notepads ?? []).map((raw) => notepadSchema.parse(raw))
}
