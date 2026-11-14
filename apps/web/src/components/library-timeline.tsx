/**
 * 词库 · 时间线视图。
 *
 * 按月看自己什么时候背得猛：add_date 是「加入词库」的时间，
 * first_study_date 是「第一次真背」的时间，两者差额即攒了没背的部分。
 */

import type { LibraryMonthRowDto } from '@momo/types'

import { Tile } from '@/components/kit'

/** 双柱月度图：灰柱=加入，青柱=首学 */
function MonthChart({ months }: { months: LibraryMonthRowDto[] })
{
  const max = Math.max(...months.map((month) => Math.max(month.added, month.firstStudied)), 1)
  const slot = 48
  const width = Math.max(months.length, 1) * slot
  const chartH = 112
  const baseY = 128

  return (
    <svg
      viewBox={`0 0 ${width} 152`}
      className="h-40 w-full"
      role="img"
      aria-label="近 12 个月每月加入词数与首次学习词数"
    >
      <line
        x1="0"
        y1={baseY}
        x2={width}
        y2={baseY}
        stroke="var(--color-border)"
        strokeWidth="1"
      />
      {months.map((month, i) =>
      {
        const addedH = (month.added / max) * chartH
        const firstH = (month.firstStudied / max) * chartH

        return (
          <g key={month.month}>
            <rect
              x={i * slot + 9}
              y={baseY - addedH}
              width="13"
              height={month.added > 0 ? Math.max(addedH, 2) : 0}
              rx="3"
              fill="var(--color-border-strong)"
            />
            <rect
              x={i * slot + 24}
              y={baseY - firstH}
              width="13"
              height={month.firstStudied > 0 ? Math.max(firstH, 2) : 0}
              rx="3"
              fill="var(--color-accent)"
            />
            <text
              x={i * slot + 23}
              y={baseY + 17}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-text-subtle)"
            >
              {month.month.slice(5)}月
            </text>
            <title>{`${month.month}：加入 ${month.added}，首学 ${month.firstStudied}`}</title>
          </g>
        )
      })}
    </svg>
  )
}

function Legend({ color, label }: { color: string; label: string })
{
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

export function LibraryTimelineView({ months }: { months: LibraryMonthRowDto[] })
{
  const addedTotal = months.reduce((sum, month) => sum + month.added, 0)
  const firstTotal = months.reduce((sum, month) => sum + month.firstStudied, 0)
  const peak = months.reduce<LibraryMonthRowDto | null>(
    (best, month) => (best === null || month.added > best.added ? month : best),
    null
  )
  const newestFirst = [...months].reverse()

  return (
    <div className="grid grid-cols-12 gap-4">
      <Tile index={0} className="col-span-12 lg:col-span-7">
        <div className="flex items-baseline justify-between">
          <p className="text-[var(--text-sm)]">每月加入 / 首学</p>
          <p className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            近 {months.length} 个月
          </p>
        </div>
        <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
          加入 {addedTotal.toLocaleString('zh-CN')} 词 · 首学 {firstTotal.toLocaleString('zh-CN')} 词
          {peak && peak.added > 0 && ` · 峰值 ${peak.month}（${peak.added} 词）`}
        </p>
        <div className="mt-4">
          {addedTotal === 0 && firstTotal === 0 ? (
            <p className="flex h-40 items-center justify-center text-[var(--text-sm)] text-[var(--color-text-subtle)]">
              这段时间没有加入或首学的记录。
            </p>
          ) : (
            <MonthChart months={months} />
          )}
        </div>
        <div className="mt-3 flex gap-4 text-[var(--text-xs)] text-[var(--color-text-muted)]">
          <Legend color="var(--color-border-strong)" label="加入词库" />
          <Legend color="var(--color-accent)" label="首次学习" />
        </div>
      </Tile>

      <Tile index={1} className="col-span-12 lg:col-span-5">
        <p className="text-[var(--text-sm)]">月度明细</p>
        <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
          留存率 = 当月首学 / 当月加入
        </p>

        <div className="mt-4 max-h-[320px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-[var(--color-surface)]">
              <tr className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                <th className="py-2 font-normal">月份</th>
                <th className="py-2 text-right font-normal">加入</th>
                <th className="py-2 text-right font-normal">首学</th>
                <th className="py-2 text-right font-normal">留存</th>
                <th className="py-2 text-right font-normal">累计</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((month) => (
                <tr
                  key={month.month}
                  className="border-t border-[var(--color-border)] text-[var(--text-sm)]"
                >
                  <td className="py-2 tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-muted)]">
                    {month.month}
                  </td>
                  <td className="py-2 text-right tabular">{month.added}</td>
                  <td className="py-2 text-right tabular">{month.firstStudied}</td>
                  <td className="py-2 text-right tabular text-[var(--color-text-muted)]">
                    {month.retention === null ? '—' : `${Math.round(month.retention * 100)}%`}
                  </td>
                  <td className="py-2 text-right tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                    {month.cumulative.toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tile>
    </div>
  )
}
