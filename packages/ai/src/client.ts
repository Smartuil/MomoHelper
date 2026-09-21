/**
 * DeepSeek 客户端（OpenAI 兼容协议，docs/development-guide.md 第 7.2 节）。
 *
 * 用原生 fetch，不引入 openai SDK，减少 1G 内存机器的依赖体积。
 * 模型分配：
 *   - 释义 / 例句 / 助记生成、易混词对比 → deepseek-chat
 *   - 遗忘原因推测 → deepseek-reasoner
 *   - AI 问词（交互式流式）→ deepseek-chat
 */

export type AiModel = 'deepseek-chat' | 'deepseek-reasoner'

export interface AiClientOptions
{
  apiKey: string
  baseUrl?: string
}

export interface ChatMessage
{
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionParams
{
  model: AiModel
  messages: ChatMessage[]
  /** JSON 模式：prompt 中必须出现 "json" 字样并给出格式示例，否则可能返回空内容 */
  jsonMode?: boolean
  maxTokens?: number
  temperature?: number
}

export interface CompletionResult
{
  content: string
  promptTokens: number
  completionTokens: number
}

export class AiClient
{
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(options: AiClientOptions)
  {
    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '')
  }

  async complete(params: CompletionParams): Promise<CompletionResult>
  {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {})
      })
    })

    if (!response.ok)
    {
      const text = await response.text().catch(() => '')
      throw new Error(`DeepSeek 接口错误 HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
      usage?: { prompt_tokens: number; completion_tokens: number }
    }

    const choice = data.choices[0]

    return {
      content: choice?.message?.content ?? '',
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0
    }
  }

  /** 流式补全（SSE），逐段回调增量文本，用于 AI 问词（NFR-1.3 首字 < 3s） */
  async streamComplete(
    params: CompletionParams,
    onDelta: (text: string) => void
  ): Promise<void>
  {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        stream: true
      })
    })

    if (!response.ok || !response.body)
    {
      throw new Error(`DeepSeek 流式接口错误 HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;)
    {
      const { done, value } = await reader.read()

      if (done)
      {
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // SSE 事件以空行分隔
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events)
      {
        for (const line of event.split('\n'))
        {
          if (!line.startsWith('data:'))
          {
            continue
          }

          const payload = line.slice(5).trim()

          if (payload === '[DONE]')
          {
            return
          }

          try
          {
            const chunk = JSON.parse(payload) as {
              choices: { delta?: { content?: string } }[]
            }

            const delta = chunk.choices[0]?.delta?.content

            if (delta)
            {
              onDelta(delta)
            }
          }
          catch
          {
            // 忽略无法解析的心跳/分片
          }
        }
      }
    }
  }
}
