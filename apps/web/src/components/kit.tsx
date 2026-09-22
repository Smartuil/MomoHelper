/**
 * Bento 瓷贴套件：页面间共享的容器与基础件。
 *
 * Tile 带 hover 抬升与错峰入场（--i 控制序号）；
 * 看板类页面优先任务密度，动效保持克制。
 */

import type { CSSProperties, ReactNode } from 'react'

export function Tile({
  children,
  className = '',
  index = 0,
  hover = true,
  as: Tag = 'section'
}: {
  children: ReactNode
  className?: string
  /** 入场动画序号，控制错峰延迟 */
  index?: number
  hover?: boolean
  as?: 'section' | 'div' | 'article' | 'aside'
})
{
  const style: CSSProperties = { '--i': index } as CSSProperties

  return (
    <Tag
      style={style}
      className={`tile tile-in p-5 md:p-6 ${hover ? 'tile-hover' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
})
{
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-[var(--text-xl)] leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </header>
  )
}

/** 分段选择器（替代下划线 Tab） */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T
  options: [T, string][]
  onChange: (value: T) => void
  ariaLabel: string
})
{
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-1"
    >
      {options.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-sm px-4 py-1.5 text-[var(--text-sm)] transition-colors ${
            value === key
              ? 'bg-[var(--color-surface)] font-semibold text-[var(--color-text)] shadow-[var(--shadow-tile)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** 空状态卡 */
export function EmptyTile({
  title,
  description,
  index = 0
}: {
  title: string
  description: string
  index?: number
})
{
  return (
    <Tile hover={false} index={index} className="py-14 text-center">
      <p className="font-[family-name:var(--font-display)] text-[var(--text-lg)]">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-[var(--text-sm)] text-[var(--color-text-muted)]">
        {description}
      </p>
    </Tile>
  )
}

/** 行内错误提示 */
export function ErrorNote({ message }: { message: string })
{
  return (
    <p
      role="alert"
      className="rounded-md border border-[var(--color-forget)]/25 bg-[var(--color-forget-bg)] px-4 py-3 text-[var(--text-sm)] text-[var(--color-forget)]"
    >
      {message}
    </p>
  )
}

/** 加载骨架（瓷贴形） */
export function TileSkeleton({ className = '' }: { className?: string })
{
  return (
    <div className={`tile p-6 ${className}`} aria-hidden>
      <div className="h-4 w-24 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
      <div className="mt-4 h-10 w-40 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
      <div className="mt-3 h-3 w-56 animate-pulse rounded-sm bg-[var(--color-bg-subtle)]" />
    </div>
  )
}
