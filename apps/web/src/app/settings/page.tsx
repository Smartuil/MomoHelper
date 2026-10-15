'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { AiConfigDto } from '@momo/types'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Tile } from '@/components/kit'

/** 北京时间展示（C14：日期字段按 UTC+8 处理） */
function beijingTime(iso: string): string
{
  return new Date(iso).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

const SOURCE_TEXT: Record<AiConfigDto['source'], { title: string; hint: string }> = {
  USER: { title: '使用你的 API Key', hint: '已保存个人 Key，优先于服务器配置' },
  SERVER: { title: '使用服务器 API Key', hint: '你未填写个人 Key，回落到服务器统一配置' },
  NONE: { title: '尚未配置', hint: '填写下方 Key 后即可使用问词、诊断与内容生成' }
}

/**
 * 设置页（FR-1 + AI 服务配置）。
 *
 * 只展示 Key 的末 4 位摘要，完整 Key 永不回传前端（约定 14.3）。
 */
export default function SettingsPage()
{
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const config = useQuery({
    queryKey: ['system', 'ai'],
    queryFn: () => apiFetch<AiConfigDto>('/api/system/ai')
  })

  const save = useMutation({
    mutationFn: () =>
      apiFetch<AiConfigDto>('/api/system/ai', {
        method: 'PUT',
        body: JSON.stringify({ apiKey, baseUrl })
      }),
    onSuccess: (data) =>
    {
      queryClient.setQueryData(['system', 'ai'], data)
      setApiKey('')
      setBaseUrl('')
    }
  })

  const clear = useMutation({
    mutationFn: () => apiFetch<AiConfigDto>('/api/system/ai', { method: 'DELETE' }),
    onSuccess: (data) =>
    {
      queryClient.setQueryData(['system', 'ai'], data)
      setApiKey('')
      setBaseUrl('')
    }
  })

  const data = config.data
  const source = data?.source ?? 'NONE'
  const sourceText = SOURCE_TEXT[source]
  const tone =
    source === 'NONE'
      ? 'bg-[var(--color-forget-bg)] text-[var(--color-forget)]'
      : 'bg-[var(--color-familiar-bg)] text-[var(--color-familiar)]'

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        title="设置"
        description="AI 服务凭据与运行状态；写入权限开关在「连接墨墨」页"
      />

      {config.isError && (
        <div className="mb-4">
          <ErrorNote message={(config.error as ApiError).message} />
        </div>
      )}

      <Tile index={0} hover={false}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`flex h-10 w-10 items-center justify-center rounded-md ${tone}`}
          >
            <Icon name={source === 'NONE' ? 'alert' : 'check'} className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[var(--text-md)] font-semibold">{sourceText.title}</p>
            <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
              {sourceText.hint}
            </p>
          </div>
          {source === 'USER' && data?.keyHint && (
            <span className="font-[family-name:var(--font-mono)] text-[var(--text-sm)] text-[var(--color-text-muted)]">
              {data.keyHint}
            </span>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[var(--text-xs)]">
          <dt className="text-[var(--color-text-subtle)]">接入点</dt>
          <dd className="font-[family-name:var(--font-mono)] break-all text-[var(--color-text-muted)]">
            {data?.effectiveBaseUrl ?? '—'}
          </dd>
          <dt className="text-[var(--color-text-subtle)]">最近校验</dt>
          <dd className="text-[var(--color-text-muted)]">
            {data?.lastVerifiedAt ? beijingTime(data.lastVerifiedAt) : '—'}
          </dd>
          <dt className="text-[var(--color-text-subtle)]">模型分配</dt>
          <dd className="font-[family-name:var(--font-mono)] text-[var(--color-text-muted)]">
            {data ? `${data.models.chat} / ${data.models.reasoner}` : '—'}
          </dd>
          <dt className="text-[var(--color-text-subtle)]">服务器兜底</dt>
          <dd className="text-[var(--color-text-muted)]">
            {data?.envConfigured ? '已配置' : '未配置'}
          </dd>
        </dl>
      </Tile>

      <Tile index={1} hover={false} className="mt-4">
        <form
          onSubmit={(event) =>
          {
            event.preventDefault()
            save.mutate()
          }}
        >
          <label htmlFor="apiKey" className="block text-[var(--text-sm)] font-medium">
            DeepSeek API Key
          </label>
          <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            在 platform.deepseek.com 创建，仅以 AES-256-GCM 密文落库，明文不回传前端
          </p>
          <input
            id="apiKey"
            type="password"
            required
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-…"
            className="mt-3 h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
          />

          <label htmlFor="baseUrl" className="mt-5 block text-[var(--text-sm)] font-medium">
            自定义接入点（可选）
          </label>
          <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
            留空则跟随服务器配置，用于自建代理或兼容网关
          </p>
          <input
            id="baseUrl"
            type="text"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={data?.envConfigured ? '跟随服务器配置' : 'https://api.deepseek.com'}
            className="mt-3 h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] transition-colors focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
          />

          {save.isError && (
            <div className="mt-3">
              <ErrorNote message={(save.error as ApiError).message} />
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={save.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-6 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              <Icon name="key" className="h-4 w-4" />
              {save.isPending ? '校验中…' : source === 'USER' ? '更新 Key' : '保存并校验'}
            </button>
            {source === 'USER' && (
              <button
                type="button"
                onClick={() =>
                {
                  if (window.confirm('清除后 AI 功能将回落到服务器配置，确定清除？'))
                  {
                    clear.mutate()
                  }
                }}
                className="inline-flex h-10 items-center rounded-md border border-[var(--color-border-strong)] px-5 text-[var(--text-sm)] transition-colors hover:bg-[var(--color-bg-subtle)]"
              >
                清除个人 Key
              </button>
            )}
          </div>

          {clear.isError && (
            <div className="mt-3">
              <ErrorNote message={(clear.error as ApiError).message} />
            </div>
          )}
        </form>
      </Tile>

      <Tile index={2} hover={false} className="mt-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-info-bg)] text-[var(--color-info)]"
          >
            <Icon name="sliders" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[var(--text-md)] font-semibold">相关设置</p>
            <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
              墨墨 Token 与 AI 写入权限在连接页管理
            </p>
          </div>
        </div>
        <Link
          href="/connect"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-border-strong)] px-5 text-[var(--text-sm)] transition-colors hover:bg-[var(--color-bg-subtle)]"
        >
          <Icon name="link" className="h-4 w-4" />
          前往连接墨墨
        </Link>
      </Tile>
    </div>
  )
}
