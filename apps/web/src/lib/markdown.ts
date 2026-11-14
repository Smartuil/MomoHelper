/**
 * 极简 Markdown 解析（纯函数，无 React 依赖，可直接单测）。
 *
 * 只覆盖 AI 问词会输出的子集：加粗 / 斜体 / 行内代码 /
 * 无序有序列表 / 空行分段 / 井号标题。表格、链接、代码块等不支持——
 * system prompt 已约束 AI 不使用这些格式。
 *
 * 流式安全：未闭合的标记（如只收到半截 **bo）不匹配，按普通文本渲染，
 * 闭合后自然变为样式，不会炸也不会整段消失。
 */

export interface MdListBlock
{
  kind: 'list'
  ordered: boolean
  items: string[]
}

export interface MdTextBlock
{
  kind: 'paragraph' | 'heading'
  lines: string[]
}

export type MdBlock = MdListBlock | MdTextBlock

/** 无序列表标记：- * + •；有序：1. 1、1) */
const UNORDERED_PATTERN = /^[-*+•]\s+(.+)$/
const ORDERED_PATTERN = /^\d+[.、)]\s+(.+)$/
const HEADING_PATTERN = /^#{1,6}\s+(.+)$/

/** 按行分组为块级结构：段落行合并、列表聚合、标题独立成块 */
export function parseMarkdown(text: string): MdBlock[]
{
  const blocks: MdBlock[] = []
  const lines = text.split('\n')
  let paragraph: string[] | null = null
  let list: MdListBlock | null = null

  function flushParagraph(): void
  {
    if (paragraph)
    {
      blocks.push({ kind: 'paragraph', lines: paragraph })
      paragraph = null
    }
  }

  function flushList(): void
  {
    if (list)
    {
      blocks.push(list)
      list = null
    }
  }

  for (const raw of lines)
  {
    const line = raw.trimEnd()

    if (!line.trim())
    {
      flushParagraph()
      flushList()
      continue
    }

    const unordered = UNORDERED_PATTERN.exec(line)

    if (unordered)
    {
      flushParagraph()

      if (list && list.ordered)
      {
        flushList()
      }

      list ??= { kind: 'list', ordered: false, items: [] }
      list.items.push(unordered[1])
      continue
    }

    const ordered = ORDERED_PATTERN.exec(line)

    if (ordered)
    {
      flushParagraph()

      if (list && !list.ordered)
      {
        flushList()
      }

      list ??= { kind: 'list', ordered: true, items: [] }
      list.items.push(ordered[1])
      continue
    }

    const heading = HEADING_PATTERN.exec(line)

    if (heading)
    {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'heading', lines: [heading[1]] })
      continue
    }

    flushList()
    paragraph ??= []
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks
}

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'em'; text: string }
  | { type: 'code'; text: string }

/**
 * 行内标记：**加粗** / *斜体* / `代码`。
 * 斜体要求紧贴非空白（避免「5 * 3」这类乘号被误判），
 * 未闭合标记不匹配，按普通文本渲染（流式半截安全）。
 */
const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*(?!\s)[^*]+?(?<!\s)\*|`[^`]+`)/g

export function parseInline(text: string): InlineToken[]
{
  const tokens: InlineToken[] = []
  let last = 0
  let match: RegExpExecArray | null

  INLINE_PATTERN.lastIndex = 0

  while ((match = INLINE_PATTERN.exec(text)) !== null)
  {
    if (match.index > last)
    {
      tokens.push({ type: 'text', text: text.slice(last, match.index) })
    }

    const token = match[0]

    if (token.startsWith('**'))
    {
      tokens.push({ type: 'strong', text: token.slice(2, -2) })
    }
    else if (token.startsWith('`'))
    {
      tokens.push({ type: 'code', text: token.slice(1, -1) })
    }
    else
    {
      tokens.push({ type: 'em', text: token.slice(1, -1) })
    }

    last = match.index + token.length
  }

  if (last < text.length)
  {
    tokens.push({ type: 'text', text: text.slice(last) })
  }

  return tokens
}
