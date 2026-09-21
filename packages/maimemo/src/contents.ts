import type { MaimemoClient } from './client.js'

/**
 * 自定义释义 / 例句 / 助记三类内容接口（C1：只能读写用户自己创建的内容）。
 *
 * 三类接口结构一致（GET / POST / POST{id} / DELETE），用工厂统一实现。
 * 请求字段名以真机实测为准（api-capability-gap.md 第七节未覆盖写接口），
 * 标注 ASSUMPTION 的字段联调时修正。
 */

export interface ContentModule<TDraft extends object>
{
  list: (vocId: string) => Promise<TDraft[]>
  create: (draft: TDraft) => Promise<void>
  update: (id: string, draft: TDraft) => Promise<void>
  remove: (id: string) => Promise<void>
}

interface ContentListEnvelope<T>
{
  [key: string]: unknown
}

function makeContentModule<TDraft extends object, TListKey extends string>(
  client: MaimemoClient,
  options: {
    path: string
    listKey: TListKey
    toDraft: (raw: Record<string, unknown>) => TDraft
  }
): ContentModule<TDraft>
{
  const writeOptions = { retries: 0 }

  return {
    async list(vocId)
    {
      const data = await client.request<ContentListEnvelope<TDraft>>(
        'GET',
        `/${options.path}?voc_id=${encodeURIComponent(vocId)}`
      )

      const rawList = (data as Record<string, unknown>)[options.listKey]

      if (!Array.isArray(rawList))
      {
        return []
      }

      return rawList.map((item) => options.toDraft(item as Record<string, unknown>))
    },

    async create(draft)
    {
      await client.request('POST', `/${options.path}`, draft, writeOptions)
    },

    async update(id, draft)
    {
      await client.request('POST', `/${options.path}/${encodeURIComponent(id)}`, draft, writeOptions)
    },

    async remove(id)
    {
      await client.request('DELETE', `/${options.path}/${encodeURIComponent(id)}`, undefined, writeOptions)
    }
  }
}

/* ============================= 自定义释义 ============================= */

export interface InterpretationDraft
{
  /** ASSUMPTION：字段名未实测 */
  voc_id: string
  content: string
}

export const interpretations = (client: MaimemoClient): ContentModule<InterpretationDraft> =>
  makeContentModule(client, {
    path: 'interpretations',
    listKey: 'interpretations',
    toDraft: (raw) => ({
      voc_id: String(raw['voc_id'] ?? ''),
      content: String(raw['content'] ?? '')
    })
  })

/* ============================= 例句 ============================= */

export interface PhraseDraft
{
  /** ASSUMPTION：字段名未实测 */
  voc_id: string
  content: string
  /**
   * 高亮区间，end 为开区间（AC-7.1）。
   * 写入前校验 start < end 且不超过文本长度，由调用方负责。
   */
  highlight_start: number
  highlight_end: number
}

export const phrases = (client: MaimemoClient): ContentModule<PhraseDraft> =>
  makeContentModule(client, {
    path: 'phrases',
    listKey: 'phrases',
    toDraft: (raw) => ({
      voc_id: String(raw['voc_id'] ?? ''),
      content: String(raw['content'] ?? ''),
      highlight_start: Number(raw['highlight_start'] ?? 0),
      highlight_end: Number(raw['highlight_end'] ?? 0)
    })
  })

/* ============================= 助记 ============================= */

export interface NoteDraft
{
  /** ASSUMPTION：字段名未实测 */
  voc_id: string
  content: string
  /** 助记类型映射到固定取值，避免枚举污染（AC-8.1） */
  note_type: string
}

export const notes = (client: MaimemoClient): ContentModule<NoteDraft> =>
  makeContentModule(client, {
    path: 'notes',
    listKey: 'notes',
    toDraft: (raw) => ({
      voc_id: String(raw['voc_id'] ?? ''),
      content: String(raw['content'] ?? ''),
      note_type: String(raw['note_type'] ?? '')
    })
  })
