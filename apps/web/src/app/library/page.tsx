'use client'

/**
 * 词库页：把 query_study_records 的全量记录摊开看。
 *
 * 三个视图共用同一次全量拉取（IndexedDB 缓存），切换零请求：
 *   掌握度 = study_count / tags / last_response 的分布
 *   时间线 = add_date 与 first_study_date 的月度走势
 *   词表   = 全部 9 个字段逐行浏览
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { MaimemoAuthError } from '@momo/maimemo'
import { Icon } from '@/components/icons'
import { PageHeader, Segmented, Tile, TileSkeleton } from '@/components/kit'
import { LibraryStatsView } from '@/components/library-stats'
import { LibraryTableView } from '@/components/library-table'
import { LibraryTimelineView } from '@/components/library-timeline'
import { analyzeLibrary } from '@/lib/analyze'
import { loadLibrary } from '@/lib/library'
import { MaimemoNotConfiguredError } from '@/lib/maimemo'

type ViewKey = 'stats' | 'timeline' | 'table'

const VIEWS: [ViewKey, string][] = [
  ['stats', '掌握度'],
  ['timeline', '时间线'],
  ['table', '词表']
]

const QUERY_KEY = ['library'] as const

export default function LibraryPage()
{
  const [view, setView] = useState<ViewKey>('stats')
  const [progress, setProgress] = useState<{ loaded: number; total: number | null } | null>(null)
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => loadLibrary()
  })

  const refresh = useMutation({
    mutationFn: () =>
      loadLibrary({
        force: true,
        onProgress: (loaded, total) => setProgress({ loaded, total })
      }),
    onSuccess: (data) =>
    {
      queryClient.setQueryData(QUERY_KEY, data)
      setProgress(null)
    },
    onSettled: () => setProgress(null)
  })

  const records = query.data?.records
  const stats = useMemo(() => (records ? analyzeLibrary(records) : null), [records])

  const busy = refresh.isPending && progress !== null
  const refreshLabel = refresh.isPending
    ? progress
      ? `拉取中 ${progress.loaded}${progress.total ? ` / ${progress.total}` : ''}`
      : '准备中…'
    : '重新拉取'

  if (query.isPending)
  {
    return (
      <div>
        <PageHeader title="词库" description="正在读取学习记录…" />
        <div className="grid grid-cols-12 gap-4">
          <TileSkeleton className="col-span-12" />
          <TileSkeleton className="col-span-12" />
        </div>
      </div>
    )
  }

  if (query.isError)
  {
    const error = query.error
    const needSetup =
      error instanceof MaimemoNotConfiguredError || error instanceof MaimemoAuthError

    return (
      <Tile hover={false} className="mt-16 text-center">
        <Icon name="alert" className="mx-auto h-8 w-8 text-[var(--color-vague)]" />
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-[var(--text-lg)]">
          {needSetup ? '需要先配置墨墨 Token' : '词库加载失败'}
        </h1>
        <p className="mx-auto mt-1 max-w-md text-[var(--text-sm)] text-[var(--color-text-muted)]">
          {error instanceof MaimemoNotConfiguredError
            ? '尚未绑定墨墨 Token，绑定后即可读取全量学习记录。'
            : error instanceof MaimemoAuthError
              ? '墨墨 Token 已失效或无效，请到设置页重新绑定。'
              : error.message}
        </p>
        <div className="mt-5 flex justify-center gap-3">
          {needSetup ? (
            <Link
              href="/settings"
              className="inline-flex h-9 items-center rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white hover:bg-[var(--color-accent-hover)]"
            >
              <Icon name="sliders" className="mr-2 h-4 w-4" />
              去设置
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
  const fetchedLabel = new Date(data.fetchedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai'
  })

  return (
    <div>
      <PageHeader
        title="词库"
        description={`${(data.total ?? data.records.length).toLocaleString('zh-CN')} 词 · 更新于 ${fetchedLabel}`}
        actions={
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-[var(--text-sm)] shadow-[var(--shadow-tile)] transition-all hover:-translate-y-px hover:shadow-[var(--shadow-tile-hover)] disabled:opacity-50"
          >
            <Icon
              name="refresh"
              className={`h-4 w-4 ${busy || refresh.isPending ? 'animate-spin' : ''}`}
            />
            {refreshLabel}
          </button>
        }
      />

      {!data.complete && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-vague)]/30 bg-[var(--color-vague-bg)] px-4 py-2.5 text-[var(--text-sm)] text-[var(--color-vague)]">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          分页边界异常，本次只取到 {data.records.length.toLocaleString('zh-CN')} 条
          {data.total ? `（接口返回总数 ${data.total.toLocaleString('zh-CN')}）` : ''}
          ，统计结果可能偏小。
        </p>
      )}

      {refresh.isError && (
        <p className="mb-4 rounded-md border border-[var(--color-forget)]/25 bg-[var(--color-forget-bg)] px-4 py-2.5 text-[var(--text-sm)] text-[var(--color-forget)]">
          重新拉取失败：{refresh.error.message}
        </p>
      )}

      <div className="mb-4">
        <Segmented
          ariaLabel="词库视图"
          value={view}
          options={VIEWS}
          onChange={(next) => setView(next)}
        />
      </div>

      {stats && view === 'stats' && <LibraryStatsView stats={stats} />}
      {stats && view === 'timeline' && <LibraryTimelineView months={stats.months} />}
      {view === 'table' && (
        <Tile hover={false}>
          <LibraryTableView records={data.records} />
        </Tile>
      )}
    </div>
  )
}
