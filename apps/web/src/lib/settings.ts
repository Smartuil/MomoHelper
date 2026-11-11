/**
 * 本地设置层（纯前端方案）。
 *
 * 墨墨 Token 与 DeepSeek Key 只存在当前浏览器的 localStorage：
 * 单用户自用工具，无后端、无数据库，凭据不离开本机。
 * 墨墨未公开 Token 过期时间，也没有刷新接口，是否失效以接口鉴权结果为准，
 * 因此这里只记录绑定时间，不做有效期倒计时。
 */

const STORAGE_KEYS = {
  maimemoToken: 'momo.maimemoToken',
  tokenBoundAt: 'momo.tokenBoundAt',
  deepseekKey: 'momo.deepseekKey'
} as const

export interface MaimemoTokenStatus
{
  hasToken: boolean
  /** 绑定时间（ISO）；旧数据没有记录时为 null */
  boundAt: string | null
}

function read(key: string): string | null
{
  try
  {
    return localStorage.getItem(key)
  }
  catch
  {
    return null
  }
}

function write(key: string, value: string): void
{
  try
  {
    localStorage.setItem(key, value)
  }
  catch
  {
    // 隐私模式 / 存储被禁用时静默失败，读层会因拿不到值而引导重新配置
  }
}

function remove(key: string): void
{
  try
  {
    localStorage.removeItem(key)
  }
  catch
  {
    // 忽略
  }
}

// ============================ 墨墨 Token ============================

export function getMaimemoToken(): string | null
{
  return read(STORAGE_KEYS.maimemoToken)
}

/** 绑定成功后调用：记录绑定时间，供设置页展示 */
export function setMaimemoToken(token: string): void
{
  write(STORAGE_KEYS.maimemoToken, token.trim())
  write(STORAGE_KEYS.tokenBoundAt, new Date().toISOString())
}

export function clearMaimemoToken(): void
{
  remove(STORAGE_KEYS.maimemoToken)
  remove(STORAGE_KEYS.tokenBoundAt)
}

export function getMaimemoTokenStatus(): MaimemoTokenStatus
{
  const token = getMaimemoToken()

  if (!token)
  {
    return { hasToken: false, boundAt: null }
  }

  return { hasToken: true, boundAt: read(STORAGE_KEYS.tokenBoundAt) }
}

// ============================ DeepSeek Key ============================

export function getDeepSeekKey(): string | null
{
  return read(STORAGE_KEYS.deepseekKey)
}

export function setDeepSeekKey(key: string): void
{
  write(STORAGE_KEYS.deepseekKey, key.trim())
}

export function clearDeepSeekKey(): void
{
  remove(STORAGE_KEYS.deepseekKey)
}
