import type { MaimemoNotepad } from '@momo/types'
import { z } from 'zod'

import type { MaimemoClient } from './client.js'

/**
 * 云词本接口（C8 / C11 / C13）。
 *
 * C11：更新要求全字段必填且整体覆盖，并发写会互相覆盖，
 * 调用方必须配合平台侧串行化或乐观锁（notepad_mappings.content_version）。
 * C8：不支持删除单个单词，删除词只能 GET 全量 → 修改 → 整体覆盖。
 */

const notepadSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
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

export async function getNotepad(client: MaimemoClient, id: string): Promise<MaimemoNotepad>
{
  const data = await client.request<unknown>('GET', `/notepads/${encodeURIComponent(id)}`)
  return notepadSchema.parse(data)
}

export interface NotepadPayload
{
  title: string
  content: string
  tags?: string[]
}

/** 创建云词本。tags 为自由字符串数组（合法值字典由平台侧定义，Q3）。 */
export async function createNotepad(client: MaimemoClient, payload: NotepadPayload): Promise<MaimemoNotepad>
{
  const data = await client.request<unknown>(
    'POST',
    '/notepads',
    { title: payload.title, content: payload.content, tags: payload.tags ?? [] },
    { retries: 0 }
  )

  return notepadSchema.parse(data)
}

/**
 * 更新云词本（全字段覆盖，C11）。
 * 调用方必须先 getNotepad 取最新内容再合并提交，禁止盲写。
 */
export async function updateNotepad(
  client: MaimemoClient,
  id: string,
  payload: NotepadPayload
): Promise<MaimemoNotepad>
{
  const data = await client.request<unknown>(
    'POST',
    `/notepads/${encodeURIComponent(id)}`,
    { title: payload.title, content: payload.content, tags: payload.tags ?? [] },
    { retries: 0 }
  )

  return notepadSchema.parse(data)
}

export async function deleteNotepad(client: MaimemoClient, id: string): Promise<void>
{
  await client.request('DELETE', `/notepads/${encodeURIComponent(id)}`, undefined, { retries: 0 })
}
