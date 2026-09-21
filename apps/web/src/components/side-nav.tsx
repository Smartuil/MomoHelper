'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/', label: '今日' },
  { href: '/forget', label: '遗忘词' },
  { href: '/confusion', label: '易混词' },
  { href: '/ask', label: '问词' },
  { href: '/connect', label: '连接墨墨' }
]

/** 侧边导航：240px，当前项用左侧竖线标识（ui-design-spec 3.1） */
export function SideNav()
{
  const pathname = usePathname()

  return (
    <nav
      aria-label="主导航"
      className="hidden w-[240px] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-6 py-10 md:block"
    >
      <p className="font-[family-name:var(--font-display)] text-[var(--text-lg)] leading-tight">
        墨墨 AI 副驾
      </p>
      <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
        诊断 · 增强 · 复盘
      </p>

      <ul className="mt-10 space-y-1">
        {ITEMS.map((item) =>
        {
          const active = pathname === item.href

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-9 items-center border-l-2 pl-3 text-[var(--text-sm)] ${
                  active
                    ? 'border-[var(--color-accent)] font-semibold'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
