'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { ConfusionResult } from '@momo/ai'
import { Icon } from '@/components/icons'
import { EmptyTile, ErrorNote, PageHeader, Tile, TileSkeleton } from '@/components/kit'

interface CandidatesResponse
{
  scannedWordCount: number
  degraded: boolean
  pairs: { a: string; b: string; distance: number }[]
}

/** 易混词诊断（FR-4）：形近词候选（本地算法）→ AI 对比分析 */
export default function ConfusionPage()
{
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<ConfusionResult | null>(null)

  const candidates = useQuery({
    queryKey: ['confusion', 'candidates'],
    queryFn: () => apiFetch<CandidatesResponse>('/api/confusion/candidates'),
    staleTime: 5 * 60_000
  })

  const analyze = useMutation({
    mutationFn: (words: string[]) =>
      apiFetch<ConfusionResult>('/api/confusion/analyze', {
        method: 'POST',
        body: JSON.stringify({ words })
      }),
    onSuccess: (data) => setResult(data)
  })

  function togglePair(a: string, b: string): void
  {
    setSelected([a, b])
    setResult(null)
  }

  return (
    <div>
      <PageHeader
        title="易混词诊断"
        description={
          candidates.data
            ? `基于你的 ${candidates.data.scannedWordCount} 个已知词计算（编辑距离 ≤ 1），选择一组进行 AI 对比分析`
            : '从已知词中发现只差一个字母的形近词'
        }
      />

      {candidates.isPending && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
      )}

      {candidates.isError && <ErrorNote message={(candidates.error as ApiError).message} />}

      {candidates.data && candidates.data.pairs.length === 0 && (
        <EmptyTile
          title="暂未发现形近词"
          description="学习词量增加后，这里会自动发现只差一个字母的词。"
        />
      )}

      {candidates.data && candidates.data.pairs.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.data.pairs.map((pair, i) =>
          {
            const active = selected[0] === pair.a && selected[1] === pair.b

            return (
              <li key={`${pair.a}-${pair.b}`}>
                <button
                  type="button"
                  onClick={() => togglePair(pair.a, pair.b)}
                  aria-pressed={active}
                  style={{ '--i': i } as React.CSSProperties}
                  className={`tile tile-in tile-hover w-full px-4 py-3.5 text-left ${
                    active ? 'border-[var(--color-accent)] bg-[var(--color-accent-bg)]' : ''
                  }`}
                >
                  <span className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                    {pair.a} / {pair.b}
                  </span>
                  <span className="ml-2 rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                    距离 {pair.distance}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selected.length >= 2 && (
        <Tile hover={false} index={10} className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-[var(--text-lg)]">
              {selected.join(' / ')}
            </h2>
            <button
              type="button"
              onClick={() => analyze.mutate(selected)}
              disabled={analyze.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              <Icon name="zap" className={`h-4 w-4 ${analyze.isPending ? 'animate-pulse' : ''}`} />
              {analyze.isPending ? '分析中…' : 'AI 对比分析'}
            </button>
          </div>

          {analyze.isError && (
            <div className="mt-4">
              <ErrorNote message={(analyze.error as ApiError).message} />
            </div>
          )}

          {result && (
            <div className="mt-6">
              {result.isSpeculative && (
                <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                  以下内容由 AI 推测生成，仅供参考。
                </p>
              )}

              <dl className="mt-3 grid gap-4 md:grid-cols-2">
                {result.pairs.map((pair) => (
                  <div
                    key={pair.word}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3.5"
                  >
                    <dt>
                      <p className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                        {pair.word}
                      </p>
                      <p className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                        {pair.pos}
                      </p>
                    </dt>
                    <dd className="mt-2">
                      <p className="text-[var(--text-sm)]">{pair.meaning}</p>
                      <p className="mt-1.5 text-[var(--text-sm)] italic text-[var(--color-text-muted)]">
                        {pair.example}
                      </p>
                      <p className="mt-1.5 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                        {pair.distinct}
                      </p>
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="mt-4 rounded-md border-l-4 border-[var(--color-accent)] bg-[var(--color-accent-bg)] px-4 py-3">
                <p className="text-[var(--text-xs)] font-semibold">别再混</p>
                <p className="mt-1 text-[var(--text-sm)]">{result.memo}</p>
              </div>
            </div>
          )}
        </Tile>
      )}
    </div>
  )
}
