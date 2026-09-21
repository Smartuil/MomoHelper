'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'

import { apiFetch, ApiError } from '@/lib/api'
import type { DashboardTodayDto } from '@momo/types'

function formatDuration(ms: number): string
{
  const minutes = Math.round(ms / 60000)

  if (minutes < 1)
  {
    return '不足 1 分钟'
  }

  return `${minutes} 分钟`
}

function percent(rate: number | null): string
{
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

/** 今日看板（FR-2）：主指标 + 四分项 + 数据可靠性标注（AC-2.2 / AC-2.3） */
export default function DashboardPage()
{
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => apiFetch<DashboardTodayDto>('/api/dashboard/today')
  })

  const refresh = useMutation({
    mutationFn: () => apiFetch<DashboardTodayDto>('/api/dashboard/refresh', { method: 'POST' }),
    onSuccess: (data) =>
    {
      queryClient.setQueryData(['dashboard', 'today'], data)
    }
  })

  if (query.isPending)
  {
    return <Skeleton />
  }

  if (query.isError)
  {
    const err = query.error as ApiError

    return (
      <State
        title="看板加载失败"
        description={err.message}
        action={
          err.code === 'maimemo_token_invalid' || err.code === 'unauthorized' ? (
            <Link href="/connect" className="underline">
              去连接墨墨
            </Link>
          ) : (
            <button type="button" onClick={() => void query.refetch()} className="underline">
              重试
            </button>
          )
        }
      />
    )
  }

  const data = query.data

  return (
    <div>
      <header className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[var(--text-xl)] leading-tight">
            今日学习
          </h1>
          <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-subtle)]">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
              timeZone: 'Asia/Shanghai'
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="h-9 border border-[var(--color-border-strong)] px-4 text-[var(--text-sm)] hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
        >
          {refresh.isPending ? '刷新中…' : '刷新数据'}
        </button>
      </header>

      {!data.dataReliable && (
        <p className="mt-4 text-[var(--text-sm)] text-[var(--color-text-subtle)]">
          数据可能不是最新，最后更新{' '}
          {new Date(data.capturedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' })}（墨墨学习数据接口暂不可用，展示最近快照）
        </p>
      )}

      <section className="mt-10">
        <p className="tabular font-[family-name:var(--font-display)] text-[var(--text-3xl)] leading-tight">
          {data.finished} / {data.total}
        </p>
        <div
          className="mt-4 h-1.5 w-full max-w-md bg-[var(--color-border)]"
          role="progressbar"
          aria-valuenow={Math.round((data.completionRate ?? 0) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-[var(--color-familiar)]"
            style={{ width: `${Math.round((data.completionRate ?? 0) * 100)}%` }}
          />
        </div>

        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
          <Metric label="完成率" value={percent(data.completionRate)} />
          <Metric label="学习时长" value={formatDuration(data.studyTimeMs)} />
          <Metric label="新词" value={String(data.newWords)} />
          <Metric label="复习" value={String(data.reviewWords)} />
          <Metric label="未完成" value={String(data.unfinishedWords)} />
          <Metric label="遗忘" value={String(data.forgottenWords)} accent="forget" />
        </dl>
      </section>

      {data.forgottenWords > 0 && (
        <section className="mt-12 border-t border-[var(--color-border)] pt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-[var(--text-lg)]">
              需要关注
            </h2>
            <Link
              href="/forget"
              className="text-[var(--text-sm)] text-[var(--color-info)] underline"
            >
              遗忘词分析
            </Link>
          </div>
          <p className="mt-2 text-[var(--text-sm)] text-[var(--color-text-muted)]">
            今日有 {data.forgottenWords} 个词首次作答遗忘，建议进入诊断。
          </p>
        </section>
      )}
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: 'forget' })
{
  return (
    <div>
      <dt className="text-[var(--text-sm)] text-[var(--color-text-muted)]">{label}</dt>
      <dd
        className={`tabular font-[family-name:var(--font-display)] text-[var(--text-lg)] ${
          accent === 'forget' ? 'text-[var(--color-forget)]' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

function Skeleton()
{
  return (
    <div aria-hidden className="animate-pulse">
      <div className="h-8 w-40 border-b border-[var(--color-border)]" />
      <div className="mt-10 h-12 w-64 bg-[var(--color-bg-subtle)]" />
      <div className="mt-4 h-1.5 w-64 bg-[var(--color-bg-subtle)]" />
      <div className="mt-8 flex gap-10">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 w-20 bg-[var(--color-bg-subtle)]" />
        ))}
      </div>
    </div>
  )
}

function State({
  title,
  description,
  action
}: {
  title: string
  description: string
  action?: React.ReactNode
})
{
  return (
    <div className="mt-20 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-[var(--text-lg)]">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-[var(--text-sm)] text-[var(--color-text-muted)]">
        {description}
      </p>
      {action && <div className="mt-4 text-[var(--text-sm)]">{action}</div>}
    </div>
  )
}
