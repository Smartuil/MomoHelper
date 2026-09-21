'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { PermissionDto, TokenStatusDto } from '@momo/types'

const PERMISSION_LABELS: { key: keyof PermissionDto; label: string; hint: string }[] = [
  { key: 'allowInterpretation', label: '写入自定义释义', hint: 'AI 生成的释义将写入墨墨' },
  { key: 'allowPhrase', label: '写入例句', hint: 'AI 生成的例句将写入墨墨' },
  { key: 'allowNote', label: '写入助记', hint: 'AI 生成的助记将写入墨墨' },
  { key: 'allowNotepad', label: '创建 / 更新云词本', hint: '诊断结果可一键加入云词本' },
  { key: 'allowStudyPlan', label: '加入学习计划', hint: '可批量将单词加入墨墨学习计划' }
]

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
    mutationFn: () => apiFetch<TokenStatusDto>('/api/maimemo/token', {
      method: 'POST',
      body: JSON.stringify({ token })
    }),
    onSuccess: (data) =>
    {
      queryClient.setQueryData(['maimemo', 'token'], data)
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
    <div className="max-w-xl">
      <h1 className="border-b border-[var(--color-border)] pb-6 font-[family-name:var(--font-display)] text-[var(--text-xl)]">
        连接墨墨
      </h1>

      <section className="mt-8">
        <h2 className="text-[var(--text-md)] font-semibold">Token 状态</h2>

        {bound && status.data && (
          <div className="mt-4 border-l-2 border-[var(--color-familiar)] bg-[var(--color-familiar-bg)] px-4 py-3 text-[var(--text-sm)]">
            <p>
              已连接，凭证类型 {status.data.credentialType === 'MANUAL' ? '个人 Token' : status.data.credentialType}
            </p>
            {status.data.expiresAt && (
              <p className="mt-1 text-[var(--color-text-muted)]">
                有效期至{' '}
                {new Date(status.data.expiresAt).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai'
                })}
                {' '}（墨墨 Token 有效期 7 天，到期需重新获取绑定）
              </p>
            )}
          </div>
        )}

        {status.data && status.data.status !== 'ACTIVE' && (
          <p className="mt-4 border-l-2 border-[var(--color-forget)] bg-[var(--color-forget-bg)] px-4 py-3 text-[var(--text-sm)]">
            {status.data.status === 'EXPIRED' ? 'Token 已过期，请重新获取并绑定' : '尚未绑定墨墨 Token'}
          </p>
        )}

        <form
          className="mt-6"
          onSubmit={(event) =>
          {
            event.preventDefault()
            bind.mutate()
          }}
        >
          <label htmlFor="token" className="block text-[var(--text-sm)]">
            墨墨 Open API Token
          </label>
          <input
            id="token"
            type="password"
            required
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="在墨墨 App「我的 → 更多设置 → 实验功能 → 开放 API」获取"
            className="mt-2 h-9 w-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[var(--text-sm)]"
          />
          {bind.isError && (
            <p role="alert" className="mt-2 text-[var(--text-sm)] text-[var(--color-forget)]">
              {(bind.error as ApiError).message}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={bind.isPending}
              className="h-9 bg-[var(--color-accent)] px-5 text-[var(--text-sm)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {bind.isPending ? '校验中…' : '绑定'}
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
                className="h-9 border border-[var(--color-border-strong)] px-5 text-[var(--text-sm)]"
              >
                解绑
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="mt-12 border-t border-[var(--color-border)] pt-8">
        <h2 className="text-[var(--text-md)] font-semibold">AI 写入权限</h2>
        <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-muted)]">
          所有开关默认关闭；未开启时对应的写入操作会被拒绝。
        </p>

        <ul className="mt-4 space-y-3">
          {PERMISSION_LABELS.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between border-b border-[var(--color-border)] pb-3"
            >
              <div>
                <p className="text-[var(--text-sm)]">{item.label}</p>
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
      </section>
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
      className={`h-6 w-11 border border-[var(--color-border-strong)] px-0.5 transition-colors ${
        checked ? 'bg-[var(--color-familiar)]' : 'bg-[var(--color-bg-subtle)]'
      }`}
    >
      <span
        className={`block h-4 w-4 bg-white ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        style={{ transition: 'transform 120ms' }}
      />
    </button>
  )
}
