'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Segmented, Tile } from '@/components/kit'

interface ReviewContent
{
  summary: string
  highlights: string[]
  problems: string[]
  suggestions: string[]
}

interface ReportContent
{
  summary: string
  highlights: string[]
  focus: string[]
}

type Tab = 'daily' | 'weekly' | 'monthly'

function todayStr(): string
{
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
}

/** 复盘与报告页（FR-12 / 13）：每日复盘 + 周报 / 月报 */
export default function ReviewPage()
{
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('daily')
  const [date, setDate] = useState(todayStr())

  const daily = useQuery({
    queryKey: ['review', 'daily', date],
    queryFn: () =>
      apiFetch<{ date: string; review: { content: ReviewContent } | null }>(
        `/api/review/daily?date=${date}`
      )
  })

  const weekly = useQuery({
    queryKey: ['review', 'weekly'],
    queryFn: () =>
      apiFetch<{
        report: { content: ReportContent }
        dataCompleteness: number
      }>('/api/reports/weekly'),
    enabled: tab === 'weekly'
  })

  const monthly = useQuery({
    queryKey: ['review', 'monthly'],
    queryFn: () =>
      apiFetch<{
        report: { content: ReportContent }
        dataCompleteness: number
      }>('/api/reports/monthly'),
    enabled: tab === 'monthly'
  })

  const generate = useMutation({
    mutationFn: () =>
      apiFetch('/api/review/daily/generate', {
        method: 'POST',
        body: JSON.stringify({ date })
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['review', 'daily', date] })
  })

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="复盘与报告"
        description="基于快照与真实学习数据的 AI 复盘，只陈述数据里存在的事实"
        actions={
          <Segmented
            ariaLabel="范围"
            value={tab}
            options={[
              ['daily', '每日复盘'],
              ['weekly', '周报'],
              ['monthly', '月报']
            ]}
            onChange={setTab}
          />
        }
      />

      {tab === 'daily' && (
        <Tile index={0} hover={false}>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="review-date" className="block text-[var(--text-sm)]">
                复盘日期
              </label>
              <input
                id="review-date"
                type="date"
                value={date}
                max={todayStr()}
                onChange={(event) => setDate(event.target.value)}
                className="mt-1.5 h-10 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={generate.isPending}
              onClick={() => generate.mutate()}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              <Icon name="zap" className={`h-4 w-4 ${generate.isPending ? 'animate-pulse' : ''}`} />
              {generate.isPending ? '生成中…' : 'AI 生成复盘'}
            </button>
          </div>

          {generate.isError && (
            <div className="mt-4">
              <ErrorNote message={(generate.error as ApiError).message} />
            </div>
          )}

          {daily.isError && (
            <div className="mt-4">
              <ErrorNote message={(daily.error as ApiError).message} />
            </div>
          )}

          {daily.data?.review && <ReviewCard content={daily.data.review.content as ReviewContent} />}
          {daily.data && !daily.data.review && !generate.isPending && (
            <p className="mt-4 text-[var(--text-sm)] text-[var(--color-text-subtle)]">
              该日还没有复盘。当天有学习快照后即可生成。
            </p>
          )}
        </Tile>
      )}

      {tab === 'weekly' && <ReportView query={weekly} label="周报" />}
      {tab === 'monthly' && <ReportView query={monthly} label="月报" />}
    </div>
  )
}

function ReviewCard({ content }: { content: ReviewContent })
{
  return (
    <div className="mt-6 space-y-4">
      <p className="rounded-md bg-[var(--color-accent-bg)] px-4 py-3 text-[var(--text-base)] leading-relaxed">
        {content.summary}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <ReviewList title="亮点" items={content.highlights} color="var(--color-familiar)" />
        <ReviewList title="问题" items={content.problems} color="var(--color-forget)" />
        <ReviewList title="建议" items={content.suggestions} color="var(--color-info)" />
      </div>
    </div>
  )
}

function ReviewList({
  title,
  items,
  color
}: {
  title: string
  items: string[]
  color: string
})
{
  return (
    <div className="rounded-md border border-[var(--color-border)] px-4 py-3">
      <p className="text-[var(--text-xs)] font-semibold" style={{ color }}>
        {title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="text-[var(--text-sm)] leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReportView({
  query,
  label
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; data?: { report: { content: ReportContent }; dataCompleteness: number } }
  label: string
})
{
  if (query.isPending)
  {
    return (
      <Tile hover={false}>
        <p className="text-[var(--text-sm)] text-[var(--color-text-subtle)]">载入中…</p>
      </Tile>
    )
  }

  if (query.isError)
  {
    return <ErrorNote message={(query.error as ApiError).message} />
  }

  if (!query.data)
  {
    return null
  }

  const low = query.data.dataCompleteness < 0.7

  return (
    <Tile index={0} hover={false}>
      <div className="flex items-baseline justify-between">
        <p className="text-[var(--text-sm)] font-medium">{label}</p>
        <p
          className={`tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] ${
            low ? 'text-[var(--color-forget)]' : 'text-[var(--color-text-subtle)]'
          }`}
        >
          数据完整度 {Math.round(query.data.dataCompleteness * 100)}%
          {low ? '（快照缺失较多，仅供参考）' : ''}
        </p>
      </div>

      <p className="mt-4 rounded-md bg-[var(--color-accent-bg)] px-4 py-3 text-[var(--text-base)] leading-relaxed">
        {query.data.report.content.summary}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ReviewList title="亮点" items={query.data.report.content.highlights} color="var(--color-familiar)" />
        <ReviewList title="关注点" items={query.data.report.content.focus} color="var(--color-vague)" />
      </div>
    </Tile>
  )
}
