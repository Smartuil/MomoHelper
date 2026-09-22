'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { FocusWordDto } from '@momo/types'
import { Icon } from '@/components/icons'
import { EmptyTile, ErrorNote, PageHeader, Segmented, Tile, TileSkeleton } from '@/components/kit'

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

  const words = query.data?.words ?? []

  return (
    <div>
      <PageHeader
        title="遗忘词分析"
        description="今日遗忘来自作答记录，顽固词来自墨墨官方多次遗忘标记"
        actions={
          <Segmented
            ariaLabel="范围"
            value={tab}
            options={[
              ['today', '今日遗忘'],
              ['sticking', '顽固词']
            ]}
            onChange={setTab}
          />
        }
      />

      {query.isPending && (
        <div className="grid grid-cols-12 gap-4">
          <TileSkeleton className="col-span-12" />
        </div>
      )}

      {query.isError && <ErrorNote message={(query.error as ApiError).message} />}

      {query.data && (
        <>
          {query.data.degraded && (
            <p className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-vague)]/30 bg-[var(--color-vague-bg)] px-4 py-2.5 text-[var(--text-sm)] text-[var(--color-vague)]">
              <Icon name="alert" className="h-4 w-4 shrink-0" />
              墨墨学习数据接口暂不可用，以下可能不是最新数据。
            </p>
          )}

          {words.length === 0 ? (
            tab === 'today' ? (
              <EmptyTile
                title="今天没有遗忘任何单词"
                description="完成今日复习后回到这里，遗忘的词会被自动列出并支持 AI 诊断。"
              />
            ) : (
              <EmptyTile
                title="还没有顽固词"
                description="顽固词来自墨墨官方标记（多次遗忘的词），继续学习后会出现在这里。"
              />
            )
          ) : (
            <Tile hover={false} index={1} className="p-0! overflow-hidden">
              <ul className="divide-y divide-[var(--color-border)]">
                {words.map((word) => (
                  <li
                    key={word.vocId}
                    className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-[var(--color-bg-subtle)]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                        {word.spelling}
                      </span>
                      {word.tags.includes('STICKING') && (
                        <span className="rounded-full bg-[var(--color-forget-bg)] px-2 py-0.5 text-[var(--text-xs)] font-medium text-[var(--color-forget)]">
                          顽固
                        </span>
                      )}
                    </div>
                    <span className="tabular shrink-0 font-[family-name:var(--font-mono)] text-[var(--text-sm)] text-[var(--color-text-subtle)]">
                      {typeof word.studyCount === 'number' ? `学习 ${word.studyCount} 次` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Tile>
          )}
        </>
      )}
    </div>
  )
}
