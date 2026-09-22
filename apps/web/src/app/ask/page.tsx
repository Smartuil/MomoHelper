'use client'

import { useEffect, useRef, useState } from 'react'

import { baseUrl } from '@/lib/stream'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Tile } from '@/components/kit'

/**
 * AI 问词（FR-5）：SSE 流式回答。
 * 首字 < 3s（NFR-1.3）；回答结合真实学习数据，服务器端注入。
 */
export default function AskPage()
{
  const [question, setQuestion] = useState('')
  const [spelling, setSpelling] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const answerRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)

  // 卸载时中断进行中的流，避免泄漏与对已卸载组件 setState
  useEffect(
    () => () =>
    {
      abortRef.current?.abort()
    },
    []
  )

  function stop(): void
  {
    abortRef.current?.abort()
  }

  async function submit(): Promise<void>
  {
    if (!question.trim() || busy)
    {
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
      const response = await fetch(`${baseUrl()}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({ question, spelling: spelling || undefined })
      })

      if (!response.ok || !response.body)
      {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null

        throw new Error(body?.error?.message ?? '请求失败')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // 从 buffer 中解析完整的 SSE 事件；返回是否遇到 error 事件。
      // 非 flush：只处理已收尾（\n\n 结束）的事件，残余留在 buffer；
      // flush：流结束后清空全部残留（含 decoder 尾字节与最后一条未收尾事件）。
      const consume = (flush: boolean): boolean =>
      {
        if (flush)
        {
          buffer += decoder.decode()
        }

        const parts = buffer.split('\n\n')
        buffer = flush ? '' : (parts.pop() ?? '')

        for (const event of parts)
        {
          for (const line of event.split('\n'))
          {
            if (!line.startsWith('data:'))
            {
              continue
            }

            try
            {
              const payload = JSON.parse(line.slice(5).trim()) as {
                event: string
                text?: string
                message?: string
              }

              if (payload.event === 'delta' && payload.text)
              {
                answerRef.current += payload.text
                setAnswer(answerRef.current)
              }

              if (payload.event === 'error')
              {
                setError(payload.message ?? 'AI 服务暂时不可用')
                return true
              }
            }
            catch
            {
              // 忽略无法解析的分片（如心跳）
            }
          }
        }

        return false
      }

      let failed = false

      for (;;)
      {
        const { done, value } = await reader.read()

        if (done)
        {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        failed = consume(false)

        if (failed)
        {
          break
        }
      }

      // 流结束后 flush 残留字节（多字节字符可能被切断）与最后一条未收尾的事件
      if (!failed)
      {
        consume(true)
      }
    }
    catch (err)
    {
      if (err instanceof DOMException && err.name === 'AbortError')
      {
        // 用户主动停止，不算错误
      }
      else
      {
        setError(err instanceof Error ? err.message : '请求失败')
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

          <div className="mt-2 flex gap-3">
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
