'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { PermissionDto, TokenStatusDto } from '@momo/types'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Tile } from '@/components/kit'

const PERMISSION_LABELS: { key: keyof PermissionDto; label: string; hint: string }[] = [
  { key: 'allowInterpretation', label: '写入自定义释义', hint: 'AI 生成的释义将写入墨墨' },
  { key: 'allowPhrase', label: '写入例句', hint: 'AI 生成的例句将写入墨墨' },
  { key: 'allowNote', label: '写入助记', hint: 'AI 生成的助记将写入墨墨' },
  { key: 'allowNotepad', label: '创建 / 更新云词本', hint: '诊断结果可一键加入云词本' },
  { key: 'allowStudyPlan', label: '加入学习计划', hint: '可批量将单词加入墨墨学习计划' }
]

/** Token 剩余有效期进度条（7 天有效期，C10） */
function ExpiryBar({ expiresAt }: { expiresAt: string })
{
  const total = 7 * 24 * 3600_000
  const left = Math.max(0, new Date(expiresAt).getTime() - Date.now())
  const ratio = Math.min(1, left / total)
  const days = Math.floor(left / 86_400_000)

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between text-[var(--text-xs)] text-[var(--color-text-subtle)]">
        <span>有效期剩余</span>
        <span className="tabular font-[family-name:var(--font-mono)] font-medium text-[var(--color-text)]">
          {days} 天
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Token 剩余有效期"
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]"
      >
        <div
          className={`h-full rounded-full transition-all ${
            ratio > 0.3 ? 'bg-[var(--color-familiar)]' : 'bg-[var(--color-forget)]'
          }`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}

/** 连接墨墨（FR-1）：绑定 Token + 状态展示 + 写入权限开关（默认全关） */
export default function ConnectPage()
{
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')

  const status = useQuery({
    queryKey: ['maimemo', 'token'],
    queryFn: () => apiFetch<TokenStatusDto>('/api/maimemo/token')
  })

  const permissions = useQuery({
    queryKey: ['maimemo', 'permissions'],
    queryFn: () => apiFetch<PermissionDto>('/api/maimemo/permissions')
  })

  const bind = useMutation({
    mutationFn: () =>
      apiFetch<TokenStatusDto>('/api/maimemo/token', {
        method: 'POST',
        body: JSON.stringify({ token })
      }),
    onSuccess: (data) =>
    {
      queryClient.setQueryData(['maimemo', 'token'], data)
      void queryClient.invalidateQueries({ queryKey: ['maimemo'] })
      setToken('')
    }
  })

  const unbind = useMutation({
    mutationFn: () => apiFetch('/api/maimemo/token', { method: 'DELETE' }),
    onSuccess: () =>
    {
      void queryClient.invalidateQueries({ queryKey: ['maimemo'] })
    }
  })

  const bound = status.data?.status === 'ACTIVE'

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        title="连接墨墨"
        description="绑定个人 Open API Token，AI 能力才能读写你的学习数据"
      />

      {/* Token 状态 */}
      <Tile index={0} hover={false}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`flex h-10 w-10 items-center justify-center rounded-md ${
              bound ? 'bg-[var(--color-familiar-bg)] text-[var(--color-familiar)]' : 'bg-[var(--color-forget-bg)] text-[var(--color-forget)]'
            }`}
          >
            <Icon name={bound ? 'check' : 'key'} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[var(--text-md)] font-semibold">
              {bound ? '已连接墨墨' : status.data?.status === 'EXPIRED' ? 'Token 已过期' : '尚未绑定'}
            </p>
            {bound && status.data && (
              <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                凭证类型：{status.data.credentialType === 'MANUAL' ? '个人 Token' : status.data.credentialType}
              </p>
            )}
          </div>
        </div>

        {bound && status.data?.expiresAt && <ExpiryBar expiresAt={status.data.expiresAt} />}

        {status.data && status.data.status !== 'ACTIVE' && (
          <p className="mt-3 rounded-md bg-[var(--color-forget-bg)] px-3.5 py-2.5 text-[var(--text-sm)] text-[var(--color-forget)]">
            {status.data.status === 'EXPIRED'
              ? 'Token 已过期，请重新获取并绑定（墨墨 Token 有效期 7 天）'
              : '绑定后才能使用看板、诊断与问词等功能'}
          </p>
        )}
      </Tile>

      {/* 绑定 / 解绑 */}
      <Tile index={1} hover={false} className="mt-4">
        <form
          onSubmit={(event) =>
          {
            event.preventDefault()
            bind.mutate()
          }}
        >
          <label htmlFor="token" className="block text-[var(--text-sm)] font-medium">
            墨墨 Open API Token
          </label>
          <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            在墨墨 App「我的 → 更多设置 → 实验功能 → 开放 API」获取
          </p>
          <input
            id="token"
            type="password"
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="粘贴你的 Token"
            className="mt-3 h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
          />
          {bind.isError && (
            <div className="mt-3">
              <ErrorNote message={(bind.error as ApiError).message} />
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={bind.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-6 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              <Icon name="link" className="h-4 w-4" />
              {bind.isPending ? '校验中…' : bound ? '重新绑定' : '绑定'}
            </button>
            {bound && (
              <button
                type="button"
                onClick={() =>
                {
                  if (window.confirm('解绑后需要重新绑定才能继续使用，确定解绑？'))
                  {
                    unbind.mutate()
                  }
                }}
                className="inline-flex h-10 items-center rounded-md border border-[var(--color-border-strong)] px-5 text-[var(--text-sm)] transition-colors hover:bg-[var(--color-bg-subtle)]"
              >
                解绑
              </button>
            )}
          </div>
        </form>
      </Tile>

      {/* 写入权限 */}
      <Tile index={2} hover={false} className="mt-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-info-bg)] text-[var(--color-info)]"
          >
            <Icon name="sliders" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[var(--text-md)] font-semibold">AI 写入权限</p>
            <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
              所有开关默认关闭；未开启时对应的写入操作会被拒绝
            </p>
          </div>
        </div>

        <ul className="mt-5 divide-y divide-[var(--color-border)]">
          {PERMISSION_LABELS.map((item) => (
            <li key={item.key} className="flex items-center justify-between py-3.5">
              <div>
                <p className="text-[var(--text-sm)] font-medium">{item.label}</p>
                <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">{item.hint}</p>
              </div>
              <Toggle
                checked={permissions.data?.[item.key] ?? false}
                disabled={permissions.isPending}
                onChange={(checked) =>
                {
                  void apiFetch('/api/maimemo/permissions', {
                    method: 'PUT',
                    body: JSON.stringify({ [item.key]: checked })
                  }).then(() =>
                  {
                    void queryClient.invalidateQueries({ queryKey: ['maimemo'] })
                  })
                }}
              />
            </li>
          ))}
        </ul>
      </Tile>
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange
}: {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
})
{
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
        checked ? 'bg-[var(--color-familiar)]' : 'bg-[var(--color-border-strong)]'
      } disabled:opacity-50`}
    >
      <span
        className={`block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
