'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { apiFetch, ApiError } from '@/lib/api'
import type { MaimemoNotepad } from '@momo/types'
import { Icon } from '@/components/icons'
import { EmptyTile, ErrorNote, PageHeader, Tile, TileSkeleton } from '@/components/kit'

interface NotepadDetail
{
  notepad: MaimemoNotepad
  words: string[]
}

/** 云词本管理页（FR-9.11~9.13）：列表 + 词表编辑 + 合并 / 拆分 */
export default function NotepadsPage()
{
  const queryClient = useQueryClient()

  const list = useQuery({
    queryKey: ['notepads'],
    queryFn: () => apiFetch<{ notepads: MaimemoNotepad[] }>('/api/notepads')
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const detail = useQuery({
    queryKey: ['notepads', selectedId],
    queryFn: () => apiFetch<NotepadDetail>(`/api/notepads/${selectedId}`),
    enabled: selectedId !== null
  })

  // 词表编辑
  const [editText, setEditText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  function openDetail(notepad: MaimemoNotepad): void
  {
    setSelectedId(notepad.id)
    setEditText('')
    setMsg(null)
  }

  const saveWords = useMutation({
    mutationFn: ({ mode }: { mode: 'append' | 'remove' }) =>
    {
      const words = editText
        .split(/[\s,;，；\n]+/)
        .map((word) => word.trim())
        .filter(Boolean)

      return apiFetch<NotepadDetail>(`/api/notepads/${selectedId}/words`, {
        method: mode === 'append' ? 'POST' : 'DELETE',
        body: JSON.stringify({ words })
      })
    },
    onSuccess: (data) =>
    {
      setMsg(`已更新，当前 ${data.words.length} 词`)
      setEditText('')
      void queryClient.invalidateQueries({ queryKey: ['notepads'] })
      void queryClient.invalidateQueries({ queryKey: ['notepads', selectedId] })
    },
    onError: (error) => setMsg((error as ApiError).message)
  })

  const [mergeTarget, setMergeTarget] = useState<string | null>(null)

  const merge = useMutation({
    mutationFn: (sourceId: string) =>
      apiFetch('/api/notepads/merge', {
        method: 'POST',
        body: JSON.stringify({ sourceIds: [sourceId], targetId: mergeTarget })
      }),
    onSuccess: () =>
    {
      setMsg('合并完成，源词本已删除')
      setMergeTarget(null)
      setSelectedId(mergeTarget)
      void queryClient.invalidateQueries({ queryKey: ['notepads'] })
    },
    onError: (error) => setMsg((error as ApiError).message)
  })

  const split = useMutation({
    mutationFn: ({ id, parts }: { id: string; parts: number }) =>
      apiFetch<{ created: { title: string; count: number }[] }>(`/api/notepads/${id}/split`, {
        method: 'POST',
        body: JSON.stringify({ parts })
      }),
    onSuccess: (data) =>
    {
      setMsg(`已拆分：新建 ${data.created.map((item) => `${item.title}(${item.count}词)`).join('、')}`)
      void queryClient.invalidateQueries({ queryKey: ['notepads'] })
      void queryClient.invalidateQueries({ queryKey: ['notepads', selectedId] })
    },
    onError: (error) => setMsg((error as ApiError).message)
  })

  return (
    <div className="mx-auto max-w-[900px]">
      <PageHeader
        title="云词本"
        description="墨墨不支持删除词本内单个单词（平台约束），移除通过整体覆盖实现"
      />

      {list.isPending && <TileSkeleton />}

      {list.isError && <ErrorNote message={(list.error as ApiError).message} />}

      {list.data && list.data.notepads.length === 0 && (
        <EmptyTile
          title="还没有云词本"
          description="在墨墨 App 或「遗忘词分析」里创建云词本后，这里可以管理词表。"
        />
      )}

      {list.data && list.data.notepads.length > 0 && (
        <div className="grid grid-cols-12 gap-4">
          {/* 词本列表 */}
          <Tile index={0} hover={false} className="col-span-12 md:col-span-5">
            <p className="text-[var(--text-sm)] font-medium">词本列表（{list.data.notepads.length}）</p>
            <ul className="mt-3 space-y-2">
              {list.data.notepads.map((notepad) => (
                <li key={notepad.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openDetail(notepad)}
                    className={`min-w-0 flex-1 rounded-md border px-3.5 py-2.5 text-left transition-all hover:-translate-y-px hover:shadow-[var(--shadow-tile)] ${
                      selectedId === notepad.id
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-bg)]'
                        : 'border-[var(--color-border)]'
                    }`}
                  >
                    <p className="truncate text-[var(--text-sm)] font-medium">{notepad.title}</p>
                    <p className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                      {notepad.content ? `${notepad.content.split('\n').length} 行` : '空词本'}
                    </p>
                  </button>
                  {mergeTarget === null ? (
                    <button
                      type="button"
                      onClick={() => setMergeTarget(notepad.id)}
                      title="把其他词本合并进这本"
                      className="shrink-0 rounded-md border border-[var(--color-border)] p-2 text-[var(--color-text-subtle)] transition-colors hover:bg-[var(--color-bg-subtle)]"
                    >
                      <Icon name="swap" className="h-4 w-4" />
                    </button>
                  ) : mergeTarget !== notepad.id ? (
                    <button
                      type="button"
                      onClick={() => merge.mutate(notepad.id)}
                      title={`合并到「${list.data!.notepads.find((n) => n.id === mergeTarget)?.title ?? ''}」`}
                      className="shrink-0 rounded-md bg-[var(--color-accent-bg)] px-2.5 py-2 text-[var(--text-xs)] font-medium text-[var(--color-accent)]"
                    >
                      合入
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMergeTarget(null)}
                      className="shrink-0 rounded-md border border-[var(--color-border)] px-2.5 py-2 text-[var(--text-xs)]"
                    >
                      取消
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {mergeTarget !== null && (
              <p className="mt-3 text-[var(--text-xs)] text-[var(--color-vague)]">
                合并模式：点击其他词本的「合入」，词表会并入所选词本，源词本删除。
              </p>
            )}
          </Tile>

          {/* 词本详情 */}
          <Tile index={1} hover={false} className="col-span-12 md:col-span-7">
            {!selectedId && (
              <p className="py-10 text-center text-[var(--text-sm)] text-[var(--color-text-subtle)]">
                从左侧选择一个词本查看与编辑词表
              </p>
            )}

            {selectedId && detail.isPending && (
              <p className="py-10 text-center text-[var(--text-sm)] text-[var(--color-text-subtle)]">载入中…</p>
            )}

            {detail.isError && <ErrorNote message={(detail.error as ApiError).message} />}

            {detail.data && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-[family-name:var(--font-display)] text-[var(--text-md)]">
                    {detail.data.notepad.title}
                    <span className="tabular ml-2 font-[family-name:var(--font-mono)] text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                      {detail.data.words.length} 词
                    </span>
                  </p>
                  <button
                    type="button"
                    disabled={split.isPending || detail.data.words.length < 2}
                    onClick={() =>
                    {
                      const parts = window.prompt('拆分成几份？（2~10）')

                      if (parts)
                      {
                        split.mutate({ id: detail.data!.notepad.id, parts: Number(parts) })
                      }
                    }}
                    className="shrink-0 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[var(--text-xs)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
                  >
                    拆分词本
                  </button>
                </div>

                {/* 词表（最多展示 200 行预览） */}
                <div className="mt-3 max-h-64 overflow-y-auto rounded-md bg-[var(--color-bg-subtle)] px-3.5 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {detail.data.words.slice(0, 200).map((word) => (
                      <span
                        key={word}
                        className="rounded-full bg-[var(--color-surface)] px-2.5 py-0.5 font-[family-name:var(--font-mono)] text-[var(--text-xs)]"
                      >
                        {word}
                      </span>
                    ))}
                    {detail.data.words.length > 200 && (
                      <span className="text-[var(--text-xs)] text-[var(--color-text-subtle)]">
                        … 共 {detail.data.words.length} 词
                      </span>
                    )}
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  placeholder="输入要追加或移除的单词（空格 / 换行分隔）"
                  className="mt-3 w-full resize-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-3 py-2 text-[var(--text-sm)] focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)] focus:outline-none"
                />
                <div className="mt-2 flex gap-2.5">
                  <button
                    type="button"
                    disabled={!editText.trim() || saveWords.isPending}
                    onClick={() => saveWords.mutate({ mode: 'append' })}
                    className="inline-flex h-8 items-center rounded-md bg-[var(--color-familiar)] px-4 text-[var(--text-xs)] font-medium text-white disabled:opacity-50"
                  >
                    追加
                  </button>
                  <button
                    type="button"
                    disabled={!editText.trim() || saveWords.isPending}
                    onClick={() => saveWords.mutate({ mode: 'remove' })}
                    className="inline-flex h-8 items-center rounded-md border border-[var(--color-border-strong)] px-4 text-[var(--text-xs)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-50"
                  >
                    移除
                  </button>
                  {msg && <p className="self-center text-[var(--text-xs)] text-[var(--color-text-muted)]">{msg}</p>}
                </div>
              </>
            )}
          </Tile>
        </div>
      )}
    </div>
  )
}
