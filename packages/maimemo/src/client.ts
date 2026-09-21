import type { MaimemoEnvelope, MaimemoEnvelopeError } from '@momo/types'

import { MaimemoRateLimiter } from './rate-limiter.js'
import {
  MaimemoApiError,
  MaimemoAuthError,
  MaimemoNetworkError,
  MaimemoRateLimitError
} from './errors.js'

const DEFAULT_BASE_URL = 'https://open.maimemo.com/open/api/v1/memo'

export interface MaimemoClientOptions
{
  token: string
  baseUrl?: string
}

export interface RequestOptions
{
  /**
   * 非写操作遇到 429 时最多重试次数（NFR-3.2：不重试写操作，避免重复写入）。
   * 写操作调用方必须显式传 0。
   */
  retries?: number
}

/**
 * 墨墨 Open API 客户端：统一请求、包裹层解析、限流与错误映射。
 *
 * 解析规则以真机实测为准（api-capability-gap.md 第七节）：
 * 1. 所有响应统一包裹在 { errors, data, success } 中；
 * 2. 鉴权失败返回 HTTP 401 + common_unauthorized；
 * 3. 单词存在性必须判 data.voc，不能依赖 success（C12，由调用方实现）。
 */
export class MaimemoClient
{
  private readonly token: string
  private readonly baseUrl: string
  private readonly limiter = new MaimemoRateLimiter()

  constructor(options: MaimemoClientOptions)
  {
    this.token = options.token
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
  }

  /** 发起请求并返回 envelope 的 data 部分 */
  async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T>
  {
    const maxRetries = options?.retries ?? 0
    let attempt = 0

    for (;;)
    {
      await this.limiter.acquire()

      let response: Response

      try
      {
        response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: body === undefined ? undefined : JSON.stringify(body)
        })
      }
      catch (error)
      {
        throw new MaimemoNetworkError(
          `墨墨接口网络错误: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      if (response.status === 401)
      {
        throw new MaimemoAuthError()
      }

      if (response.status === 429)
      {
        if (attempt < maxRetries)
        {
          attempt++
          await sleep(backoffMs(attempt))
          continue
        }

        throw new MaimemoRateLimitError()
      }

      // 其余状态码尝试解析包裹层；无法解析时按 HTTP 状态报错
      let envelope: MaimemoEnvelope<unknown>

      try
      {
        envelope = (await response.json()) as MaimemoEnvelope<unknown>
      }
      catch
      {
        throw new MaimemoApiError(
          `http_${response.status}`,
          `墨墨接口返回非 JSON 响应（HTTP ${response.status}）`
        )
      }

      if (envelope.success === false || (envelope.errors?.length ?? 0) > 0)
      {
        const first: MaimemoEnvelopeError | undefined = envelope.errors?.[0]

        if (first?.code === 'common_unauthorized')
        {
          throw new MaimemoAuthError()
        }

        throw new MaimemoApiError(first?.code ?? 'unknown', first?.msg ?? '未知错误')
      }

      return envelope.data as T
    }
  }
}

/** 指数退避：1s、2s、4s…上限 10s */
function backoffMs(attempt: number): number
{
  return Math.min(1000 * 2 ** (attempt - 1), 10_000)
}

function sleep(ms: number): Promise<void>
{
  return new Promise((resolve) => setTimeout(resolve, ms))
}
