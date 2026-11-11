'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { AiAuthError } from '@momo/ai'
import { MaimemoAuthError } from '@momo/maimemo'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Tile } from '@/components/kit'
import { verifyDeepSeekKey } from '@/lib/ai'
import { verifyMaimemoToken } from '@/lib/maimemo'
import {
  clearDeepSeekKey,
  clearMaimemoToken,
  getDeepSeekKey,
  getMaimemoTokenStatus,
  MAIMEMO_TOKEN_TTL_DAYS,
  setDeepSeekKey,
  setMaimemoToken
} from '@/lib/settings'

/**
 * 设置页：墨墨 Token + DeepSeek Key，全部存本机浏览器 localStorage。
 * 保存前先探测可用性（校验通过才保存，失败不覆盖旧值）。
 */
export default function SettingsPage()
{
  const queryClient = useQueryClient()

  const statusQuery = useQuery({
    queryKey: ['settings', 'status'],
    queryFn: () => getMaimemoTokenStatus(),
    staleTime: 0,
    retry: false
  })

  const token = statusQuery.data ?? null

  const [tokenInput, setTokenInput] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [tokenOk, setTokenOk] = useState(false)

  const [keyInput, setKeyInput] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [keyOk, setKeyOk] = useState(false)

  /** 仅客户端首次渲染后读取，避免静态导出阶段触碰 localStorage 造成水合不一致 */
  const [hasKey, setHasKey] = useState<boolean | null>(null)

  useEffect(
    () =>
    {
      setHasKey(getDeepSeekKey() !== null)

      if (getDeepSeekKey() === null)
      {
        setShowKeyInput(true)
      }
    },
    []
  )

  // 未绑定墨墨 Token 时直接展开输入框
  useEffect(
    () =>
    {
      if (statusQuery.isSuccess && token && !token.hasToken)
      {
        setShowTokenInput(true)
      }
    },
    [statusQuery.isSuccess, token]
  )

  function invalidateStatus(): void
  {
    void queryClient.invalidateQueries({ queryKey: ['settings', 'status'] })
  }

  const bindToken = useMutation({
    mutationFn: async (value: string) =>
    {
      // 先校验再保存；失败抛错，不覆盖旧 Token
      await verifyMaimemoToken(value)
      setMaimemoToken(value)
    },
    onSuccess: () =>
    {
      setTokenInput('')
      setShowTokenInput(false)
      setTokenError(null)
      setTokenOk(true)
      invalidateStatus()
      window.setTimeout(() => setTokenOk(false), 2500)
    },
    onError: (error) =>
    {
      setTokenError(
        error instanceof MaimemoAuthError
          ? 'Token 无效：墨墨返回鉴权失败，请检查是否复制完整、是否已过期'
          : error instanceof Error
            ? error.message
            : '校验失败，请稍后重试'
      )
    }
  })

  const unbindToken = useMutation({
    mutationFn: async () =>
    {
      clearMaimemoToken()
    },
    onSuccess: () =>
    {
      setShowTokenInput(true)
      setTokenError(null)
      invalidateStatus()
    }
  })

  const saveKey = useMutation({
    mutationFn: async (value: string) =>
    {
      // 保存前探测：401/403 = Key 无效；连不上则不保存（沿用后端版逻辑）
      await verifyDeepSeekKey(value)
      setDeepSeekKey(value)
    },
    onSuccess: () =>
    {
      setKeyInput('')
      setShowKeyInput(false)
      setKeyError(null)
      setKeyOk(true)
      setHasKey(true)
      invalidateStatus()
      window.setTimeout(() => setKeyOk(false), 2500)
    },
    onError: (error) =>
    {
      setKeyError(
        error instanceof AiAuthError
          ? 'Key 无效：AI 服务返回鉴权失败'
          : error instanceof Error
            ? error.message
            : '校验失败：无法连接 AI 服务，请稍后重试'
      )
    }
  })

  const clearKey = useMutation({
    mutationFn: async () =>
    {
      clearDeepSeekKey()
    },
    onSuccess: () =>
    {
      setShowKeyInput(true)
      setKeyError(null)
      setHasKey(false)
      invalidateStatus()
    }
  })

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title="设置"
        description="凭据只存在本机浏览器（localStorage），不经过任何服务器"
      />

      {/* 墨墨 Token */}
      <Tile index={0} hover={false}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
            >
              <Icon name="link" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[var(--text-md)] font-semibold">墨墨 Token</h2>
              <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                墨墨 App → 更多设置 → 实验功能 中开启并复制；有效期 {MAIMEMO_TOKEN_TTL_DAYS} 天
              </p>
            </div>
          </div>
          {token?.hasToken && !showTokenInput && (
            <button
              type="button"
              onClick={() => setShowTokenInput(true)}
              className="rounded-md border border-[var(--color-border-strong)] px-3.5 py-1.5 text-[var(--text-sm)] transition-colors hover:bg-[var(--color-bg-subtle)]"
            >
              重新绑定
            </button>
          )}
        </div>

        {token?.hasToken && !showTokenInput ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--color-bg-subtle)] px-4 py-3">
              <p className="flex items-center gap-2 text-[var(--text-sm)]">
                <Icon name="check" className="h-4 w-4 text-[var(--color-familiar)]" />
                {token.expired
                  ? 'Token 已过期，请重新绑定'
                  : token.remainingDays === null
                    ? '已绑定'
                    : `已绑定 · 预计 ${token.remainingDays} 天后过期`}
              </p>
              <span className="tabular font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                {token.expiresAt
                  ? new Date(token.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
                  : ''}
              </span>
            </div>
            {token.expiresAt && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                <div
                  className={`h-full rounded-full transition-all ${
                    token.expired
                      ? 'bg-[var(--color-forget)]'
                      : token.remainingDays !== null && token.remainingDays <= 2
                        ? 'bg-[var(--color-vague)]'
                        : 'bg-[var(--color-familiar)]'
                  }`}
                  style={{
                    width:
                      token.remainingDays === null
                        ? '100%'
                        : `${Math.max(0, Math.min(100, (token.remainingDays / MAIMEMO_TOKEN_TTL_DAYS) * 100))}%`
                  }}
                />
              </div>
            )}
            <div className="mt-3">
              <button
                type="button"
                disabled={unbindToken.isPending}
                onClick={() => unbindToken.mutate()}
                className="text-[var(--text-sm)] text-[var(--color-text-subtle)] underline-offset-4 transition-colors hover:text-[var(--color-forget)] hover:underline"
              >
                解除绑定
              </button>
            </div>
          </div>
        ) : (
          <form
            className="mt-4"
            onSubmit={(event) =>
            {
              event.preventDefault()
              const value = tokenInput.trim()

              if (value)
              {
                bindToken.mutate(value)
              }
            }}
          >
            <textarea
              rows={3}
              value={tokenInput}
              maxLength={512}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="粘贴墨墨个人 Token"
              className="w-full resize-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 py-2.5 font-[family-name:var(--font-mono)] text-[var(--text-sm)] transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={bindToken.isPending || !tokenInput.trim()}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {bindToken.isPending ? '验证中…' : '验证并保存'}
              </button>
              {token?.hasToken && (
                <button
                  type="button"
                  onClick={() =>
                  {
                    setShowTokenInput(false)
                    setTokenError(null)
                    setTokenInput('')
                  }}
                  className="text-[var(--text-sm)] text-[var(--color-text-subtle)] transition-colors hover:text-[var(--color-text)]"
                >
                  取消
                </button>
              )}
            </div>
          </form>
        )}

        {tokenError && (
          <div className="mt-3">
            <ErrorNote message={tokenError} />
          </div>
        )}
        {tokenOk && (
          <p className="mt-3 flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--color-familiar)]">
            <Icon name="check" className="h-4 w-4" />
            Token 已保存，看板与遗忘词可以使用了。
          </p>
        )}
      </Tile>

      {/* DeepSeek Key */}
      <Tile index={1} hover={false} className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--color-info-bg)] text-[var(--color-info)]"
            >
              <Icon name="key" className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[var(--text-md)] font-semibold">DeepSeek API Key</h2>
              <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                在 platform.deepseek.com 获取；AI 诊断与问词都走它
              </p>
            </div>
          </div>
          {hasKey && !showKeyInput && (
            <button
              type="button"
              onClick={() => setShowKeyInput(true)}
              className="rounded-md border border-[var(--color-border-strong)] px-3.5 py-1.5 text-[var(--text-sm)] transition-colors hover:bg-[var(--color-bg-subtle)]"
            >
              重新填写
            </button>
          )}
        </div>

        {hasKey && !showKeyInput ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--color-bg-subtle)] px-4 py-3">
              <p className="flex items-center gap-2 text-[var(--text-sm)]">
                <Icon name="check" className="h-4 w-4 text-[var(--color-familiar)]" />
                已配置
              </p>
              <button
                type="button"
                disabled={clearKey.isPending}
                onClick={() => clearKey.mutate()}
                className="text-[var(--text-sm)] text-[var(--color-text-subtle)] underline-offset-4 transition-colors hover:text-[var(--color-forget)] hover:underline"
              >
                清除
              </button>
            </div>
          </div>
        ) : (
          <form
            className="mt-4"
            onSubmit={(event) =>
            {
              event.preventDefault()
              const value = keyInput.trim()

              if (value)
              {
                saveKey.mutate(value)
              }
            }}
          >
            <input
              type="password"
              autoComplete="off"
              value={keyInput}
              maxLength={300}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="sk-..."
              className="h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={saveKey.isPending || !keyInput.trim()}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {saveKey.isPending ? '验证中…' : '验证并保存'}
              </button>
              {hasKey && (
                <button
                  type="button"
                  onClick={() =>
                  {
                    setShowKeyInput(false)
                    setKeyError(null)
                    setKeyInput('')
                  }}
                  className="text-[var(--text-sm)] text-[var(--color-text-subtle)] transition-colors hover:text-[var(--color-text)]"
                >
                  取消
                </button>
              )}
            </div>
          </form>
        )}

        {keyError && (
          <div className="mt-3">
            <ErrorNote message={keyError} />
          </div>
        )}
        {keyOk && (
          <p className="mt-3 flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--color-familiar)]">
            <Icon name="check" className="h-4 w-4" />
            Key 已保存，AI 诊断与问词可以使用了。
          </p>
        )}
      </Tile>

      <Tile index={2} hover={false} className="mt-4">
        <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
          说明：本工具是纯前端应用，你的墨墨 Token 与 DeepSeek Key
          只保存在这台设备的浏览器里；网页直接调用墨墨与 DeepSeek
          的开放接口，请求从你本机发出，不经过任何中间服务器。清除浏览器站点数据会同时清除凭据与学习快照。
        </p>
      </Tile>
    </div>
  )
}
