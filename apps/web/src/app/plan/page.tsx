'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Tile } from '@/components/kit'

interface PressureResponse
{
  days: { date: string; count: number }[]
  degraded?: boolean
}

interface AdviceResponse
{
  advice: string
  basis: string[]
}

/** 学习计划页（FR-11）：总词数 + 复习压力 + AI 建议 + 加词即复习 */
export default function PlanPage()
{
  const summary = useQuery({
    queryKey: ['plan', 'summary'],
    queryFn: () => apiFetch<{ total: number | null; degraded?: boolean }>('/api/plan/summary')
  })

  const pressure = useQuery({
    queryKey: ['plan', 'pressure'],
    queryFn: () => apiFetch<PressureResponse>('/api/plan/pressure?days=7')
  })

  const [advice, setAdvice] = useState<AdviceResponse | null>(null)
  const [adviceError, setAdviceError] = useState<string | null>(null)
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [addText, setAddText] = useState('')
  const [addMsg, setAddMsg] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function loadAdvice(): Promise<void>
  {
    setAdviceLoading(true)
    setAdviceError(null)

    try
    {
      setAdvice(await apiFetch<AdviceResponse>('/api/plan/advice'))
    }
    catch (error)
    {
      setAdviceError((error as ApiError).message)
    }
    finally
    {
      setAdviceLoading(false)
    }
  }

  async function addAndReview(): Promise<void>
  {
    setAddError(null)
    setAddMsg(null)

    const spellings = addText
      .split(/[\s,;，；\n]+/)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean)

    try
    {
      const data = await apiFetch<{ addedCount: number; unknownSpellings: number }>(
        '/api/plan/add-and-review',
        { method: 'POST', body: JSON.stringify({ spellings }) }
      )

      setAddMsg(`已加入并安排立即复习 ${data.addedCount} 个词` +
        (data.unknownSpellings > 0 ? `（${data.unknownSpellings} 个不在词库被跳过）` : ''))
      setAddText('')
    }
    catch (error)
    {
      setAddError((error as ApiError).message)
    }
  }

  const maxCount = Math.max(...(pressure.data?.days.map((d) => d.count) ?? [0]), 1)

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader title="学习计划" description="基于真实到期数据的复习压力与 AI 建议" />

      <div className="grid grid-cols-12 gap-4">
        {/* 总词数 + 压力 */}
        <Tile index={0} className="col-span-12 lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">计划总词数</p>
            <p className="tabular font-[family-name:var(--font-mono)] text-[var(--text-xl)] font-semibold">
              {summary.data?.total ?? '—'}
            </p>
          </div>

          <p className="mt-5 text-[var(--text-sm)] text-[var(--color-text-muted)]">未来 7 天复习压力</p>
          {pressure.data && pressure.data.days.length > 0 ? (
            <div className="mt-3 flex h-32 items-end gap-2">
              {pressure.data.days.map((day, i) => (
                <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className="tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                    {day.count}
                  </span>
                  <div
                    className="w-full rounded-t-md bg-[var(--color-info)] transition-all"
                    style={{
                      height: `${Math.max(4, (day.count / maxCount) * 96)}px`,
                      opacity: 0.45 + (0.55 * (i === 0 ? 1 : day.count / maxCount))
                    }}
                  />
                  <span className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                    {i === 0 ? '今天' : day.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 flex h-32 items-center justify-center text-[var(--text-sm)] text-[var(--color-text-subtle)]">
              {pressure.data?.degraded ? '学习数据接口暂不可用' : '载入中…'}
            </p>
          )}
        </Tile>

        {/* AI 建议 */}
        <Tile index={1} className="col-span-12 lg:col-span-5">
          <div className="flex items-center justify-between">
            <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">AI 学习建议</p>
            <button
              type="button"
              onClick={() => void loadAdvice()}
              disabled={adviceLoading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 text-[var(--text-xs)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
            >
              <Icon name="refresh" className={`h-3.5 w-3.5 ${adviceLoading ? 'animate-spin' : ''}`} />
              {adviceLoading ? '生成中…' : advice ? '重新生成' : '生成建议'}
            </button>
          </div>

          {adviceError && (
            <div className="mt-3">
              <ErrorNote message={adviceError} />
            </div>
          )}

          {advice ? (
            <div className="mt-3">
              <p className="rounded-md bg-[var(--color-accent-bg)] px-4 py-3 text-[var(--text-sm)] leading-relaxed">
                {advice.advice}
              </p>
              <p className="mt-3 text-[var(--text-xs)] font-medium text-[var(--color-text-subtle)]">
                数据依据
              </p>
              <ul className="mt-1 space-y-1">
                {advice.basis.map((item) => (
                  <li key={item} className="flex items-start gap-1.5 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-border-strong)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            !adviceLoading &&
            !adviceError && (
              <p className="mt-4 text-[var(--text-sm)] text-[var(--color-text-subtle)]">
                点击「生成建议」，AI 会基于你的到期词量与近期完成情况给出安排建议。
              </p>
            )
          )}
        </Tile>

        {/* 加词即复习 */}
        <Tile index={2} hover={false} className="col-span-12">
          <p className="text-[var(--text-sm)] font-medium">加词并立即复习</p>
          <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            加入学习计划并安排马上复习（不受墨墨等级限制）
          </p>
          <textarea
            rows={2}
            value={addText}
            onChange={(event) => setAddText(event.target.value)}
            placeholder="粘贴单词列表（空格 / 逗号 / 换行分隔）"
            className="mt-3 w-full resize-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 py-2.5 text-[var(--text-sm)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
          />
          <button
            type="button"
            disabled={!addText.trim()}
            onClick={() => void addAndReview()}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            <Icon name="plus" className="h-4 w-4" />
            加入并复习
          </button>
          {addMsg && <p className="mt-2 text-[var(--text-xs)] text-[var(--color-familiar)]">{addMsg}</p>}
          {addError && (
            <div className="mt-2">
              <ErrorNote message={addError} />
            </div>
          )}
        </Tile>
      </div>
    </div>
  )
}
