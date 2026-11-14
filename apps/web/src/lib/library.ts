/**
 * 词库数据层：全量拉取 + IndexedDB 缓存。
 *
 * 为什么用 IndexedDB 而不是 localStorage：8000+ 条记录约 2MB，
 * localStorage 5MB 配额会被吃掉近一半，且每次读写都全量序列化；
 * IndexedDB 存结构化对象、按 vocId 建主键，读写都不经过 JSON.stringify。
 *
 * 缓存策略（尽量减少请求）：
 *   6 小时内     → 直接用缓存，0 请求
 *   6–24 小时    → 花 1 个 as_count 请求比对总数，没变就沿用缓存
 *   超过 24 小时 / 总数变了 / 手动刷新 → 全量重拉（约 9 个请求）
 */

import { queryStudyRecords, queryStudyRecordsAll } from '@momo/maimemo'
import type { LibraryRecordRowDto, LibrarySnapshotDto, MaimemoStudyRecord } from '@momo/types'

import { getMaimemoClient } from './maimemo'

const DB_NAME = 'momo-library'
const DB_VERSION = 1
const STORE_RECORDS = 'records'
const STORE_META = 'meta'
const META_KEY = 'snapshot'
/** 每批写入条数：一次事务塞 8000 条会长时间占住主线程 */
const WRITE_BATCH = 500

const FRESH_MS = 6 * 60 * 60 * 1000
const MAX_AGE_MS = 24 * 60 * 60 * 1000

interface LibraryMeta
{
  key: string
  total: number | null
  complete: boolean
  fetchedAt: string
}

export interface LibraryLoadOptions
{
  /** 跳过缓存，强制全量重拉 */
  force?: boolean
  /** 每翻一页回吐已拉取条数 */
  onProgress?: (loaded: number, total: number | null) => void
}

/* ============================ IndexedDB ============================ */

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase>
{
  return new Promise((resolve, reject) =>
  {
    if (typeof indexedDB === 'undefined')
    {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () =>
    {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_RECORDS))
      {
        db.createObjectStore(STORE_RECORDS, { keyPath: 'vocId' })
      }

      if (!db.objectStoreNames.contains(STORE_META))
      {
        db.createObjectStore(STORE_META, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('打开 IndexedDB 失败'))
    request.onblocked = () => reject(new Error('IndexedDB 被其他标签页占用'))
  })
}

function getDb(): Promise<IDBDatabase>
{
  if (!dbPromise)
  {
    dbPromise = openDb().catch((error: unknown) =>
    {
      // 打开失败不要缓存失败态，下次进页面还能重试
      dbPromise = null
      throw error
    })
  }

  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void>
{
  return new Promise((resolve, reject) =>
  {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务中止'))
  })
}

async function readAll<T>(storeName: string): Promise<T[]>
{
  const db = await getDb()
  const tx = db.transaction(storeName, 'readonly')
  const request = tx.objectStore(storeName).getAll()

  await txDone(tx)

  return (request.result ?? []) as T[]
}

async function putMeta(meta: LibraryMeta): Promise<void>
{
  const db = await getDb()
  const tx = db.transaction(STORE_META, 'readwrite')

  tx.objectStore(STORE_META).put(meta)
  await txDone(tx)
}

/** 整表替换：先清空再分批写，避免新旧记录混在一起 */
async function replaceRecords(records: LibraryRecordRowDto[]): Promise<void>
{
  const db = await getDb()

  const clearTx = db.transaction(STORE_RECORDS, 'readwrite')
  clearTx.objectStore(STORE_RECORDS).clear()
  await txDone(clearTx)

  for (let i = 0; i < records.length; i += WRITE_BATCH)
  {
    const tx = db.transaction(STORE_RECORDS, 'readwrite')
    const store = tx.objectStore(STORE_RECORDS)

    for (const record of records.slice(i, i + WRITE_BATCH))
    {
      store.put(record)
    }

    await txDone(tx)
  }
}

/* ============================ 缓存读写 ============================ */

interface CachedLibrary
{
  records: LibraryRecordRowDto[]
  meta: LibraryMeta
}

/** 读缓存；IndexedDB 不可用或数据缺失时返回 null（调用方走全量拉取） */
async function readCache(): Promise<CachedLibrary | null>
{
  try
  {
    const [records, metas] = await Promise.all([
      readAll<LibraryRecordRowDto>(STORE_RECORDS),
      readAll<LibraryMeta>(STORE_META)
    ])
    const meta = metas.find((item) => item.key === META_KEY)

    if (!meta || records.length === 0)
    {
      return null
    }

    return { records, meta }
  }
  catch
  {
    return null
  }
}

/** 写缓存；失败只影响下次是否重拉，不影响本次展示 */
async function writeCache(records: LibraryRecordRowDto[], meta: LibraryMeta): Promise<void>
{
  try
  {
    await replaceRecords(records)
    await putMeta(meta)
  }
  catch
  {
    // 忽略：隐私模式等场景下 IndexedDB 可能被禁用
  }
}

function ageOf(iso: string): number
{
  const time = new Date(iso).getTime()

  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : Date.now() - time
}

function toSnapshot(cached: CachedLibrary): LibrarySnapshotDto
{
  return {
    records: cached.records,
    total: cached.meta.total,
    complete: cached.meta.complete,
    fetchedAt: cached.meta.fetchedAt
  }
}

/* ============================ 对外入口 ============================ */

/** 学习记录（snake_case）→ 词库行（camelCase） */
function toRow(record: MaimemoStudyRecord): LibraryRecordRowDto
{
  return {
    vocId: record.voc_id,
    spelling: record.voc_spelling,
    studyCount: record.study_count ?? 0,
    lastResponse: record.last_response,
    tags: record.tags ?? [],
    addDate: record.add_date,
    firstStudyDate: record.first_study_date,
    lastStudyDate: record.last_study_date,
    nextStudyDate: record.next_study_date
  }
}

/** 读词库：优先缓存，必要时全量拉取 */
export async function loadLibrary(
  options: LibraryLoadOptions = {}
): Promise<LibrarySnapshotDto>
{
  const cached = options.force ? null : await readCache()

  if (cached)
  {
    const age = ageOf(cached.meta.fetchedAt)

    if (age < FRESH_MS)
    {
      return toSnapshot(cached)
    }

    if (age < MAX_AGE_MS)
    {
      // 只花 1 个请求确认总数：词数没变说明没有新增/移除，缓存仍然可信
      try
      {
        const client = getMaimemoClient()
        const countResult = await queryStudyRecords(client, { asCount: true })
        const total = countResult.count ?? null

        if (total !== null && total === cached.meta.total)
        {
          const meta: LibraryMeta = { ...cached.meta, fetchedAt: new Date().toISOString() }

          await putMeta(meta).catch(() => undefined)

          return toSnapshot({ records: cached.records, meta })
        }
      }
      catch
      {
        // 比对失败就走全量；不要因为一次 as_count 失败挡住整个页面
      }
    }
  }

  const client = getMaimemoClient()
  const result = await queryStudyRecordsAll(client, {
    onProgress: options.onProgress
  })
  const records = result.records.map(toRow)
  const fetchedAt = new Date().toISOString()
  const meta: LibraryMeta = {
    key: META_KEY,
    // as_count 可能为 null，用实际到手条数兜底
    total: result.total ?? records.length,
    complete: result.complete,
    fetchedAt
  }

  await writeCache(records, meta)

  return { records, total: meta.total, complete: meta.complete, fetchedAt }
}
