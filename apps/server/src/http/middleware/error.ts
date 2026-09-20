import type { ErrorHandler } from 'hono'

/**
 * 统一错误处理。
 *
 * 约定（PRD NFR-3.5）：不把原始接口错误直接抛给用户，
 * 统一转换为可读文案；敏感信息只进日志。
 */
export const errorHandler: ErrorHandler = (err, c) =>
{
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
