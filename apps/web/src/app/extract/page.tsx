'use client'

import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Tile } from '@/components/kit'

interface Candidate
{
  spelling: string
  exists: boolean
  vocId: string | null
}

/** 文本生词提取页（FR-10）：AI 提取候选词 → 用户编辑 → 加入学习计划 */
export default function ExtractPage()
{
  const [text, setText] = useState('')
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [addMsg, setAddMsg] = useState<string | null>(null)

  const extract = useMutation({
    mutationFn: () =>
      apiFetch<{ candidates: Candidate[] }>('/api/extract', {
        method: 'POST',
        body: JSON.stringify({ text })
      }),
    onSuccess: (data) =>
    {
      setCandidates(data.candidates)
      setExcluded(new Set())
      setAddMsg(null)
    }
  })

  const addPlan = useMutation({
    mutationFn: (spellings: string[]) =>
      apiFetch<{ addedCount: number; unknownSpellings: number }>('/api/study-plan/add', {
        method: 'POST',
        body: JSON.stringify({ spellings })
      }),
    onSuccess: (data) =>
    {
      setAddMsg(`已加入学习计划 ${data.addedCount} 个词` +
        (data.unknownSpellings > 0 ? `（${data.unknownSpellings} 个被墨墨跳过）` : ''))
    }
  })

  function toggle(word: string): void
  {
    setExcluded((prev) =>
    {
      const next = new Set(prev)

      if (next.has(word))
      {
        next.delete(word)
      }
      else
      {
        next.add(word)
      }

      return next
    })
  }

  const selected = (candidates ?? []).filter((candidate) => !excluded.has(candidate.spelling))

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="文本生词提取"
        description="粘贴英文文本，AI 提取值得学习的词，点选排除后加入学习计划（不会自动落库）"
      />

      <Tile index={0} hover={false}>
        <textarea
          rows={6}
          value={text}
          maxLength={6000}
          onChange={(event) => setText(event.target.value)}
          placeholder="粘贴英文文章、新闻或技术文档（10~6000 字）"
          className="w-full resize-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3.5 py-3 text-[var(--text-sm)] leading-relaxed focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            {text.length} / 6000
          </span>
          <button
            type="button"
            disabled={text.trim().length < 10 || extract.isPending}
            onClick={() => extract.mutate()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            <Icon name="zap" className={`h-4 w-4 ${extract.isPending ? 'animate-pulse' : ''}`} />
            {extract.isPending ? '提取中…' : 'AI 提取生词'}
          </button>
        </div>
        {extract.isError && (
          <div className="mt-3">
            <ErrorNote message={(extract.error as ApiError).message} />
          </div>
        )}
      </Tile>

      {candidates && (
        <Tile index={1} hover={false} className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[var(--text-sm)] font-medium">
              候选词
              <span className="tabular ml-2 font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                已选 {selected.filter((c) => c.exists).length} / 共 {candidates.length}
              </span>
            </p>
            <button
              type="button"
              disabled={addPlan.isPending || selected.filter((c) => c.exists).length === 0}
              onClick={() => addPlan.mutate(selected.filter((c) => c.exists).map((c) => c.spelling))}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-familiar)] px-4 text-[var(--text-sm)] font-medium text-white disabled:opacity-50"
            >
              <Icon name="plus" className="h-4 w-4" />
              加入学习计划
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {candidates.map((candidate, i) => {
              const off = excluded.has(candidate.spelling)

              return (
                <button
                  key={candidate.spelling}
                  type="button"
                  onClick={() => toggle(candidate.spelling)}
                  style={{ '--i': i } as React.CSSProperties}
                  aria-pressed={!off}
                  className={`tile-in rounded-full border px-3 py-1.5 font-[family-name:var(--font-mono)] text-[var(--text-sm)] transition-all ${
                    off
                      ? 'border-[var(--color-border)] text-[var(--color-text-subtle)] line-through opacity-50'
                      : candidate.exists
                        ? 'border-[var(--color-info)]/40 bg-[var(--color-info-bg)] text-[var(--color-info)]'
                        : 'border-[var(--color-forget)]/40 bg-[var(--color-forget-bg)] text-[var(--color-forget)]'
                  }`}
                  title={candidate.exists ? '在墨墨词库中' : '不在墨墨词库（加入时会被跳过）'}
                >
                  {candidate.spelling}
                </button>
              )
            })}
          </div>

          {addMsg && <p className="mt-3 text-[var(--text-xs)] text-[var(--color-familiar)]">{addMsg}</p>}
          {addPlan.isError && (
            <div className="mt-3">
              <ErrorNote message={(addPlan.error as ApiError).message} />
            </div>
          )}
        </Tile>
      )}
    </div>
  )
}
