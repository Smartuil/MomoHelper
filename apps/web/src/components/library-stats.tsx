/**
 * 词库 · 掌握度视图。
 *
 * 只看分布不看单词：多少次算熟、多少词刚见过、标签与作答的构成。
 * 全部数据来自 analyzeLibrary 的聚合结果，组件本身无状态。
 */

import type { LibraryBucketDto, LibraryStatsDto } from '@momo/types'

import { Tile } from '@/components/kit'

function Metric({
  label,
  value,
  unit
}: {
  label: string
  value: string | number
  unit?: string
})
{
  return (
    <div className="rounded-md bg-[var(--color-bg-subtle)] px-4 py-3">
      <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">{label}</p>
      <p className="mt-1 tabular font-[family-name:var(--font-mono)] text-[var(--text-xl)] font-semibold leading-none">
        {value}
        {unit && (
          <span className="ml-1 text-[var(--text-xs)] font-normal text-[var(--color-text-subtle)]">
            {unit}
          </span>
        )}
      </p>
    </div>
  )
}

function BucketRow({
  bucket,
  max,
  emphasize
}: {
  bucket: LibraryBucketDto
  max: number
  emphasize?: 'forget' | 'vague' | 'familiar' | 'accent' | 'muted'
})
{
  const color =
    emphasize === 'forget'
      ? 'var(--color-forget)'
      : emphasize === 'vague'
        ? 'var(--color-vague)'
        : emphasize === 'familiar'
          ? 'var(--color-familiar)'
          : emphasize === 'muted'
            ? 'var(--color-border-strong)'
            : 'var(--color-accent)'

  return (
    <div className="flex items-center gap-3">
      <span className="w-[104px] shrink-0 truncate text-[var(--text-xs)] text-[var(--color-text-muted)]">
        {bucket.label}
      </span>
      <span className="h-3 flex-1 overflow-hidden rounded-sm bg-[var(--color-bg-subtle)]">
        <span
          className="block h-full rounded-sm"
          style={{ width: `${max === 0 ? 0 : (bucket.count / max) * 100}%`, background: color }}
        />
      </span>
      <span className="w-[104px] shrink-0 text-right font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-muted)]">
        <span className="tabular text-[var(--color-text)]">{bucket.count.toLocaleString('zh-CN')}</span>
        {' · '}
        {(bucket.ratio * 100).toFixed(1)}%
      </span>
    </div>
  )
}

/** 分布小卡：标签 / 作答共用 */
function DistributionTile({
  title,
  description,
  buckets,
  tone,
  index
}: {
  title: string
  description: string
  buckets: LibraryBucketDto[]
  tone: (key: string) => 'forget' | 'vague' | 'familiar' | 'accent' | 'muted'
  index: number
})
{
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1)

  return (
    <Tile index={index} className="col-span-12 lg:col-span-6">
      <p className="text-[var(--text-sm)]">{title}</p>
      <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">{description}</p>
      <div className="mt-4 space-y-2.5">
        {buckets.map((bucket) => (
          <BucketRow key={bucket.key} bucket={bucket} max={max} emphasize={tone(bucket.key)} />
        ))}
      </div>
    </Tile>
  )
}

export function LibraryStatsView({ stats }: { stats: LibraryStatsDto })
{
  const maxBucket = Math.max(...stats.countBuckets.map((bucket) => bucket.count), 1)
  const familiarRatio =
    stats.total === 0
      ? 0
      : (stats.countBuckets
          .filter((bucket) => bucket.key === '6-10' || bucket.key === '11-20' || bucket.key === '20+')
          .reduce((sum, bucket) => sum + bucket.count, 0) /
          stats.total) *
        100

  return (
    <div className="grid grid-cols-12 gap-4">
      <Tile index={0} className="col-span-12">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="总词数" value={stats.total.toLocaleString('zh-CN')} />
          <Metric label="平均学习" value={stats.avgStudyCount} unit="次" />
          <Metric label="顽固词" value={stats.stickingCount.toLocaleString('zh-CN')} />
          <Metric label="只学过 1 次" value={stats.singleStudyCount.toLocaleString('zh-CN')} />
        </div>
      </Tile>

      <Tile index={1} className="col-span-12">
        <div className="flex items-baseline justify-between">
          <p className="text-[var(--text-sm)]">学习次数分布</p>
          <p className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            {familiarRatio.toFixed(1)}% 的词学过 6 次以上
          </p>
        </div>
        <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
          按 study_count 分桶，次数越多说明见得多、复习间隔越长
        </p>
        <div className="mt-5 space-y-3">
          {stats.countBuckets.map((bucket) => (
            <BucketRow key={bucket.key} bucket={bucket} max={maxBucket} />
          ))}
        </div>
      </Tile>

      <DistributionTile
        index={2}
        title="标签分布"
        description="墨墨给单词打的标记：顽固词反复遗忘，熟词可降低复习频率"
        buckets={stats.tagBuckets}
        tone={(key) => (key === 'STICKING' ? 'forget' : key === 'WELL_FAMILIAR' ? 'accent' : 'muted')}
      />

      <DistributionTile
        index={3}
        title="最近一次作答"
        description="每个词最后一次复习时的自我评价，决定下次复习间隔"
        buckets={stats.responseBuckets}
        tone={(key) =>
          key === 'FORGET' ? 'forget' : key === 'VAGUE' ? 'vague' : key === 'FAMILIAR' ? 'familiar' : 'muted'
        }
      />
    </div>
  )
}
