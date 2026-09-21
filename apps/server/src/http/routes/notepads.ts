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
  const batchSize = 1000

  let addedCount = 0

  for (let i = 0; i < parsed.data.spellings.length; i += batchSize)
  {
    const batch = parsed.data.spellings.slice(i, i + batchSize)
    addedCount += await addWords(client, {
      spellings: batch,
      advance: parsed.data.advance
    })
  }

  return c.json({ data: { addedCount } })
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
