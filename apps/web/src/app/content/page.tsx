'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import { Icon } from '@/components/icons'
import { ErrorNote, PageHeader, Segmented, Tile } from '@/components/kit'

type JobType = 'INTERPRETATION' | 'PHRASE' | 'NOTE'
type Scene = 'CONCISE' | 'EXAM' | 'WORK' | 'TECH' | 'PAPER' | 'CONTRAST'

const TYPE_LABELS: Record<JobType, string> = {
  INTERPRETATION: '释义',
  PHRASE: '例句',
  NOTE: '助记'
}

const JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: '排队中',
  RUNNING: '执行中',
  PAUSED: '配额暂停',
  DONE: '已完成',
  FAILED: '失败',
  CANCELLED: '已取消'
}

interface GenerateResponse
{
  jobType: JobType
  scene: Scene
  spelling: string
  vocId: string
  payload: { content: string; noteType?: string; highlightStart?: number; highlightEnd?: number }
}

interface JobRow
{
  id: string
  jobType: string
  scene: string
  totalCount: number
  doneCount: number
  failedCount: number
  status: string
  createdAt: string
}

/** 词库页（FR-6 / 7 / 8）：单条生成写入 + 批量任务 + 已写内容 */
export default function ContentPage()
{
  const queryClient = useQueryClient()

  // 单条生成
  const [spelling, setSpelling] = useState('')
  const [jobType, setJobType] = useState<JobType>('INTERPRETATION')
  const [scene, setScene] = useState<Scene>('CONCISE')
  const [generated, setGenerated] = useState<GenerateResponse | null>(null)
  const [writeOk, setWriteOk] = useState(false)

  const generate = useMutation({
    mutationFn: () =>
      apiFetch<GenerateResponse>('/api/content/generate', {
        method: 'POST',
        body: JSON.stringify({ spelling, jobType, scene })
      }),
    onSuccess: (data) =>
    {
      setGenerated(data)
      setWriteOk(false)
    }
  })

  const write = useMutation({
    mutationFn: () =>
      apiFetch('/api/content/write', {
        method: 'POST',
        body: JSON.stringify({
          jobType: generated!.jobType,
          scene: generated!.scene,
          spelling: generated!.spelling,
          payload: generated!.payload
        })
      }),
    onSuccess: () =>
    {
      setWriteOk(true)
      void queryClient.invalidateQueries({ queryKey: ['content', 'written'] })
    }
  })

  // 批量任务
  const [batchText, setBatchText] = useState('')
  const [batchMsg, setBatchMsg] = useState<string | null>(null)

  const jobs = useQuery({
    queryKey: ['content', 'jobs'],
    queryFn: () => apiFetch<{ jobs: JobRow[] }>('/api/content/jobs'),
    refetchInterval: (query) =>
      query.state.data?.jobs.some((job) => job.status === 'RUNNING' || job.status === 'PENDING')
        ? 3000
        : false
  })

  const createJob = useMutation({
    mutationFn: () =>
    {
      const spellings = batchText
        .split(/[\s,;，；\n]+/)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean)

      return apiFetch<{ jobId: string; createdItems: number; unknownSpellings: number }>(
        '/api/content/jobs',
        {
          method: 'POST',
          body: JSON.stringify({ jobType, scene, spellings })
        }
      )
    },
    onSuccess: (data) =>
    {
      setBatchMsg(`已创建任务：${data.createdItems} 个词入队` +
        (data.unknownSpellings > 0 ? `（${data.unknownSpellings} 个不在词库被跳过）` : ''))
      setBatchText('')
      void queryClient.invalidateQueries({ queryKey: ['content', 'jobs'] })
    },
    onError: (error) => setBatchMsg((error as ApiError).message)
  })

  const cancelJob = useMutation({
    mutationFn: (jobId: string) =>
      apiFetch(`/api/content/jobs/${jobId}/cancel`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['content', 'jobs'] })
  })

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="词库增强"
        description="AI 生成释义 / 例句 / 助记，按场景定制语气；写入前请在「连接墨墨」开启对应权限"
      />

      {/* 单条生成 */}
      <Tile index={0} hover={false}>
        <p className="text-[var(--text-sm)] font-medium">单条生成</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <input
            value={spelling}
            onChange={(event) => setSpelling(event.target.value)}
            placeholder="输入单词，如 adapt"
            className="h-10 min-w-40 flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 font-[family-name:var(--font-mono)] text-[var(--text-sm)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
          />
          <Segmented
            ariaLabel="内容类型"
            value={jobType}
            options={(Object.keys(TYPE_LABELS) as JobType[]).map((key) => [key, TYPE_LABELS[key]])}
            onChange={setJobType}
          />
          <Segmented
            ariaLabel="生成场景"
            value={scene}
            options={[
              ['CONCISE' as Scene, '简洁'],
              ['EXAM' as Scene, '考试'],
              ['WORK' as Scene, '职场'],
              ['TECH' as Scene, '科技'],
              ['PAPER' as Scene, '学术'],
              ['CONTRAST' as Scene, '对比']
            ]}
            onChange={setScene}
          />
          <button
            type="button"
            disabled={!spelling.trim() || generate.isPending}
            onClick={() => generate.mutate()}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 text-[var(--text-sm)] font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            <Icon name="zap" className={`h-4 w-4 ${generate.isPending ? 'animate-pulse' : ''}`} />
            {generate.isPending ? '生成中…' : 'AI 生成'}
          </button>
        </div>

        {generate.isError && (
          <div className="mt-3">
            <ErrorNote message={(generate.error as ApiError).message} />
          </div>
        )}

        {generated && (
          <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-[family-name:var(--font-display)] text-[var(--text-md)]">
                {generated.spelling}
                <span className="ml-2 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                  {TYPE_LABELS[generated.jobType]} · {generated.scene}
                </span>
              </p>
              {!writeOk && (
                <button
                  type="button"
                  disabled={write.isPending}
                  onClick={() => write.mutate()}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-familiar)] px-3.5 text-[var(--text-xs)] font-medium text-white disabled:opacity-50"
                >
                  <Icon name="check" className="h-3.5 w-3.5" />
                  {write.isPending ? '写入中…' : '写入墨墨'}
                </button>
              )}
            </div>
            <p className="mt-2 text-[var(--text-sm)] leading-relaxed">{generated.payload.content}</p>
            {writeOk && (
              <p className="mt-2 text-[var(--text-xs)] text-[var(--color-familiar)]">
                已写入墨墨，可在 App 内查看
              </p>
            )}
            {write.isError && (
              <p className="mt-2 text-[var(--text-xs)] text-[var(--color-forget)]">
                {(write.error as ApiError).message}
              </p>
            )}
          </div>
        )}
      </Tile>

      {/* 批量任务 */}
      <Tile index={1} hover={false} className="mt-4">
        <p className="text-[var(--text-sm)] font-medium">批量任务</p>
        <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-subtle)]">
          每天释义+例句+助记合计 600 条配额；超额部分自动暂停，次日恢复
        </p>
        <textarea
          rows={3}
          value={batchText}
          onChange={(event) => setBatchText(event.target.value)}
          placeholder="粘贴单词列表（空格 / 逗号 / 换行分隔），将按当前选中的类型与场景批量生成"
          className="mt-3 w-full resize-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 py-2.5 text-[var(--text-sm)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={!batchText.trim() || createJob.isPending}
            onClick={() => createJob.mutate()}
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border-strong)] px-5 text-[var(--text-sm)] font-medium transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
          >
            {createJob.isPending ? '提交中…' : '创建批量任务'}
          </button>
          {batchMsg && <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">{batchMsg}</p>}
        </div>

        {jobs.data && jobs.data.jobs.length > 0 && (
          <ul className="mt-5 divide-y divide-[var(--color-border)]">
            {jobs.data.jobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="text-[var(--text-sm)] font-medium">
                    {TYPE_LABELS[job.jobType as JobType]} · {job.scene}
                    <span className="ml-2 rounded-full bg-[var(--color-bg-subtle)] px-2 py-0.5 text-[var(--text-xs)] font-normal text-[var(--color-text-subtle)]">
                      {JOB_STATUS_LABELS[job.status] ?? job.status}
                    </span>
                  </p>
                  <p className="tabular mt-0.5 font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                    {job.doneCount}/{job.totalCount} 已写入
                    {job.failedCount > 0 ? ` · ${job.failedCount} 失败` : ''}
                  </p>
                </div>
                {(job.status === 'PENDING' || job.status === 'RUNNING' || job.status === 'PAUSED') && (
                  <button
                    type="button"
                    onClick={() => cancelJob.mutate(job.id)}
                    className="shrink-0 text-[var(--text-xs)] text-[var(--color-text-muted)] underline hover:text-[var(--color-forget)]"
                  >
                    取消
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </div>
  )
}
