import type { ErrorHandler } from 'hono'

import { HttpError } from '../errors.js'

/**
 * 统一错误处理（NFR-3.5）。
 *
 * HttpError / MaimemoAuthError 转换为对应错误码与可读文案；
 * 其余错误一律 500，详情只进日志。
 */
export const errorHandler: ErrorHandler = (err, c) =>
{
  if (err instanceof HttpError)
  {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.status as 400 | 401 | 403 | 404 | 429 | 500 | 503
    )
  }

  // 墨墨 Token 失效（C10）→ 前端引导重绑
  if (err instanceof Error && err.name === 'MaimemoAuthError')
  {
    return c.json(
      { error: { code: 'maimemo_token_invalid', message: '墨墨 Token 无效或已过期，请重新绑定' } },
      401
    )
  }

  // 墨墨学习数据不可用（C2）→ 前端展示降级提示
  if (err instanceof Error && err.name === 'MaimemoStudyUnavailableError')
  {
    return c.json(
      { error: { code: 'maimemo_unavailable', message: '墨墨数据暂不可用，请稍后重试' } },
      503
    )
  }

  console.error('[http] 未捕获错误', err)

  return c.json(
    {
      error: {
        code: 'internal_error',
        message: '服务内部错误，请稍后重试'
      }
    },
    500
  )
}
