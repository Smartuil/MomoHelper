'use client'

import { useRef, useState } from 'react'

import { baseUrl } from '@/lib/stream'

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

    try
    {
      const response = await fetch(`${baseUrl()}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

      for (;;)
      {
        const { done, value } = await reader.read()

        if (done)
        {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events)
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
              }
            }
            catch
            {
              // 忽略心跳分片
            }
          }
        }
      }
    }
    catch (err)
    {
      setError(err instanceof Error ? err.message : '请求失败')
    }
    finally
    {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="border-b border-[var(--color-border)] pb-6 font-[family-name:var(--font-display)] text-[var(--text-xl)]">
        问词
      </h1>

      <form
        className="mt-8"
        onSubmit={(event) =>
        {
          event.preventDefault()
          void submit()
        }}
      >
        <label htmlFor="spelling" className="block text-[var(--text-sm)]">
          涉及单词（可选，回答会结合你的真实学习数据）
        </label>
        <input
          id="spelling"
          value={spelling}
          onChange={(event) => setSpelling(event.target.value)}
          placeholder="例如：affect"
          className="mt-2 h-9 w-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)]"
        />

        <label htmlFor="question" className="mt-4 block text-[var(--text-sm)]">
          你的问题
        </label>
        <textarea
          id="question"
          required
          rows={3}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="例如：affect 和 effect 怎么区分？"
          className="mt-2 w-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-[var(--text-sm)]"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-4 h-9 bg-[var(--color-accent)] px-6 text-[var(--text-sm)] text-white disabled:opacity-50"
        >
          {busy ? '回答中…' : '发送'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-6 text-[var(--text-sm)] text-[var(--color-forget)]">
          {error}
        </p>
      )}

      {answer && (
        <section className="mt-10 border-t border-[var(--color-border)] pt-6">
          <p className="whitespace-pre-wrap text-[var(--text-base)] leading-relaxed">{answer}</p>
          <p className="mt-4 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            本次回答基于你的学习数据；涉及词根、词源的说明属于推测。
          </p>
        </section>
      )}
    </div>
  )
}
