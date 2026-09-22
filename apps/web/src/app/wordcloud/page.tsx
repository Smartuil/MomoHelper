'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import { ErrorNote, PageHeader, Segmented, Tile } from '@/components/kit'

interface CloudWord
{
  text: string
  weight: number
  state: 'forget' | 'vague' | 'familiar' | 'neutral'
  group?: string
}

interface CloudResponse
{
  view: string
  words: CloudWord[]
  totalScanned: number
  truncated: boolean
  legend: { size: string; color: string }
  degraded?: boolean
}

type View = 'DIFFICULTY' | 'PROGRESS' | 'STRUCTURE'
type Range = 'TODAY' | 'DAYS_7' | 'DAYS_30' | 'ALL'

const STATE_COLORS: Record<CloudWord['state'], string> = {
  forget: 'var(--color-forget)',
  vague: 'var(--color-vague)',
  familiar: 'var(--color-familiar)',
  neutral: 'var(--color-text-subtle)'
}

/** 词云页（FR-16）：难度 / 进度 / 首字母结构三视角 */
export default function WordcloudPage()
{
  const [view, setView] = useState<View>('DIFFICULTY')
  const [range, setRange] = useState<Range>('DAYS_7')

  const query = useQuery({
    queryKey: ['wordcloud', view, range],
    queryFn: () =>
      apiFetch<CloudResponse>(
        `/api/wordcloud?view=${view}&range=${range}${view === 'STRUCTURE' ? '&groupBy=INITIAL' : ''}`
      )
  })

  const words = query.data?.words ?? []
  const maxWeight = Math.max(...words.map((word) => word.weight), 1)

  // 首字母分组
  const groups = new Map<string, CloudWord[]>()

  for (const word of words)
  {
    const key = view === 'STRUCTURE' ? (word.group ?? '#') : ''

    if (!groups.has(key))
    {
      groups.set(key, [])
    }

    groups.get(key)!.push(word)
  }

  return (
    <div>
      <PageHeader
        title="词云"
        description="扫一眼就知道哪些词在拖后腿"
        actions={
          <div className="flex flex-wrap gap-2.5">
            <Segmented
              ariaLabel="视角"
              value={view}
              options={[
                ['DIFFICULTY' as View, '难度'],
                ['PROGRESS' as View, '进度'],
                ['STRUCTURE' as View, '结构']
              ]}
              onChange={(next) =>
              {
                setView(next)

                if (next === 'PROGRESS' && range === 'DAYS_7')
                {
                  setRange('ALL')
                }
              }}
            />
            <Segmented
              ariaLabel="范围"
              value={range}
              options={[
                ['TODAY' as Range, '今日'],
                ['DAYS_7' as Range, '近 7 天'],
                ['DAYS_30' as Range, '近 30 天'],
                ['ALL' as Range, '全部']
              ]}
              onChange={setRange}
            />
          </div>
        }
      />

      {query.isError && <ErrorNote message={(query.error as ApiError).message} />}

      <Tile index={0} hover={false}>
        {query.data && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            <span>{query.data.legend.color}</span>
            <span className="font-[family-name:var(--font-mono)]">
              扫描 {query.data.totalScanned} 词{query.data.truncated ? ` · 已截取 Top ${words.length}` : ''}
              {query.data.degraded ? ' · 学习数据接口暂不可用' : ''}
            </span>
          </div>
        )}

        {query.isPending ? (
          <p className="py-16 text-center text-[var(--text-sm)] text-[var(--color-text-subtle)]">
            计算词云中…
          </p>
        ) : words.length === 0 ? (
          <p className="py-16 text-center text-[var(--text-sm)] text-[var(--color-text-subtle)]">
            暂无数据。学习几天后回来看，词云会自动生长。
          </p>
        ) : view === 'STRUCTURE' ? (
          <div className="space-y-5">
            {[...groups.keys()].sort().map((letter) => (
              <div key={letter}>
                <p className="tabular font-[family-name:var(--font-mono)] text-[var(--text-sm)] font-semibold text-[var(--color-text-muted)]">
                  {letter}
                  <span className="ml-1.5 text-[var(--text-xs)] font-normal text-[var(--color-text-subtle)]">
                    {groups.get(letter)!.length}
                  </span>
                </p>
                <WordFlow words={groups.get(letter)!} maxWeight={maxWeight} />
              </div>
            ))}
          </div>
        ) : (
          <WordFlow words={words} maxWeight={maxWeight} />
        )}
      </Tile>
    </div>
  )
}

function WordFlow({ words, maxWeight }: { words: CloudWord[]; maxWeight: number })
{
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      {words.map((word) => (
        <span
          key={word.text}
          className="font-[family-name:var(--font-display)] leading-snug transition-transform hover:scale-110"
          style={{
            color: STATE_COLORS[word.state],
            fontSize: `${0.8 + (word.weight / maxWeight) * 0.9}rem`,
            opacity: 0.55 + (0.45 * word.weight) / maxWeight
          }}
          title={`${word.text}：学过 ${word.weight} 次`}
        >
          {word.text}
        </span>
      ))}
    </div>
  )
}
