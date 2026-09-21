import type { ApiErrorCode } from '@momo/types'

/**
 * 带状态码的业务错误。
 *
 * 统一由 errorHandler 转换为 { error: { code, message } }（docs 第 7.5 节），
 * 禁止把原始接口错误直接抛给用户（NFR-3.5）。
 */
export class HttpError extends Error
{
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode, status: number, message: string)
  {
    super(message)
    this.name = 'HttpError'
    this.code = code
    this.status = status
  }
}

export const unauthorized = (message = '未登录'): HttpError =>
  new HttpError('unauthorized', 401, message)

export const tokenInvalid = (message = '墨墨 Token 无效或已过期，请重新绑定'): HttpError =>
  new HttpError('maimemo_token_invalid', 401, message)

export const maimemoUnavailable = (message = '墨墨数据暂不可用，展示最近一次数据'): HttpError =>
  new HttpError('maimemo_unavailable', 503, message)

export const permissionDenied = (message = '请在设置中开启对应写入权限'): HttpError =>
  new HttpError('permission_denied', 403, message)

export const validationFailed = (message = '请求参数不合法'): HttpError =>
  new HttpError('validation_failed', 400, message)
