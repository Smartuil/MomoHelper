'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { ForgetDiagnosis } from '@momo/ai'
import type { FocusWordDto } from '@momo/types'
import { Icon } from '@/components/icons'
import { EmptyTile, ErrorNote, PageHeader, Segmented, Tile, TileSkeleton } from '@/components/kit'
import { diagnoseWord } from '@/lib/ai'
import {
  getDiagnoseHistory,
  saveDiagnosis,
  type DiagnoseRecord
} from '@/lib/diagnose-history'
import { getStickingWords, getTodayForgotten } from '@/lib/maimemo'
import { getAiThinkingMode, setAiThinkingMode, type AiThinkingMode } from '@/lib/settings'

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

function formatTime(iso: string): string
{
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai'
  })
}

/** 诊断结果展示（右栏面板 / 移动端展开共用） */
function DiagnosisBody({ record }: { record: DiagnoseRecord })
{
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-[family-name:var(--font-display)] text-[var(--text-lg)]">
          {record.spelling}
        </p>
        <span className="rounded-full bg-[var(--color-vague-bg)] px-2.5 py-0.5 text-[var(--text-xs)] font-medium text-[var(--color-vague)]">
          {REASON_LABELS[record.data.reason] ?? record.data.reason}
        </span>
      </div>
      <p className="mt-2.5 text-[var(--text-sm)] leading-relaxed">{record.data.explanation}</p>
      <p className="mt-3 rounded-md bg-[var(--color-bg-subtle)] px-3.5 py-2.5 text-[var(--text-sm)]">
        <span className="text-[var(--text-xs)] font-medium text-[var(--color-familiar)]">
          补救建议
        </span>
        <span className="mt-0.5 block">{record.data.suggestion}</span>
      </p>
      <p className="mt-2.5 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
        {formatTime(record.at)} 诊断{record.thinking ? ' · 深度思考' : ''} · 结果由 AI 推测，仅供参考
      </p>
    </>
  )
}

/** 遗忘词分析：左栏词列表 + 右栏固定诊断面板（master-detail） */
export default function ForgetPage()
{
  const [tab, setTab] = useState<Tab>('today')
  /** 当前选中的词（跨 Tab 保持，切 Tab 不丢） */
  const [selected, setSelected] = useState<string | null>(null)
  /** null = 用户还没选过思考模式（localStorage 无记录） */
  const [thinking, setThinking] = useState<AiThinkingMode | null>(null)
  /** 未选思考模式就点诊断时的提示 */
  const [modeNotice, setModeNotice] = useState<string | null>(null)
  /** 挂载后从 localStorage 载入的诊断历史（spelling 小写 → 记录） */
  const [history, setHistory] = useState<Map<string, DiagnoseRecord>>(new Map())

  useEffect(
    () =>
    {
      setThinking(getAiThinkingMode())

      // 载入历史诊断（spelling 小写 → 记录），已诊断的词直接回看不再请求
      const map = new Map<string, DiagnoseRecord>()

      for (const item of getDiagnoseHistory())
      {
        map.set(item.spelling.toLowerCase(), item)
      }

      setHistory(map)
    },
    []
  )

  function chooseThinking(mode: AiThinkingMode): void
  {
    setThinking(mode)
    setAiThinkingMode(mode)
    setModeNotice(null)
  }

  const query = useQuery({
    queryKey: ['forget', tab],
    queryFn: () => (tab === 'today' ? getTodayForgotten() : getStickingWords())
  })

  const diagnose = useMutation({
    mutationFn: ({ spelling, thinking }: { spelling: string; thinking: boolean }) =>
      diagnoseWord(spelling, thinking),
    onSuccess: (data, variables) =>
    {
      saveDiagnosis(variables.spelling, data, variables.thinking)
      setHistory((prev) =>
      {
        const next = new Map(prev)
        next.set(variables.spelling.toLowerCase(), {
          spelling: variables.spelling,
          at: new Date().toISOString(),
          thinking: variables.thinking,
          data
        })
        return next
      })
      setSelected(variables.spelling)
    }
  })

  const words: FocusWordDto[] = query.data?.words ?? []

  /** 右栏当前展示的记录：选中词的历史（新诊断完成后 history 即含它） */
  const currentRecord = selected ? history.get(selected.toLowerCase()) : undefined
  /** 选中词是否正在诊断中 */
  const isDiagnosingSelected =
    diagnose.isPending && diagnose.variables?.spelling === selected
  /** 选中词最近一次诊断是否失败 */
  const isFailedSelected = diagnose.isError && diagnose.variables?.spelling === selected

  function selectWord(spelling: string): void
  {
    setSelected(spelling)

    if (history.has(spelling.toLowerCase()))
    {
      return
    }

    // 未选思考模式时引导先选；有历史则直接回看，不触发请求
    if (!thinking)
    {
      setModeNotice('请先选择思考模式：开启诊断更深入，关闭诊断更快')
      return
    }

    setModeNotice(null)
    diagnose.mutate({ spelling, thinking: thinking === 'on' })
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="遗忘词分析"
        description="点左侧任意词，右侧查看诊断；已诊断的词带勾标记"
        actions={
          <div className="flex flex-wrap items-center gap-3">
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
              }}
            />
            <span className="flex items-center gap-2">
              <span className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                思考模式{thinking ? '' : '（未选择）'}
              </span>
              <Segmented
                ariaLabel="思考模式"
                value={thinking ?? ''}
                options={[
                  ['on', '开'],
                  ['off', '关']
                ]}
                onChange={(next) =>
                {
                  if (next === 'on' || next === 'off')
                  {
                    chooseThinking(next)
                  }
                }}
              />
            </span>
          </div>
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
          {modeNotice && (
            <div className="mb-4">
              <ErrorNote message={modeNotice} />
            </div>
          )}

          {query.data.degraded && (
            <p className="mb-4 flex items-center gap-2 rounded-md border border-[var(--color-vague)]/30 bg-[var(--color-vague-bg)] px-4 py-2.5 text-[var(--text-sm)] text-[var(--color-vague)]">
              <Icon name="alert" className="h-4 w-4 shrink-0" />
              墨墨学习数据接口暂不可用，以下可能不是最新数据。
            </p>
          )}

          {words.length === 0 ? (
            <EmptyTile title={EMPTY_COPY[tab].title} description={EMPTY_COPY[tab].description} />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              {/* 左栏：词列表（点行选中） */}
              <Tile hover={false} index={1} className="h-fit p-0! overflow-hidden">
                <ul className="divide-y divide-[var(--color-border)]">
                  {words.map((word) =>
                  {
                    const isSticking = word.tags?.includes('STICKING')
                    const record = history.get(word.spelling.toLowerCase())
                    const isSelected = selected?.toLowerCase() === word.spelling.toLowerCase()
                    const isBusy =
                      diagnose.isPending && diagnose.variables?.spelling === word.spelling

                    return (
                      <li key={word.vocId}>
                        <button
                          type="button"
                          onClick={() => selectWord(word.spelling)}
                          aria-current={isSelected ? 'true' : undefined}
                          className={`flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? 'bg-[var(--color-accent-bg)]'
                              : 'hover:bg-[var(--color-bg-subtle)]'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                              {word.spelling}
                            </span>
                            {isSticking && (
                              <span className="rounded-full bg-[var(--color-forget-bg)] px-2 py-0.5 text-[var(--text-xs)] font-medium text-[var(--color-forget)]">
                                顽固
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2.5">
                            <span className="tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                              {typeof word.studyCount === 'number' ? `${word.studyCount} 次` : ''}
                            </span>
                            {record ? (
                              <Icon
                                name="check"
                                className="h-4 w-4 shrink-0 text-[var(--color-familiar)]"
                              />
                            ) : (
                              <span className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                                {isBusy ? '诊断中…' : '诊断 →'}
                              </span>
                            )}
                          </span>
                        </button>

                        {/* 移动端：选中词的诊断就地展开（桌面端由右栏面板承担） */}
                        {isSelected && (
                          <div className="border-t border-[var(--color-border)] px-4 py-4 lg:hidden">
                            {isBusy ? (
                              <TileSkeleton />
                            ) : isFailedSelected ? (
                              <ErrorNote
                                message={
                                  diagnose.error instanceof Error
                                    ? diagnose.error.message
                                    : '诊断失败，请稍后重试'
                                }
                              />
                            ) : record ? (
                              <DiagnosisBody record={record} />
                            ) : (
                              <p className="text-[var(--text-sm)] text-[var(--color-text-subtle)]">
                                准备诊断…
                              </p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Tile>

              {/* 右栏：固定诊断面板（sticky，点词即换内容，不随列表滚动） */}
              <div className="sticky top-6 hidden h-fit lg:block">
                <Tile hover={false} index={2} className="min-h-[260px]">
                  {isDiagnosingSelected ? (
                    <div>
                      <div className="h-6 w-28 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
                      <div className="mt-4 h-4 w-full animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
                      <div className="mt-2.5 h-4 w-4/5 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
                      <div className="mt-2.5 h-4 w-3/5 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
                      <p className="mt-3 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                        {diagnose.variables?.spelling} 诊断中{diagnose.variables?.thinking ? '（深度思考，可能较慢）' : ''}…
                      </p>
                    </div>
                  ) : isFailedSelected ? (
                    <div>
                      <ErrorNote
                        message={
                          diagnose.error instanceof Error
                            ? diagnose.error.message
                            : '诊断失败，请稍后重试'
                        }
                      />
                      {selected && (
                        <button
                          type="button"
                          onClick={() => diagnose.mutate({ spelling: selected, thinking: thinking === 'on' })}
                          className="mt-3 inline-flex h-8 items-center rounded-md border border-[var(--color-border-strong)] px-4 text-[var(--text-sm)] transition-colors hover:bg-[var(--color-bg-subtle)]"
                        >
                          重试
                        </button>
                      )}
                    </div>
                  ) : currentRecord ? (
                    <DiagnosisBody record={currentRecord} />
                  ) : (
                    <div className="flex h-40 flex-col items-center justify-center text-center">
                      <Icon name="trending-down" className="h-7 w-7 text-[var(--color-text-subtle)]" />
                      <p className="mt-2.5 text-[var(--text-sm)] text-[var(--color-text-muted)]">
                        点击左侧任意词开始诊断
                      </p>
                      <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                        已诊断过的词会直接显示历史结果，不再重复请求
                      </p>
                    </div>
                  )}
                </Tile>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
