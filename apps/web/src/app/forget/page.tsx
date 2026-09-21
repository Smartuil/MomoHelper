'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { FocusWordDto } from '@momo/types'

interface WordsResponse
{
  words: FocusWordDto[]
  degraded?: boolean
}

type Tab = 'today' | 'sticking'

/** 遗忘词分析（FR-3.1 今日 / FR-3.5 顽固词；近似区间为 P1 后接） */
export default function ForgetPage()
{
  const [tab, setTab] = useState<Tab>('today')

  const query = useQuery({
    queryKey: ['forget', tab],
    queryFn: () =>
      apiFetch<WordsResponse>(tab === 'today' ? '/api/forget/today' : '/api/forget/sticking')
  })

  return (
    <div>
      <h1 className="border-b border-[var(--color-border)] pb-6 font-[family-name:var(--font-display)] text-[var(--text-xl)]">
        遗忘词分析
      </h1>

      <div role="tablist" aria-label="范围" className="mt-6 flex gap-6 border-b border-[var(--color-border)]">
        {(
          [
            ['today', '今日遗忘'],
            ['sticking', '顽固词']
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-1 pb-2 text-[var(--text-sm)] ${
              tab === key
                ? 'border-[var(--color-accent)] font-semibold'
                : 'border-transparent text-[var(--color-text-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isPending && <p className="mt-10 text-[var(--text-sm)] text-[var(--color-text-subtle)]">加载中…</p>}

      {query.isError && (
        <p role="alert" className="mt-10 text-[var(--text-sm)] text-[var(--color-forget)]">
          {(query.error as ApiError).message}
        </p>
      )}

      {query.data && (
        <>
          {query.data.degraded && (
            <p className="mt-4 text-[var(--text-sm)] text-[var(--color-text-subtle)]">
              墨墨学习数据接口暂不可用，以下可能不是最新数据。
            </p>
          )}

          {query.data.words.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <ul className="mt-6 divide-y divide-[var(--color-border)]">
              {query.data.words.map((word) => (
                <li key={word.vocId} className="flex items-baseline justify-between py-3">
                  <div>
                    <span className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                      {word.spelling}
                    </span>
                    {word.tags.includes('STICKING') && (
                      <span className="ml-2 bg-[var(--color-forget-bg)] px-1.5 py-0.5 text-[var(--text-xs)] text-[var(--color-forget)]">
                        顽固
                      </span>
                    )}
                  </div>
                  <span className="tabular text-[var(--text-sm)] text-[var(--color-text-subtle)]">
                    {typeof word.studyCount === 'number' ? `学习 ${word.studyCount} 次` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function EmptyState({ tab }: { tab: Tab })
{
  return (
    <div className="mt-16 text-center">
      <p className="font-[family-name:var(--font-display)] text-[var(--text-lg)]">
        {tab === 'today' ? '今天没有遗忘任何单词' : '还没有顽固词'}
      </p>
      <p className="mx-auto mt-2 max-w-sm text-[var(--text-sm)] text-[var(--color-text-muted)]">
        {tab === 'today'
          ? '完成今日复习后回到这里，遗忘的词会被自动列出并支持 AI 诊断。'
          : '顽固词来自墨墨官方标记（多次遗忘的词），继续学习后会出现在这里。'}
      </p>
    </div>
  )
}
