'use client'

import type { ReactNode } from 'react'

import { parseInline, parseMarkdown, type MdBlock } from '@/lib/markdown'

/** 行内标记 → React 节点：加粗 / 斅体 / 行内代码 */
function renderInline(text: string, keyPrefix: string): ReactNode[]
{
  return parseInline(text).map((token, i) =>
  {
    const key = `${keyPrefix}-${i}`

    switch (token.type)
    {
      case 'strong':
        return <strong key={key}>{token.text}</strong>

      case 'em':
        return <em key={key}>{token.text}</em>

      case 'code':
        return (
          <code
            key={key}
            className="rounded-sm bg-[var(--color-bg-subtle)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[0.9em]"
          >
            {token.text}
          </code>
        )

      default:
        return token.text
    }
  })
}

/** 块级结构 → React 节点：段落 / 标题 / 列表（流式半截安全：残块按已有内容渲染） */
function Markdown({ text }: { text: string })
{
  const blocks: MdBlock[] = parseMarkdown(text)

  return (
    <div className="space-y-3">
      {blocks.map((block, i) =>
      {
        if (block.kind === 'list')
        {
          const Tag = block.ordered ? 'ol' : 'ul'

          return (
            <Tag
              key={i}
              className={
                block.ordered
                  ? 'list-decimal space-y-1.5 pl-6 marker:text-[var(--color-text-subtle)]'
                  : 'list-disc space-y-1.5 pl-6 marker:text-[var(--color-text-subtle)]'
              }
            >
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, `${i}-${j}`)}</li>
              ))}
            </Tag>
          )
        }

        if (block.kind === 'heading')
        {
          return (
            <p key={i} className="mt-1 font-semibold leading-snug">
              {renderInline(block.lines[0], `${i}-h`)}
            </p>
          )
        }

        return (
          <p key={i} className="leading-relaxed">
            {block.lines.map((line, j) => (
              <span key={j}>
                {renderInline(line, `${i}-${j}`)}
                {j < block.lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

export { Markdown }
