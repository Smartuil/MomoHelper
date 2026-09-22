'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { apiFetch } from '@/lib/api'
import type { TokenStatusDto } from '@momo/types'
import { Icon, type IconName } from './icons'

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: '今日', icon: 'gauge' },
  { href: '/forget', label: '遗忘词', icon: 'trending-down' },
  { href: '/confusion', label: '易混词', icon: 'swap' },
  { href: '/ask', label: '问词', icon: 'message' },
  { href: '/connect', label: '连接墨墨', icon: 'link' }
]

interface MeDto
{
  userId: string
  nickname: string
  avatarUrl: string | null
}

function useMe(): MeDto | null
{
  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<MeDto>('/api/auth/me'),
    staleTime: 5 * 60_000,
    retry: false
  })

  return query.data ?? null
}

function useTokenDot(): string
{
  const query = useQuery({
    queryKey: ['maimemo', 'token'],
    queryFn: () => apiFetch<TokenStatusDto>('/api/maimemo/token'),
    staleTime: 60_000,
    retry: false
  })

  const status = query.data?.status

  if (status === 'ACTIVE')
  {
    return 'bg-[var(--color-familiar)]'
  }

  if (status === 'EXPIRED')
  {
    return 'bg-[var(--color-vague)]'
  }

  return 'bg-[var(--color-border-strong)]'
}

function Brand()
{
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-accent)] font-[family-name:var(--font-display)] text-base font-bold text-white"
      >
        墨
      </span>
      <div className="leading-tight">
        <p className="font-[family-name:var(--font-display)] text-[var(--text-md)] font-semibold">
          墨墨 AI 副驾
        </p>
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-subtle)]">
          Copilot
        </p>
      </div>
    </div>
  )
}

function NavLink({ item, active }: { item: (typeof ITEMS)[number]; active: boolean })
{
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-[var(--text-sm)] transition-colors ${
        active
          ? 'bg-[var(--color-accent-bg)] font-semibold text-[var(--color-accent)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)]'
      }`}
    >
      <Icon name={item.icon} className="h-[18px] w-[18px]" />
      {item.label}
    </Link>
  )
}

/** 用户卡：头像首字 + 昵称 + Token 状态点 */
function UserCard()
{
  const me = useMe()
  const dot = useTokenDot()

  return (
    <div className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-info-bg)] font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--color-info)]"
      >
        {me?.nickname?.[0] ?? '访'}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[var(--text-sm)] font-medium">
          {me?.nickname ?? '未登录'}
        </p>
        <p className="flex items-center gap-1.5 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          {dot === 'bg-[var(--color-familiar)]' ? '墨墨已连接' : '墨墨未连接'}
        </p>
      </div>
    </div>
  )
}

/** 桌面侧边栏（ui-design-spec 3.1 的看板化升级） */
export function SideNav()
{
  const pathname = usePathname()

  return (
    <nav
      aria-label="主导航"
      className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 md:flex"
    >
      <div>
        <div className="px-2">
          <Brand />
        </div>
        <ul className="mt-8 space-y-1">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={pathname === item.href} />
            </li>
          ))}
        </ul>
      </div>
      <UserCard />
    </nav>
  )
}

/** 移动端顶栏：品牌 + 横向滚动导航 */
export function MobileNav()
{
  const pathname = usePathname()

  return (
    <div className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center justify-between">
        <Brand />
      </div>
      <nav aria-label="主导航" className="-mx-1 mt-3 overflow-x-auto">
        <ul className="flex gap-1 px-1">
          {ITEMS.map((item) => (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[var(--text-sm)] ${
                  pathname === item.href
                    ? 'bg-[var(--color-accent-bg)] font-semibold text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
