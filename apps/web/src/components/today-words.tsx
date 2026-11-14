'use client'

import { useMemo, useState } from 'react'

import type { StudyResponse, TodayWordRowDto } from '@momo/types'
import { Segmented } from '@/components/kit'

/**
 * 今日词表卡：get_today_items 全量词逐行展示，
 * 支持完成状态（is_finished）与类型（is_new）双筛选。
 * 数据复用看板请求（无额外网络调用）；降级快照时无词表（空态）。
 */

type FinishFilter = 'all' | 'finished' | 'unfinished'
type TypeFilter = 'all' | 'new' | 'review'

const RESPONSE_LABELS: Record<StudyResponse, { label: string; className: string }> = {
  FORGET: {
    label: '忘记',
    className: 'text-[var(--color-forget)] font-medium'
  },
  VAGUE: {
    label: '模糊',
    className: 'text-[var(--color-vague)] font-medium'
  },
  FAMILIAR: {
    label: '认识',
    className: 'text-[var(--color-familiar)] font-medium'
  }
}

export function TodayWordsCard({ words }: { words: TodayWordRowDto[] })
{
  const [finishFilter, setFinishFilter] = useState<FinishFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const filtered = useMemo(
    () =>
      words.filter((word) =>
      {
        if (finishFilter === 'finished' && !word.isFinished)
        {
          return false
        }

        if (finishFilter === 'unfinished' && word.isFinished)
        {
          return false
        }

        if (typeFilter === 'new' && !word.isNew)
        {
          return false
        }

        if (typeFilter === 'review' && word.isNew)
        {
          return false
        }

        return true
      }),
    [words, finishFilter, typeFilter]
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
          今日词表
          <span className="ml-2 font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            {filtered.length} / {words.length}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented
            ariaLabel="完成状态"
            value={finishFilter}
            options={[
              ['all', '全部'],
              ['finished', '已完成'],
              ['unfinished', '未完成']
            ]}
            onChange={(next) => setFinishFilter(next as FinishFilter)}
          />
          <Segmented
            ariaLabel="类型"
            value={typeFilter}
            options={[
              ['all', '全部'],
              ['new', '新词'],
              ['review', '复习']
            ]}
            onChange={(next) => setTypeFilter(next as TypeFilter)}
          />
        </div>
      </div>

      {words.length === 0 ? (
        <p className="mt-6 text-[var(--text-sm)] text-[var(--color-text-subtle)]">
          当前为降级快照数据，暂无今日词表明细；数据恢复可靠后自动展示。
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 text-[var(--text-sm)] text-[var(--color-text-subtle)]">
          没有符合当前筛选条件的词。
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
          {filtered.map((word, i) =>
          {
            const response = word.firstResponse
              ? RESPONSE_LABELS[word.firstResponse]
              : undefined

            return (
              <li
                key={word.vocId}
                className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-bg-subtle)]"
              >
                <span className="tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                  {i + 1}
                </span>
                <span className="min-w-0 truncate font-[family-name:var(--font-display)] text-[var(--text-md)]">
                  {word.spelling}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span
                    className={`text-[var(--text-xs)] ${
                      word.isNew
                        ? 'font-medium text-[var(--color-accent)]'
                        : 'text-[var(--color-text-muted)]'
                    }`}
                  >
                    {word.isNew ? '新词' : '复习'}
                  </span>
                  <span
                    className={`flex items-center gap-1.5 text-[var(--text-xs)] ${
                      word.isFinished
                        ? 'text-[var(--color-familiar)]'
                        : 'text-[var(--color-text-subtle)]'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${
                        word.isFinished
                          ? 'bg-[var(--color-familiar)]'
                          : 'bg-[var(--color-border-strong)]'
                      }`}
                    />
                    {word.isFinished ? '已完成' : '未完成'}
                  </span>
                  <span
                    className={`hidden w-12 text-right text-[var(--text-xs)] sm:inline ${
                      response ? response.className : 'text-[var(--color-text-subtle)]'
                    }`}
                  >
                    {response ? response.label : '—'}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
