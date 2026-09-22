'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { DashboardHistoryDto, DashboardTodayDto, DashboardTrendPointDto } from '@momo/types'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Tile, TileSkeleton } from '@/components/kit'

function beijingDate(d: Date): string
{
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

function formatDuration(ms: number): string
{
  const minutes = Math.round(ms / 60000)

  if (minutes < 1)
  {
    return '不足 1 分钟'
  }

  return `${minutes} 分钟`
}

/** 把接口返回的稀疏快照补齐成连续 N 天（缺的日子记 0） */
function buildDays(rows: DashboardTrendPointDto[], days = 14): DashboardTrendPointDto[]
{
  const map = new Map(rows.map((row) => [row.date, row]))
  const out: DashboardTrendPointDto[] = []

  for (let i = days - 1; i >= 0; i--)
  {
    const date = beijingDate(new Date(Date.now() - i * 86_400_000))
    out.push(
      map.get(date) ?? { date, finished: 0, total: 0, studyTimeMs: 0, isReliable: false }
    )
  }

  return out
}

/** 近 14 天趋势：手写 SVG 柱状图，hover 显示数值 */
function TrendChart({ days }: { days: DashboardTrendPointDto[] })
{
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(...days.map((d) => d.finished), 1)
  const today = beijingDate(new Date())
  const slot = 40
  const width = days.length * slot
  const chartH = 120
  const baseY = 138

  return (
    <svg
      viewBox={`0 0 ${width} 160`}
      className="h-40 w-full"
      role="img"
      aria-label="近 14 天每日完成词数趋势"
    >
      <line
        x1="0"
        y1={baseY}
        x2={width}
        y2={baseY}
        stroke="var(--color-border)"
        strokeWidth="1"
      />
      {days.map((day, i) =>
      {
        const h = day.finished > 0 ? Math.max(6, (day.finished / max) * chartH) : 0
        const x = i * slot + 9
        const y = baseY - h
        const isToday = day.date === today
        const fill = isToday ? 'var(--color-accent)' : 'var(--color-familiar)'

        return (
          <g
            key={day.date}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {/* 命中区 */}
            <rect x={i * slot} y="0" width={slot} height="160" fill="transparent" />
            {day.finished > 0 ? (
              <rect
                x={x}
                y={y}
                width="22"
                height={h}
                rx="5"
                fill={fill}
                opacity={hovered === null || hovered === i ? 1 : 0.45}
                style={{ transition: 'opacity 0.2s' }}
              />
            ) : (
              <circle cx={x + 11} cy={baseY - 4} r="3" fill="var(--color-border-strong)" />
            )}
            {hovered === i && day.finished > 0 && (
              <text
                x={x + 11}
                y={y - 8}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="var(--color-text)"
              >
                {day.finished}
              </text>
            )}
            {(i === 0 || i === days.length - 1 || isToday) && (
              <text
                x={x + 11}
                y="154"
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-text-subtle)"
              >
                {isToday ? '今天' : day.date.slice(5)}
              </text>
            )}
            <title>{`${day.date}：完成 ${day.finished} / ${day.total}，学习 ${formatDuration(day.studyTimeMs)}`}</title>
          </g>
        )
      })}
    </svg>
  )
}

const METRICS = [
  { key: 'newWords', label: '新词', icon: 'plus', color: 'var(--color-info)' },
  { key: 'reviewWords', label: '复习', icon: 'repeat', color: 'var(--color-familiar)' },
  { key: 'unfinishedWords', label: '未完成', icon: 'circle-dashed', color: 'var(--color-vague)' },
  { key: 'forgottenWords', label: '遗忘', icon: 'zap', color: 'var(--color-forget)' }
] as const

/** 今日看板（FR-2）：Bento 瓷贴布局 + 14 天趋势 */
export default function DashboardPage()
{
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => apiFetch<DashboardTodayDto>('/api/dashboard/today')
  })

  const history = useQuery({
    queryKey: ['dashboard', 'history'],
    queryFn: () =>
      apiFetch<DashboardHistoryDto>('/api/dashboard/history?days=14')
  })

  const refresh = useMutation({
    mutationFn: () => apiFetch<DashboardTodayDto>('/api/dashboard/refresh', { method: 'POST' }),
    onSuccess: (data) =>
    {
      queryClient.setQueryData(['dashboard', 'today'], data)
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'history'] })
    }
  })

  if (query.isPending)
  {
    return (
      <div className="grid grid-cols-12 gap-4">
        <TileSkeleton className="col-span-12 lg:col-span-5" />
        <TileSkeleton className="col-span-12 lg:col-span-7" />
        <TileSkeleton className="col-span-12 lg:col-span-8" />
        <TileSkeleton className="col-span-12 lg:col-span-4" />
      </div>
    )
  }

  if (query.isError)
  {
    const err = query.error as ApiError

    return (
      <Tile hover={false} className="mt-16 text-center">
        <Icon name="alert" className="mx-auto h-8 w-8 text-[var(--color-vague)]" />
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-[var(--text-lg)]">
          看板加载失败
        </h1>
        <p className="mx-auto mt-1 max-w-md text-[var(--text-sm)] text-[var(--color-text-muted)]">
          {err.message}
        </p>
        <div className="mt-5 flex justify-center gap-3">
          {err.code === 'maimemo_token_invalid' || err.code === 'unauthorized' ? (
            <Link
              href="/connect"
              className="inline-flex h-9 items-center rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white hover:bg-[var(--color-accent-hover)]"
            >
              <Icon name="link" className="mr-2 h-4 w-4" />
              去连接墨墨
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="inline-flex h-9 items-center rounded-md border border-[var(--color-border-strong)] px-5 text-[var(--text-sm)] hover:bg-[var(--color-bg-subtle)]"
            >
              重试
            </button>
          )}
        </div>
      </Tile>
    )
  }

  const data = query.data
  const rate = data.completionRate ?? 0
  const ringR = 62
  const ringC = 2 * Math.PI * ringR
  const trendDays = history.data ? buildDays(history.data.days) : null

  return (
    <div>
      <PageHeader
        title="今日学习"
        description={new Date().toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
          timeZone: 'Asia/Shanghai'
        })}
        actions={
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--text-sm)] shadow-[var(--shadow-tile)] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-tile-hover)] disabled:opacity-50"
          >
            <Icon
              name="refresh"
              className={`h-4 w-4 ${refresh.isPending ? 'animate-spin' : ''}`}
            />
            {refresh.isPending ? '刷新中…' : '刷新数据'}
          </button>
        }
      />

      {!data.dataReliable && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-vague)]/30 bg-[var(--color-vague-bg)] px-4 py-2.5 text-[var(--text-sm)] text-[var(--color-vague)]">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          墨墨学习数据接口暂不可用，以下为最近一次可靠快照（
          {new Date(data.capturedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai' })}）。
        </p>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* 进度环大瓷贴 */}
        <Tile index={0} className="col-span-12 lg:col-span-5">
          <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">完成进度</p>
          <div className="mt-4 flex items-center gap-6">
            <div className="relative h-[152px] w-[152px] shrink-0">
              <svg viewBox="0 0 152 152" className="h-full w-full -rotate-90">
                <circle
                  cx="76"
                  cy="76"
                  r={ringR}
                  fill="none"
                  stroke="var(--color-bg-subtle)"
                  strokeWidth="12"
                />
                <circle
                  cx="76"
                  cy="76"
                  r={ringR}
                  fill="none"
                  stroke="var(--color-familiar)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringC * (1 - rate)}
                  className="ring-progress"
                  style={{ '--ring-circ': ringC } as React.CSSProperties}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="num-in tabular font-[family-name:var(--font-mono)] text-2xl font-semibold leading-none" key={data.finished}>
                  {data.finished}
                  <span className="text-sm font-normal text-[var(--color-text-subtle)]">
                    {' '}/ {data.total}
                  </span>
                </p>
                <p className="mt-1.5 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                  {data.completionRate === null ? '今日暂无计划' : `完成率 ${Math.round(rate * 100)}%`}
                </p>
              </div>
            </div>
            <dl className="min-w-0 flex-1 space-y-3">
              <div className="rounded-md bg-[var(--color-bg-subtle)] px-3.5 py-2.5">
                <dt className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">剩余待学</dt>
                <dd className="num-in tabular font-[family-name:var(--font-mono)] text-lg font-semibold" key={data.remaining}>
                  {data.remaining}
                </dd>
              </div>
              <div className="rounded-md bg-[var(--color-bg-subtle)] px-3.5 py-2.5">
                <dt className="flex items-center gap-1.5 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  学习时长
                </dt>
                <dd className="num-in text-[var(--text-md)] font-semibold" key={data.studyTimeMs}>
                  {formatDuration(data.studyTimeMs)}
                </dd>
              </div>
            </dl>
          </div>
        </Tile>

        {/* 四分项 2×2 */}
        <Tile index={1} className="col-span-12 lg:col-span-7">
          <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">今日概览</p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {METRICS.map((metric) => (
              <div
                key={metric.key}
                className="group flex items-center gap-3.5 rounded-md border border-[var(--color-border)] px-4 py-3.5 transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-subtle)]"
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
                  style={{ background: `color-mix(in oklch, ${metric.color} 12%, transparent)` }}
                >
                  <Icon name={metric.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <dd className="num-in tabular font-[family-name:var(--font-mono)] text-[var(--text-xl)] font-semibold leading-tight" key={data[metric.key]}>
                    {data[metric.key]}
                  </dd>
                  <dt className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                    {metric.label}
                  </dt>
                </div>
              </div>
            ))}
          </dl>
        </Tile>

        {/* 趋势 */}
        <Tile index={2} className="col-span-12 lg:col-span-8">
          <div className="flex items-baseline justify-between">
            <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
              近 14 天完成趋势
            </p>
            <p className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
              {trendDays ? `${trendDays.reduce((sum, d) => sum + d.finished, 0)} 词` : '—'}
            </p>
          </div>
          <div className="mt-3">
            {trendDays ? (
              trendDays.some((d) => d.finished > 0) ? (
                <TrendChart days={trendDays} />
              ) : (
                <p className="flex h-40 items-center justify-center text-[var(--text-sm)] text-[var(--color-text-subtle)]">
                  快照从今天开始累积，明天回来看趋势。
                </p>
              )
            ) : (
              <div className="flex h-40 items-center justify-center text-[var(--text-sm)] text-[var(--color-text-subtle)]">
                载入趋势中…
              </div>
            )}
          </div>
        </Tile>

        {/* 快捷入口 */}
        <Tile index={3} className="col-span-12 lg:col-span-4">
          <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">快捷入口</p>
          <ul className="mt-4 space-y-2">
            {(
              [
                { href: '/ask', icon: 'message', label: 'AI 问词', desc: '结合学习数据提问' },
                { href: '/confusion', icon: 'swap', label: '易混词诊断', desc: '形近词 AI 对比' },
                { href: '/forget', icon: 'trending-down', label: '遗忘词分析', desc: '今日遗忘与顽固词' }
              ] as const
            ).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3.5 rounded-md border border-[var(--color-border)] px-4 py-3 transition-all hover:-translate-y-px hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-tile)]"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                  >
                    <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[var(--text-sm)] font-medium">{item.label}</span>
                    <span className="block text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                      {item.desc}
                    </span>
                  </span>
                  <Icon
                    name="chevron-right"
                    className="h-4 w-4 shrink-0 text-[var(--color-text-subtle)] transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Tile>

        {/* 今日遗忘词预览（条件出现） */}
        {data.forgottenWords > 0 && (
          <Tile index={4} className="col-span-12 border-l-4 !border-l-[var(--color-forget)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[var(--text-sm)]">
                <span className="tabular font-[family-name:var(--font-mono)] font-semibold text-[var(--color-forget)]">
                  {data.forgottenWords}
                </span>{' '}
                个词今日首次作答遗忘，建议进入诊断。
              </p>
              <Link
                href="/forget"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-forget-bg)] px-3.5 text-[var(--text-sm)] font-medium text-[var(--color-forget)] transition-colors hover:bg-[var(--color-forget)]/15"
              >
                遗忘词分析
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </div>
          </Tile>
        )}
      </div>
    </div>
  )
}
