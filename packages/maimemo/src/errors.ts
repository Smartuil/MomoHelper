/**
 * 墨墨 API 错误体系（docs/development-guide.md 第 7.1 节错误映射）。
 *
 * HTTP 401 / common_unauthorized → MaimemoAuthError，标记 Token 为 INVALID
 * HTTP 429                       → 由客户端限流排队，服务端仍 429 时退避重试
 * 网络错误                        → MaimemoNetworkError
 * 学习数据接口不可用               → MaimemoStudyUnavailableError，触发降级（C2）
 */
export class MaimemoError extends Error
{
  constructor(message: string)
  {
    super(message)
    this.name = 'MaimemoError'
  }
}

export class MaimemoAuthError extends MaimemoError
{
  constructor(message = '墨墨 Token 无效或已过期')
  {
    super(message)
    this.name = 'MaimemoAuthError'
  }
}

export class MaimemoRateLimitError extends MaimemoError
{
  constructor(message = '触发墨墨请求频控（C9）')
  {
    super(message)
    this.name = 'MaimemoRateLimitError'
  }
}

export class MaimemoNetworkError extends MaimemoError
{
  constructor(message = '墨墨接口网络错误')
  {
    super(message)
    this.name = 'MaimemoNetworkError'
  }
}

/** 学习数据接口处于公测（C2），不可用时上层必须走降级路径而非报错 */
export class MaimemoStudyUnavailableError extends MaimemoError
{
  constructor(message = '墨墨学习数据接口暂不可用')
  {
    super(message)
    this.name = 'MaimemoStudyUnavailableError'
  }
}

export class MaimemoApiError extends MaimemoError
{
  readonly code: string

  constructor(code: string, msg: string)
  {
    super(`墨墨接口错误 [${code}]: ${msg}`)
    this.name = 'MaimemoApiError'
    this.code = code
  }
}
