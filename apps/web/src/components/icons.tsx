/**
 * 手写线性图标集（24×24，stroke 1.7）。
 *
 * 不引入图标库依赖：看板用图标少而固定，内联 SVG 更可控。
 */

import type { ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  gauge: (
    <>
      <path d="M12 14l3.6-3.6" />
      <path d="M20.2 17a9 9 0 1 0-16.4 0" />
    </>
  ),
  'trending-down': (
    <>
      <path d="M22 17l-8.5-8.5-5 5L2 7" />
      <path d="M16 17h6v-6" />
    </>
  ),
  swap: (
    <>
      <path d="M8 3L4 7l4 4" />
      <path d="M4 7h16" />
      <path d="M16 21l4-4-4-4" />
      <path d="M20 17H4" />
    </>
  ),
  message: (
    <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.2-5.1A8.5 8.5 0 1 1 21 11.5z" />
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1L11 5" />
      <path d="M14 11a5 5 0 0 0-7.1 0l-2.8 2.8a5 5 0 0 0 7.1 7.1L13 19" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  plus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
  'circle-dashed': <circle cx="12" cy="12" r="9" strokeDasharray="3.8 3.8" />,
  zap: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 5-5.5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12L20 3" />
      <path d="M17 6l3 3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="14" cy="6" r="2" fill="var(--color-surface)" />
      <circle cx="8" cy="12" r="2" fill="var(--color-surface)" />
      <circle cx="17" cy="18" r="2" fill="var(--color-surface)" />
    </>
  )
}

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  className
}: {
  name: IconName
  className?: string
})
{
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
