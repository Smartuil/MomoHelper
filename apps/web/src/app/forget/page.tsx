'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { FocusWordDto } from '@momo/types'
import { Icon } from '@/components/icons'
import { EmptyTile, ErrorNote, PageHeader, Segmented, Tile, TileSkeleton } from '@/components/kit'

interface WordsResponse
{
  words: FocusWordDto[]
  degraded?: boolean
}

interface RangeWord
{
  vocId: string
  spelling: string
  count: number
  lastDate: string
}

interface Diagnosis
{
  reason: string
  explanation: string
  suggestion: string
}

const REASON_LABELS: Record<string, string> = {
  SPELLING_SIMILAR: '拼写相似',
  ABSTRACT_MEANING: '词义抽象',
  RARE_SENSE: '熟词僻义',
  CN_MEANING_CONFLICT: '中文释义混淆',
  COLLOCATION_WEAK: '搭配不熟',
  ROOT_DIVERGENCE: '词根分叉',
  LACK_CONTEXT: '缺少语境'
}

type Tab = 'today' | 'sticking' | 'frequent'

/** 遗忘词分析（FR-3）：今日 / 顽固词 / 高频遗忘 + AI 诊断 + 顽固词本 */
export default function ForgetPage()
{
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('today')
  const [diagnosis, setDiagnosis] = useState<{ word: string; data: Diagnosis } | null>(null)
  const [notepadMsg, setNotepadMsg] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['forget', tab],
    queryFn: () =>
      apiFetch<WordsResponse & { approximate?: boolean; description?: string }>(
        tab === 'today'
          ? '/api/forget/today'
          : tab === 'sticking'
            ? '/api/forget/sticking'
            : '/api/forget/frequent'
      )
  })

  const diagnose = useMutation({
    mutationFn: (spelling: string) =>
      apiFetch<Diagnosis>('/api/forget/diagnose', {
        method: 'POST',
        body: JSON.stringify({ spelling })
      }),
    onSuccess: (data, spelling) => setDiagnosis({ word: spelling, data })
  })

  const addToNotepad = useMutation({
    mutationFn: (words: string[]) =>
      apiFetch<{ added: number; total: number }>('/api/forget/notepad', {
        method: 'POST',
        body: JSON.stringify({ words })
      }),
    onSuccess: (data) =>
    {
      setNotepadMsg(`已加入顽固词本（新增 ${data.added}，共 ${data.total} 词）`)
      void queryClient.invalidateQueries({ queryKey: ['forget'] })
    },
    onError: (error) => setNotepadMsg((error as ApiError).message)
  })

  const words = query.data?.words ?? []

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="遗忘词分析"
        description="今日遗忘来自作答记录，顽固词来自墨墨官方多次遗忘标记"
        actions={
          <Segmented
            ariaLabel="范围"
            value={tab}
            options={[
              ['today', '今日遗忘'],
              ['sticking', '顽固词'],
              ['frequent', '高频遗忘']
            ]}
            onChange={(next) =>
            {
              setTab(next)
              setDiagnosis(null)
              setNotepadMsg(null)
            }}
          />
        }
      />

      {query.isPending && <TileSkeleton />}

      {query.isError && <ErrorNote message={(query.error as ApiError).message} />}

      {query.data && (
        <>
          {query.data.degraded && (
            <p className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-vague)]/30 bg-[var(--color-vague-bg)] px-4 py-2.5 text-[var(--text-sm)] text-[var(--color-vague)]">
              <Icon name="alert" className="h-4 w-4 shrink-0" />
              墨墨学习数据接口暂不可用，以下可能不是最新数据。
            </p>
          )}

          {query.data.approximate && query.data.description && (
            <p className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-info)]/30 bg-[var(--color-info-bg)] px-4 py-2.5 text-[var(--text-xs)] text-[var(--color-info)]">
              <Icon name="alert" className="h-4 w-4 shrink-0" />
              {query.data.description}
            </p>
          )}

          {words.length === 0 ? (
            <EmptyTile
              title={
                tab === 'today'
                  ? '今天没有遗忘任何单词'
                  : tab === 'sticking'
                    ? '还没有顽固词'
                    : '还没有累积到高频遗忘词'
              }
              description={
                tab === 'today'
                  ? '完成今日复习后回到这里，遗忘的词会被自动列出并支持 AI 诊断。'
                  : tab === 'sticking'
                    ? '顽固词来自墨墨官方标记（多次遗忘的词），继续学习后会出现在这里。'
                    : '高频遗忘词基于平台每日累积的遗忘事件，使用几天后自动出现。'
              }
            />
          ) : (
            <>
              <Tile hover={false} index={1} className="p-0! overflow-hidden">
                <ul className="divide-y divide-[var(--color-border)]">
                  {words.map((entry) => {
                    const word = entry as FocusWordDto & { count?: number }
                    const isSticking = word.tags?.includes('STICKING')

                    return (
                      <li
                        key={word.vocId}
                        className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 transition-colors hover:bg-[var(--color-bg-subtle)]"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                            {word.spelling}
                          </span>
                          {isSticking && (
                            <span className="rounded-full bg-[var(--color-forget-bg)] px-2 py-0.5 text-[var(--text-xs)] font-medium text-[var(--color-forget)]">
                              顽固
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                            {tab === 'frequent'
                              ? `遗忘 ${word.count} 次`
                              : typeof word.studyCount === 'number'
                                ? `学习 ${word.studyCount} 次`
                                : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => diagnose.mutate(word.spelling)}
                            disabled={diagnose.isPending}
                            className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[var(--text-xs)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
                          >
                            {diagnose.isPending && diagnose.variables === word.spelling
                              ? '诊断中…'
                              : 'AI 诊断'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Tile>

              {/* 批量加入顽固词本 */}
              {(tab === 'sticking' || tab === 'frequent') && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={addToNotepad.isPending}
                    onClick={() =>
                      addToNotepad.mutate(words.map((word) => (word as FocusWordDto).spelling))
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border-strong)] px-4 text-[var(--text-sm)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
                  >
                    <Icon name="archive" className="h-4 w-4" />
                    {addToNotepad.isPending ? '加入中…' : '全部加入顽固词本'}
                  </button>
                  {notepadMsg && (
                    <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">{notepadMsg}</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* 诊断结果 */}
          {diagnosis && (
            <Tile index={2} hover={false} className="mt-4 border-l-4! border-l-[var(--color-vague)]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                  {diagnosis.word}
                </p>
                <span className="rounded-full bg-[var(--color-vague-bg)] px-2.5 py-0.5 text-[var(--text-xs)] font-medium text-[var(--color-vague)]">
                  {REASON_LABELS[diagnosis.data.reason] ?? diagnosis.data.reason}
                </span>
              </div>
              <p className="mt-2 text-[var(--text-sm)] leading-relaxed">
                {diagnosis.data.explanation}
              </p>
              <p className="mt-2 rounded-md bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-[var(--text-sm)]">
                <span className="text-[var(--text-xs)] font-medium text-[var(--color-familiar)]">
                  补救建议
                </span>
                <span className="mt-0.5 block">{diagnosis.data.suggestion}</span>
              </p>
              <p className="mt-2 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                遗忘原因由 AI 推测，仅供参考。
              </p>
            </Tile>
          )}
        </>
      )}
    </div>
  )
}
