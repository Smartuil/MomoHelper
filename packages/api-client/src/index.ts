import type { ApiFailure } from '@momo/types'

/**
 * 前端 API 请求封装（docs/tech-stack.md「API 请求层」）。
 *
 * 统一解包 { data } / { error }；错误抛 ApiError 供 UI 展示可读文案。
 * API base URL 用域名或同源相对路径，禁止硬编码服务器 IP（约定 4.3.2）。
 *
 * 微信登录资质到位前（MVP），遇 401 自动走开发登录并重试一次；
 * 后续接入微信登录后，将 devLogin 替换为跳转登录页即可。
 */

export class ApiError extends Error
{
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message: string)
  {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

function baseUrl(): string
{
  // 静态导出后与 API 同域部署，默认走相对路径；跨域时经构建期环境变量注入
  return globalThis.__MOMO_API_BASE__ ?? ''
}

declare global
{
  // eslint-disable-next-line no-var
  var __MOMO_API_BASE__: string | undefined
}

async function request<T>(path: string, init?: RequestInit): Promise<T>
{
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers
    },
    credentials: 'include'
  })

  const body = (await response.json().catch(() => null)) as
    | { data?: T; error?: ApiFailure['error'] }
    | null

  if (!response.ok || !body || body.error)
  {
    const error = body?.error
    throw new ApiError(
      error?.code ?? 'internal_error',
      response.status,
      error?.message ?? '请求失败，请稍后重试'
    )
  }

  return body.data as T
}

/** 开发登录单飞：并发 401 只发一次登录请求 */
let devLoginPromise: Promise<void> | null = null

function devLogin(): Promise<void>
{
  devLoginPromise ??= request('/api/auth/dev', { method: 'POST', body: '{}' })
    .then(() => undefined)
    .finally(() =>
    {
      devLoginPromise = null
    })

  return devLoginPromise
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>
{
  try
  {
    return await request<T>(path, init)
  }
  catch (error)
  {
    // 未登录（401）自动开发登录后重试一次；登录失败则抛原始错误
    if (error instanceof ApiError && error.status === 401)
    {
      try
      {
        await devLogin()
      }
      catch
      {
        throw error
      }

      return await request<T>(path, init)
    }

    throw error
  }
}
