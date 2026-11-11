'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import type { ForgetDiagnosis } from '@momo/ai'
import type { FocusWordDto } from '@momo/types'
import { Icon } from '@/components/icons'
import { EmptyTile, ErrorNote, PageHeader, Segmented, Tile, TileSkeleton } from '@/components/kit'
import { diagnoseWord } from '@/lib/ai'
import { getStickingWords, getTodayForgotten } from '@/lib/maimemo'

const REASON_LABELS: Record<string, string> = {
  SPELLING_SIMILAR: '拼写相似',
  ABSTRACT_MEANING: '词义抽象',
  RARE_SENSE: '熟词僻义',
  CN_MEANING_CONFLICT: '中文释义混淆',
  COLLOCATION_WEAK: '搭配不熟',
  ROOT_DIVERGENCE: '词根分叉',
  LACK_CONTEXT: '缺少语境'
}

type Tab = 'today' | 'sticking'

const EMPTY_COPY: Record<Tab, { title: string; description: string }> = {
  today: {
    title: '今天没有遗忘任何单词',
    description: '完成今日复习后回到这里，遗忘的词会被自动列出并支持 AI 诊断。'
  },
  sticking: {
    title: '还没有顽固词',
    description: '顽固词来自墨墨官方标记（多次遗忘的词），继续学习后会出现在这里。'
  }
}

/** 遗忘词分析：今日遗忘 / 顽固词 + AI 原因诊断（deepseek-reasoner） */
export default function ForgetPage()
{
  const [tab, setTab] = useState<Tab>('today')
  const [diagnosis, setDiagnosis] = useState<{ word: string; data: ForgetDiagnosis } | null>(null)

  const query = useQuery({
    queryKey: ['forget', tab],
    queryFn: () => (tab === 'today' ? getTodayForgotten() : getStickingWords())
  })

  const diagnose = useMutation({
    mutationFn: (spelling: string) => diagnoseWord(spelling),
    onSuccess: (data, spelling) => setDiagnosis({ word: spelling, data })
  })

  const words: FocusWordDto[] = query.data?.words ?? []

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
              ['sticking', '顽固词']
            ]}
            onChange={(next) =>
            {
              setTab(next)
              setDiagnosis(null)
            }}
          />
        }
      />

      {query.isPending && <TileSkeleton />}

      {query.isError && (
        <ErrorNote
          message={
            query.error instanceof Error ? query.error.message : '加载失败，请稍后重试'
          }
        />
      )}

      {query.data && (
        <>
          {query.data.degraded && (
            <p className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-vague)]/30 bg-[var(--color-vague-bg)] px-4 py-2.5 text-[var(--text-sm)] text-[var(--color-vague)]">
              <Icon name="alert" className="h-4 w-4 shrink-0" />
              墨墨学习数据接口暂不可用，以下可能不是最新数据。
            </p>
          )}

          {words.length === 0 ? (
            <EmptyTile title={EMPTY_COPY[tab].title} description={EMPTY_COPY[tab].description} />
          ) : (
            <Tile hover={false} index={1} className="p-0! overflow-hidden">
              <ul className="divide-y divide-[var(--color-border)]">
                {words.map((word) =>
                {
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
                          {typeof word.studyCount === 'number' ? `学习 ${word.studyCount} 次` : ''}
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
          )}

          {diagnose.isError && (
            <div className="mt-4">
              <ErrorNote
                message={
                  diagnose.error instanceof Error
                    ? diagnose.error.message
                    : '诊断失败，请稍后重试'
                }
              />
            </div>
          )}

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
                遗忘原因由 AI 推测（基于该词的学习次数与标签），仅供参考。
              </p>
            </Tile>
          )}
        </>
      )}
    </div>
  )
}
