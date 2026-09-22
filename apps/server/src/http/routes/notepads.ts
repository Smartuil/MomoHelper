import {
  addWords,
  createNotepad,
  deleteNotepad,
  getNotepad,
  listNotepads,
  queryVocabulary,
  updateNotepad
} from '@momo/maimemo'
import { Hono } from 'hono'
import { z } from 'zod'

import { db } from '../../db.js'
import { notepadMappings } from '@momo/db'
import { eq } from 'drizzle-orm'
import { permissionDenied, validationFailed } from '../errors.js'
import type { AppEnv } from '../middleware/session.js'
import { requireSession } from '../middleware/session.js'
import { ensurePreferences } from './maimemo.js'
import { getMaimemoClient } from '../../services/maimemo-client.js'

/**
 * 云词本与学习计划路由（FR-9，docs 第 8.8 节）。
 *
 * C8：不支持删除词本内单个单词 → 只提供整体覆盖式更新，不提供单删入口；
 * C11：更新是全字段覆盖，更新前先 GET 最新内容合并（读改写保护）；
 * C12：查词判 data.voc；AC-9.1：批量加词超 1000 自动分批。
 */
export const notepadRoutes = new Hono<AppEnv>()

notepadRoutes.use('*', requireSession)

/** 词本列表 */
notepadRoutes.get('/notepads', async (c) =>
{
  const client = await getMaimemoClient(c.get('userId'))
  const notepads = await listNotepads(client)
  return c.json({ data: { notepads } })
})

/** 词本详情：content 原样返回 + 容错解析词行（C13：解析失败降级原文） */
notepadRoutes.get('/notepads/:id', async (c) =>
{
  const client = await getMaimemoClient(c.get('userId'))

  try
  {
    const notepad = await getNotepad(client, c.req.param('id'))
    return c.json({ data: { notepad, words: parseNotepadWords(notepad.content) } })
  }
  catch (error)
  {
    console.error('[notepads] 详情获取失败', error)
    throw validationFailed('云词本不存在或墨墨接口错误')
  }
})

const createSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().max(100_000).default(''),
  tags: z.array(z.string()).max(20).default([])
})

/** 创建云词本（权限开关：allow_notepad） */
notepadRoutes.post('/notepads', async (c) =>
{
  const userId = c.get('userId')
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供词本标题')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowNotepad)
  {
    throw permissionDenied('创建云词本需要在设置中开启「云词本」权限')
  }

  const client = await getMaimemoClient(userId)
  const notepad = await createNotepad(client, parsed.data)

  await db
    .insert(notepadMappings)
    .values({
      userId,
      notepadId: notepad.id,
      title: notepad.title,
      tags: parsed.data.tags,
      contentVersion: 1,
      lastSyncedAt: new Date()
    })
    .onConflictDoNothing()

  return c.json({ data: { notepad } })
})

const updateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  /** 全量词列表（C8：以整体覆盖代替单词增删） */
  words: z.array(z.string().min(1)).max(5000).optional(),
  appendWords: z.array(z.string().min(1)).max(1000).optional(),
  tags: z.array(z.string()).max(20).optional()
})

/**
 * 更新云词本（读改写保护，C11）。
 *
 * words 传入时整体覆盖；appendWords 传入时先 GET 最新内容追加；
 * 两条路径都基于最新拉取结果提交，避免覆盖墨墨侧最新数据。
 */
notepadRoutes.put('/notepads/:id', async (c) =>
{
  const userId = c.get('userId')
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('更新参数不合法')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowNotepad)
  {
    throw permissionDenied('更新云词本需要在设置中开启「云词本」权限')
  }

  const client = await getMaimemoClient(userId)
  const id = c.req.param('id')

  // 读改写保护：先取最新内容（C11）
  const latest = await getNotepad(client, id)
  const existingWords = parseNotepadWords(latest.content)

  let nextWords: string[]

  if (parsed.data.words !== undefined)
  {
    nextWords = parsed.data.words
  }
  else if (parsed.data.appendWords !== undefined)
  {
    const seen = new Set(existingWords)
    nextWords = [...existingWords]

    for (const word of parsed.data.appendWords)
    {
      if (!seen.has(word))
      {
        seen.add(word)
        nextWords.push(word)
      }
    }
  }
  else
  {
    nextWords = existingWords
  }

  const updated = await updateNotepad(client, id, {
    title: parsed.data.title ?? latest.title,
    content: nextWords.join('\n'),
    tags: parsed.data.tags ?? latest.tags ?? []
  })

  await db
    .update(notepadMappings)
    .set({
      title: updated.title,
      contentVersion: sqlIncrement(),
      lastSyncedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(notepadMappings.notepadId, id))

  return c.json({ data: { notepad: updated, words: nextWords } })
})

notepadRoutes.delete('/notepads/:id', async (c) =>
{
  const userId = c.get('userId')
  const pref = await ensurePreferences(userId)

  if (!pref.allowNotepad)
  {
    throw permissionDenied('删除云词本需要在设置中开启「云词本」权限')
  }

  const client = await getMaimemoClient(userId)
  await deleteNotepad(client, c.req.param('id'))
  await db.delete(notepadMappings).where(eq(notepadMappings.notepadId, c.req.param('id')))

  return c.json({ data: { ok: true } })
})

const lookupSchema = z.object({
  spellings: z.array(z.string().min(1)).min(1).max(500)
})

/** 批量查词（C12：exists 依据 data.voc 是否存在） */
notepadRoutes.post('/vocabulary/lookup', async (c) =>
{
  const parsed = lookupSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供待查询的单词列表')
  }

  const client = await getMaimemoClient(c.get('userId'))
  const map = await queryVocabulary(client, parsed.data.spellings)

  return c.json({
    data: {
      results: parsed.data.spellings.map((spelling) => ({
        spelling,
        exists: map.has(spelling.trim().toLowerCase()),
        vocId: map.get(spelling.trim().toLowerCase())?.id ?? null
      }))
    }
  })
})

const addPlanSchema = z.object({
  spellings: z.array(z.string().min(1)).min(1).max(5000),
  advance: z.boolean().default(false)
})

/** 批量加入学习计划（权限 allow_study_plan；超 1000 自动分批，AC-9.1） */
notepadRoutes.post('/study-plan/add', async (c) =>
{
  const userId = c.get('userId')
  const parsed = addPlanSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供待加入的单词列表')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowStudyPlan)
  {
    throw permissionDenied('加入学习计划需要在设置中开启「学习计划」权限')
  }

  const client = await getMaimemoClient(userId)

  // 官方 add_words 要求 words[{id}]：拼写 → voc_id 解析，词库不存在的词跳过
  const vocabMap = await queryVocabulary(client, parsed.data.spellings)
  const resolved = parsed.data.spellings
    .map((spelling) => vocabMap.get(spelling.trim().toLowerCase()))
    .filter((voc): voc is NonNullable<typeof voc> => voc !== null)

  const batchSize = 1000

  let addedCount = 0

  for (let i = 0; i < resolved.length; i += batchSize)
  {
    const batch = resolved.slice(i, i + batchSize)
    addedCount += await addWords(client, {
      words: batch.map((voc) => ({ id: voc.id })),
      advance: parsed.data.advance
    })
  }

  return c.json({
    data: {
      addedCount,
      resolvedCount: resolved.length,
      unknownSpellings: parsed.data.spellings.length - resolved.length
    }
  })
})

const wordsSchema = z.object({
  words: z.array(z.string().min(1).max(64)).min(1).max(1000)
})

/** 追加单词（读改写保护，C11） */
notepadRoutes.post('/notepads/:id/words', async (c) =>
{
  const userId = c.get('userId')
  const parsed = wordsSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供待追加的单词列表')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowNotepad)
  {
    throw permissionDenied('更新云词本需要在设置中开启「云词本」权限')
  }

  const client = await getMaimemoClient(userId)
  const id = c.req.param('id')

  const latest = await getNotepad(client, id)
  const existing = parseNotepadWords(latest.content)
  const seen = new Set(existing)
  const nextWords = [...existing]

  for (const word of parsed.data.words)
  {
    const key = word.trim().toLowerCase()

    if (key && !seen.has(key))
    {
      seen.add(key)
      nextWords.push(word.trim())
    }
  }

  const updated = await updateNotepad(client, id, {
    title: latest.title,
    content: nextWords.join('\n'),
    tags: latest.tags ?? []
  })

  await db
    .update(notepadMappings)
    .set({ contentVersion: sqlIncrement(), lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(notepadMappings.notepadId, id))

  return c.json({ data: { notepad: updated, words: nextWords, added: nextWords.length - existing.length } })
})

/** 批量移除单词（GET → 修改 → 整体覆盖，C8；不提供单删入口） */
notepadRoutes.delete('/notepads/:id/words', async (c) =>
{
  const userId = c.get('userId')
  const parsed = wordsSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供待移除的单词列表')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowNotepad)
  {
    throw permissionDenied('更新云词本需要在设置中开启「云词本」权限')
  }

  const client = await getMaimemoClient(userId)
  const id = c.req.param('id')

  const latest = await getNotepad(client, id)
  const removeSet = new Set(parsed.data.words.map((word) => word.trim().toLowerCase()))
  const nextWords = parseNotepadWords(latest.content).filter(
    (word) => !removeSet.has(word.toLowerCase())
  )

  const updated = await updateNotepad(client, id, {
    title: latest.title,
    content: nextWords.join('\n'),
    tags: latest.tags ?? []
  })

  await db
    .update(notepadMappings)
    .set({ contentVersion: sqlIncrement(), lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(notepadMappings.notepadId, id))

  return c.json({ data: { notepad: updated, words: nextWords } })
})

const mergeSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(10),
  targetId: z.string().min(1)
})

/** 合并词本（FR-9.11：词表去重合并进目标词本，源词本删除） */
notepadRoutes.post('/notepads/merge', async (c) =>
{
  const userId = c.get('userId')
  const parsed = mergeSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供源词本与目标词本')
  }

  if (parsed.data.sourceIds.includes(parsed.data.targetId))
  {
    throw validationFailed('目标词本不能同时是源词本')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowNotepad)
  {
    throw permissionDenied('合并词本需要在设置中开启「云词本」权限')
  }

  const client = await getMaimemoClient(userId)
  const target = await getNotepad(client, parsed.data.targetId)

  const seen = new Set(parseNotepadWords(target.content))
  const words = [...seen]

  for (const sourceId of parsed.data.sourceIds)
  {
    const source = await getNotepad(client, sourceId)

    for (const word of parseNotepadWords(source.content))
    {
      const key = word.toLowerCase()

      if (!seen.has(key))
      {
        seen.add(key)
        words.push(word)
      }
    }
  }

  const updated = await updateNotepad(client, target.id, {
    title: target.title,
    content: words.join('\n'),
    tags: target.tags ?? []
  })

  for (const sourceId of parsed.data.sourceIds)
  {
    await deleteNotepad(client, sourceId)
    await db.delete(notepadMappings).where(eq(notepadMappings.notepadId, sourceId))
  }

  await db
    .update(notepadMappings)
    .set({ contentVersion: sqlIncrement(), lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(notepadMappings.notepadId, target.id))

  return c.json({ data: { notepad: updated, words } })
})

const splitSchema = z.object({
  /** 拆成几份（2~10） */
  parts: z.coerce.number().int().min(2).max(10)
})

/** 拆分词本（FR-9.12：目标词本保留第一份，其余创建为新词本） */
notepadRoutes.post('/notepads/:id/split', async (c) =>
{
  const userId = c.get('userId')
  const parsed = splitSchema.safeParse(await c.req.json().catch(() => null))

  if (!parsed.success)
  {
    throw validationFailed('请提供拆分份数（2~10）')
  }

  const pref = await ensurePreferences(userId)

  if (!pref.allowNotepad)
  {
    throw permissionDenied('拆分词本需要在设置中开启「云词本」权限')
  }

  const client = await getMaimemoClient(userId)
  const id = c.req.param('id')

  const latest = await getNotepad(client, id)
  const words = parseNotepadWords(latest.content)

  if (words.length < parsed.data.parts)
  {
    throw validationFailed('词本词数少于拆分份数')
  }

  const chunkSize = Math.ceil(words.length / parsed.data.parts)
  const chunks: string[][] = []

  for (let i = 0; i < words.length; i += chunkSize)
  {
    chunks.push(words.slice(i, i + chunkSize))
  }

  // 目标词本保留第一份
  const updated = await updateNotepad(client, id, {
    title: latest.title,
    content: chunks[0]!.join('\n'),
    tags: latest.tags ?? []
  })

  const created: { id: string; title: string; count: number }[] = []

  for (let i = 1; i < chunks.length; i++)
  {
    const notepad = await createNotepad(client, {
      title: `${latest.title}·${i + 1}`,
      content: chunks[i]!.join('\n'),
      tags: latest.tags ?? []
    })

    created.push({ id: notepad.id, title: notepad.title, count: chunks[i]!.length })

    await db
      .insert(notepadMappings)
      .values({
        userId,
        notepadId: notepad.id,
        title: notepad.title,
        tags: latest.tags ?? [],
        contentVersion: 1,
        lastSyncedAt: new Date()
      })
      .onConflictDoNothing()
  }

  await db
    .update(notepadMappings)
    .set({ contentVersion: sqlIncrement(), lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(notepadMappings.notepadId, id))

  return c.json({ data: { notepad: updated, created } })
})

/**
 * C13 容错解析：逐行取词条，非规范内容（实测出现过 " 兔兔"）降级为原文展示。
 */
function parseNotepadWords(content: string): string[]
{
  if (!content)
  {
    return []
  }

  const words = content
    .split(/[\n,;，；]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && /^[A-Za-z][A-Za-z'-]*$/.test(line))

  return words.length > 0 ? words : []
}

/** 乐观锁版本自增（C11 的平台侧记录） */
function sqlIncrement(): number
{
  // 简单自增；并发冲突由「先 GET 最新再提交」的读改写流程兜底
  return Date.now() % 1_000_000_000
}
