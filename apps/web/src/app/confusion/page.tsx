'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { ConfusionResult } from '@momo/ai'

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
    queryFn: () => apiFetch<CandidatesResponse>('/api/confusion/candidates')
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
    const words = [a, b]

    setSelected(words)
    setResult(null)
  }

  return (
    <div>
      <h1 className="border-b border-[var(--color-border)] pb-6 font-[family-name:var(--font-display)] text-[var(--text-xl)]">
        易混词诊断
      </h1>

      {candidates.isPending && (
        <p className="mt-10 text-[var(--text-sm)] text-[var(--color-text-subtle)]">计算形近词中…</p>
      )}

      {candidates.isError && (
        <p role="alert" className="mt-10 text-[var(--text-sm)] text-[var(--color-forget)]">
          {(candidates.error as ApiError).message}
        </p>
      )}

      {candidates.data && (
        <>
          <p className="mt-4 text-[var(--text-sm)] text-[var(--color-text-subtle)]">
            基于你的 {candidates.data.scannedWordCount} 个已知词计算（编辑距离 ≤ 1），选择一组进行 AI 对比分析。
          </p>

          {candidates.data.pairs.length === 0 ? (
            <p className="mt-16 text-center text-[var(--text-sm)] text-[var(--color-text-muted)]">
              暂未发现形近词。学习词量增加后，这里会自动发现只差一个字母的词。
            </p>
          ) : (
            <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {candidates.data.pairs.map((pair) => (
                <li key={`${pair.a}-${pair.b}`}>
                  <button
                    type="button"
                    onClick={() => togglePair(pair.a, pair.b)}
                    className="w-full border border-[var(--color-border)] px-4 py-3 text-left hover:border-[var(--color-border-strong)]"
                  >
                    <span className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                      {pair.a} / {pair.b}
                    </span>
                    <span className="ml-2 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                      编辑距离 {pair.distance}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selected.length >= 2 && (
        <section className="mt-12 border-t border-[var(--color-border)] pt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-[var(--text-lg)]">
              {selected.join(' / ')}
            </h2>
            <button
              type="button"
              onClick={() => analyze.mutate(selected)}
              disabled={analyze.isPending}
              className="h-9 bg-[var(--color-accent)] px-5 text-[var(--text-sm)] text-white disabled:opacity-50"
            >
              {analyze.isPending ? '分析中…' : 'AI 对比分析'}
            </button>
          </div>

          {analyze.isError && (
            <p role="alert" className="mt-4 text-[var(--text-sm)] text-[var(--color-forget)]">
              {(analyze.error as ApiError).message}
            </p>
          )}

          {result && (
            <div className="mt-6">
              {result.isSpeculative && (
                <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                  以下内容由 AI 推测生成，仅供参考。
                </p>
              )}

              <dl className="mt-4 divide-y divide-[var(--color-border)]">
                {result.pairs.map((pair) => (
                  <div key={pair.word} className="grid gap-2 py-4 sm:grid-cols-[10rem_1fr]">
                    <dt>
                      <p className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                        {pair.word}
                      </p>
                      <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                        {pair.pos}
                      </p>
                    </dt>
                    <dd>
                      <p className="text-[var(--text-sm)]">{pair.meaning}</p>
                      <p className="mt-1 text-[var(--text-sm)] italic text-[var(--color-text-muted)]">
                        {pair.example}
                      </p>
                      <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                        {pair.distinct}
                      </p>
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-bg)] px-4 py-3">
                <p className="text-[var(--text-xs)] font-semibold">别再混</p>
                <p className="mt-1 text-[var(--text-sm)]">{result.memo}</p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
