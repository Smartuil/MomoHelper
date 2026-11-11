/**
 * 本地设置层（纯前端方案）。
 *
 * 墨墨 Token 与 DeepSeek Key 只存在当前浏览器的 localStorage：
 * 单用户自用工具，无后端、无数据库，凭据不离开本机。
 * 墨墨 Token 有效期 7 天且无刷新机制（真机实测），绑定时间用于计算过期提醒。
 */

const STORAGE_KEYS = {
  maimemoToken: 'momo.maimemoToken',
  tokenBoundAt: 'momo.tokenBoundAt',
  deepseekKey: 'momo.deepseekKey'
} as const

/** 墨墨个人 Token 有效期：7 天（C10，实测无刷新机制） */
export const MAIMEMO_TOKEN_TTL_DAYS = 7

export interface MaimemoTokenStatus
{
  hasToken: boolean
  boundAt: string | null
  /** 预计过期时间（ISO），未绑定为 null */
  expiresAt: string | null
  /** 距过期剩余整天数；已过期为 0 */
  remainingDays: number | null
  expired: boolean
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

/** 绑定成功后调用：记录绑定时间，用于计算 7 天有效期 */
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
  const boundAt = read(STORAGE_KEYS.tokenBoundAt)

  if (!token)
  {
    return { hasToken: false, boundAt: null, expiresAt: null, remainingDays: null, expired: false }
  }

  const boundMs = boundAt ? Date.parse(boundAt) : Number.NaN

  if (Number.isNaN(boundMs))
  {
    // 有 Token 但没有绑定时间（旧数据）：只提示已绑定，不算有效期
    return { hasToken: true, boundAt: null, expiresAt: null, remainingDays: null, expired: false }
  }

  const expiresMs = boundMs + MAIMEMO_TOKEN_TTL_DAYS * 86_400_000

  return {
    hasToken: true,
    boundAt,
    expiresAt: new Date(expiresMs).toISOString(),
    remainingDays: Math.max(0, Math.floor((expiresMs - Date.now()) / 86_400_000)),
    expired: Date.now() >= expiresMs
  }
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
