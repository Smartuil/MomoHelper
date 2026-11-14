'use client'

/**
 * 词库 · 词表浏览器。
 *
 * 8000+ 词在前端内存里过滤/排序，不分页请求接口：
 * 搜索（单词或 voc_id）、标签筛选、四种排序、每页 100 行本地分页。
 * 字段覆盖接口返回的全部 9 项，列多时横向滚动，voc_id 放最后。
 */

import { useDeferredValue, useMemo, useState } from 'react'

import type { LibraryRecordRowDto, StudyResponse } from '@momo/types'
import { Segmented } from '@/components/kit'
import { Icon } from '@/components/icons'
import { beijingDayOf } from '@/lib/analyze'

const PAGE_SIZE = 100

type TagFilter = 'all' | 'sticking' | 'familiar'
type SortKey = 'next' | 'count' | 'added' | 'alpha'

const SORT_OPTIONS: [SortKey, string][] = [
  ['next', '下次复习'],
  ['count', '学习次数'],
  ['added', '加入时间'],
  ['alpha', '字母序']
]

const RESPONSE_META: Record<StudyResponse, { label: string; className: string }> = {
  FORGET: { label: '忘记', className: 'text-[var(--color-forget)]' },
  VAGUE: { label: '模糊', className: 'text-[var(--color-vague)]' },
  FAMILIAR: { label: '认识', className: 'text-[var(--color-familiar)]' }
}

const TAG_META: Record<string, { label: string; className: string }> = {
  STICKING: {
    label: 'STICKING',
    className: 'bg-[var(--color-forget-bg)] text-[var(--color-forget)]'
  },
  WELL_FAMILIAR: {
    label: 'FAMILIAR',
    className: 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]'
  }
}

/** 日期比较：空值永远排最后（「没有下次复习」不该挤在最前面） */
function compareDate(a?: string, b?: string, direction: 'asc' | 'desc' = 'asc'): number
{
  if (!a && !b)
  {
    return 0
  }

  if (!a)
  {
    return 1
  }

  if (!b)
  {
    return -1
  }

  return direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
}

const SORTERS: Record<SortKey, (a: LibraryRecordRowDto, b: LibraryRecordRowDto) => number> = {
  next: (a, b) => compareDate(a.nextStudyDate, b.nextStudyDate, 'asc'),
  count: (a, b) => b.studyCount - a.studyCount,
  added: (a, b) => compareDate(a.addDate, b.addDate, 'desc'),
  alpha: (a, b) => a.spelling.localeCompare(b.spelling, 'en')
}

function DayCell({ value }: { value?: string })
{
  const day = beijingDayOf(value)

  return day ? (
    <span className="tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-muted)]">
      {day}
    </span>
  ) : (
    <span className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">—</span>
  )
}

function PageButton({
  children,
  disabled,
  onClick
}: {
  children: React.ReactNode
  disabled: boolean
  onClick: () => void
})
{
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-3 text-[var(--text-xs)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

export function LibraryTableView({ records }: { records: LibraryRecordRowDto[] })
{
  const [keyword, setKeyword] = useState('')
  const [tagFilter, setTagFilter] = useState<TagFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('next')
  const [page, setPage] = useState(0)

  // 8000 条过滤 + 排序放 deferred：输入时不掉帧
  const deferredKeyword = useDeferredValue(keyword)

  const filtered = useMemo(() =>
  {
    const needle = deferredKeyword.trim().toLowerCase()

    let rows = records

    if (needle)
    {
      rows = rows.filter(
        (row) =>
          row.spelling.toLowerCase().includes(needle) || row.vocId.toLowerCase().includes(needle)
      )
    }

    if (tagFilter === 'sticking')
    {
      rows = rows.filter((row) => row.tags.includes('STICKING'))
    }
    else if (tagFilter === 'familiar')
    {
      rows = rows.filter((row) => row.tags.includes('WELL_FAMILIAR'))
    }

    return [...rows].sort(SORTERS[sortKey])
  }, [records, deferredKeyword, tagFilter, sortKey])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]"
          />
          <input
            value={keyword}
            onChange={(event) =>
            {
              setKeyword(event.target.value)
              setPage(0)
            }}
            placeholder="搜索单词或 voc_id"
            aria-label="搜索单词"
            className="h-9 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] pl-9 pr-3 text-[var(--text-sm)] transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            ariaLabel="标签筛选"
            value={tagFilter}
            options={[
              ['all', '全部'],
              ['sticking', '顽固'],
              ['familiar', '熟词']
            ]}
            onChange={(next) =>
            {
              setTagFilter(next as TagFilter)
              setPage(0)
            }}
          />
          <Segmented
            ariaLabel="排序方式"
            value={sortKey}
            options={SORT_OPTIONS}
            onChange={(next) =>
            {
              setSortKey(next as SortKey)
              setPage(0)
            }}
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-md border border-[var(--color-border)]">
        <table className="w-full min-w-[940px] border-collapse text-left">
          <thead>
            <tr className="bg-[var(--color-bg-subtle)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
              <th className="w-12 px-3 py-2.5 font-normal">#</th>
              <th className="px-3 py-2.5 font-normal">voc_spelling</th>
              <th className="w-16 px-3 py-2.5 text-right font-normal">study_count</th>
              <th className="w-20 px-3 py-2.5 text-center font-normal">last_response</th>
              <th className="w-28 px-3 py-2.5 font-normal">tags</th>
              <th className="w-28 px-3 py-2.5 font-normal">add_date</th>
              <th className="w-28 px-3 py-2.5 font-normal">first_study</th>
              <th className="w-28 px-3 py-2.5 font-normal">last_study</th>
              <th className="w-28 px-3 py-2.5 font-normal">next_study</th>
              <th className="w-40 px-3 py-2.5 font-normal">voc_id</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-3 py-10 text-center text-[var(--text-sm)] text-[var(--color-text-subtle)]"
                >
                  没有符合条件的词。
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row.vocId}
                  className="border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-subtle)]"
                >
                  <td className="px-3 py-2 tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                    {safePage * PAGE_SIZE + i + 1}
                  </td>
                  <td className="px-3 py-2 font-[family-name:var(--font-display)] text-[var(--text-md)]">
                    {row.spelling}
                  </td>
                  <td className="px-3 py-2 text-right tabular font-[family-name:var(--font-mono)] text-[var(--text-sm)]">
                    {row.studyCount}
                  </td>
                  <td className="px-3 py-2 text-center text-[var(--text-xs)]">
                    {row.lastResponse ? (
                      <span className={`font-medium ${RESPONSE_META[row.lastResponse].className}`}>
                        {RESPONSE_META[row.lastResponse].label}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-subtle)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.tags.length === 0 ? (
                      <span className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {row.tags.map((tag) =>
                        {
                          const meta = TAG_META[tag]

                          return meta ? (
                            <span
                              key={tag}
                              className={`rounded-sm px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-medium ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          ) : (
                            <span
                              key={tag}
                              className="rounded-sm bg-[var(--color-bg-subtle)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-text-muted)]"
                            >
                              {tag}
                            </span>
                          )
                        })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <DayCell value={row.addDate} />
                  </td>
                  <td className="px-3 py-2">
                    <DayCell value={row.firstStudyDate} />
                  </td>
                  <td className="px-3 py-2">
                    <DayCell value={row.lastStudyDate} />
                  </td>
                  <td className="px-3 py-2">
                    {row.nextStudyDate ? (
                      <span className="tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] font-medium text-[var(--color-accent)]">
                        {beijingDayOf(row.nextStudyDate)}
                      </span>
                    ) : (
                      <span className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">—</span>
                    )}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-text-subtle)]">
                    <span title={row.vocId} className="select-all">
                      {row.vocId}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
          共 {filtered.length.toLocaleString('zh-CN')} 词 · 第 {safePage + 1} / {totalPages} 页 ·
          每页 {PAGE_SIZE} 条
        </p>
        <div className="flex items-center gap-2">
          <PageButton disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            <Icon name="chevron-right" className="h-3.5 w-3.5 rotate-180" />
            上一页
          </PageButton>
          <PageButton disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
            下一页
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </PageButton>
        </div>
      </div>
    </div>
  )
}
