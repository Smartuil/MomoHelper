'use client'

import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/icons'
import type { WordCard } from '@/lib/word-card'

/**
 * 词卡弹层：点击单词出现，点击其他任意位置关闭。
 * 数据来源标注「我的自建」/「AI 生成」；加载中显示骨架。
 */
export function WordCardPopover({
  spelling,
  onClose
}: {
  spelling: string
  onClose: () => void
})
{
  const [card, setCard] = useState<WordCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // 点击卡片外任意位置关闭
  useEffect(
    () =>
    {
      function onDown(event: MouseEvent): void
      {
        if (ref.current && !ref.current.contains(event.target as Node))
        {
          onClose()
        }
      }

      // mousedown 先于 click，避免触发按钮的 click 冒泡误关
      document.addEventListener('mousedown', onDown)
      return () => document.removeEventListener('mousedown', onDown)
    },
    [onClose]
  )

  // 按需取词卡（组件挂载才请求；含 24h localStorage 缓存）
  useEffect(
    () =>
    {
      let cancelled = false

      import('@/lib/word-card')
        .then(({ getWordCard }) => getWordCard(spelling))
        .then((data) =>
        {
          if (!cancelled) setCard(data)
        })
        .catch((err) =>
        {
          if (!cancelled)
          {
            setError(err instanceof Error ? err.message : '获取词条失败，请稍后重试')
          }
        })

      return () =>
      {
        cancelled = true
      }
    },
    [spelling]
  )

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${spelling} 词条`}
      className="absolute left-0 top-full z-20 mt-2 w-[min(420px,calc(100vw-80px))] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-[var(--text-md)] font-semibold">
            {spelling}
          </span>
          {card?.phonetic && (
            <span className="font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
              {card.phonetic}
            </span>
          )}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[var(--text-xs)] font-medium ${
            card?.source === 'mine'
              ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]'
              : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-subtle)]'
          }`}
        >
          {card ? (card.source === 'mine' ? '我的自建' : 'AI 生成') : ''}
        </span>
      </div>

      {error ? (
        <p className="mt-2 text-[var(--text-sm)] text-[var(--color-forget)]">{error}</p>
      ) : !card ? (
        <div>
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
        </div>
      ) : (
        <>
          <ul className="mt-2 space-y-1">
            {card.definitions.map((definition, i) => (
              <li key={i} className="text-[var(--text-sm)] leading-relaxed">
                {definition}
              </li>
            ))}
            {card.definitions.length === 0 && (
              <li className="text-[var(--text-sm)] text-[var(--color-text-subtle)]">
                暂无释义
              </li>
            )}
          </ul>
          {card.example && (
            <p className="mt-2.5 rounded-md bg-[var(--color-bg-subtle)] px-3 py-2 text-[var(--text-sm)] leading-relaxed">
              {card.example}
              {card.exampleTranslation && (
                <span className="mt-1 block text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                  {card.exampleTranslation}
                </span>
              )}
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="关闭词条"
        className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-subtle)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)]"
      >
        <Icon name="chevron-right" className="h-4 w-4 rotate-90" />
      </button>
    </div>
  )
}
