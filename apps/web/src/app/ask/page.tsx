'use client'

import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Segmented, Tile } from '@/components/kit'
import { askStream } from '@/lib/ai'
import {
  getAiThinkingMode,
  setAiThinkingMode,
  type AiThinkingMode
} from '@/lib/settings'

/**
 * AI 问词：浏览器直连 DeepSeek 流式接口。
 * 回答自动注入该词的真实学习数据（学习次数 / 顽固标记）；
 * 未绑定墨墨时也能提问，只是缺少学习上下文。
 * 思考模式由用户在此页选择（开 / 关），不设默认，选择会记住。
 */
export default function AskPage()
{
  const [question, setQuestion] = useState('')
  const [spelling, setSpelling] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** null = 用户还没选过思考模式（localStorage 无记录） */
  const [thinking, setThinking] = useState<AiThinkingMode | null>(null)

  const answerRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)

  // 卸载时中断进行中的流
  useEffect(
    () => () =>
    {
      abortRef.current?.abort()
    },
    []
  )

  // 挂载后读取已保存的选择（localStorage 仅浏览器可用）
  useEffect(
    () =>
    {
      setThinking(getAiThinkingMode())
    },
    []
  )

  function chooseThinking(mode: AiThinkingMode): void
  {
    setThinking(mode)
    setAiThinkingMode(mode)
    setError(null)
  }

  function stop(): void
  {
    abortRef.current?.abort()
  }

  async function submit(): Promise<void>
  {
    const text = question.trim()

    if (!text || busy)
    {
      return
    }

    // 思考模式不设默认：未选择时引导用户先选
    if (!thinking)
    {
      setError('请先选择思考模式：开启回答更深入，关闭回答更快')
      return
    }

    setBusy(true)
    setError(null)
    answerRef.current = ''
    setAnswer('')

    const controller = new AbortController()
    abortRef.current = controller

    try
    {
      await askStream(
        text,
        spelling.trim() || undefined,
        thinking === 'on',
        (delta) =>
        {
          answerRef.current += delta
          setAnswer(answerRef.current)
        },
        controller.signal
      )
    }
    catch (err)
    {
      // 用户主动停止不算错误
      if (err instanceof DOMException && err.name === 'AbortError')
      {
        // 忽略
      }
      else
      {
        setError(err instanceof Error ? err.message : '请求失败，请稍后重试')
      }
    }
    finally
    {
      if (abortRef.current === controller)
      {
        abortRef.current = null
      }

      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        title="问词"
        description="回答结合你的真实学习数据；涉及词根、词源的说明属于推测"
      />

      <Tile index={0} hover={false}>
        <form
          onSubmit={(event) =>
          {
            event.preventDefault()
            void submit()
          }}
        >
          <label htmlFor="spelling" className="block text-[var(--text-sm)]">
            涉及单词（可选）
          </label>
          <input
            id="spelling"
            value={spelling}
            maxLength={64}
            onChange={(event) => setSpelling(event.target.value)}
            placeholder="例如：affect"
            className="mt-2 h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
          />

          <label htmlFor="question" className="mt-4 block text-[var(--text-sm)]">
            你的问题
          </label>
          <textarea
            id="question"
            required
            rows={3}
            maxLength={500}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：affect 和 effect 怎么区分？"
            className="mt-2 w-full resize-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 py-2.5 text-[var(--text-sm)] transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
          />
          <p className="mt-1 text-right font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            {question.length} / 500
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-6 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              <Icon name="message" className="h-4 w-4" />
              {busy ? '回答中…' : '发送'}
            </button>
            {busy && (
              <button
                type="button"
                onClick={stop}
                className="inline-flex h-10 items-center rounded-md border border-[var(--color-border-strong)] px-4 text-[var(--text-sm)] transition-colors hover:bg-[var(--color-bg-subtle)]"
              >
                停止
              </button>
            )}
            <div className="ml-auto flex items-center gap-2.5">
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
            </div>
          </div>
        </form>
      </Tile>

      {error && (
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      )}

      {answer && (
        <Tile index={1} hover={false} className="mt-4">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
            >
              <Icon name="zap" className="h-4 w-4" />
            </span>
            <p className="min-w-0 whitespace-pre-wrap text-[var(--text-base)] leading-relaxed">
              {answer}
              {busy && (
                <span
                  aria-hidden
                  className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-[var(--color-accent)] align-middle"
                />
              )}
            </p>
          </div>
        </Tile>
      )}
    </div>
  )
}
