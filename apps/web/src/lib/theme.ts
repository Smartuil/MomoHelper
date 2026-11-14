/**
 * 主题（浅色 / 夜间）：首次访问跟随系统偏好，手动切换后记住选择。
 * 与凭据等本地设置同存 localStorage；首屏应用在 layout 的内联脚本里完成，
 * 避免 SSR 静态 HTML 闪一下白底再变暗（FOUC）。
 */

export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'momo.theme'

export function getStoredTheme(): ThemeMode | null
{
  try
  {
    const value = localStorage.getItem(THEME_KEY)

    return value === 'light' || value === 'dark' ? value : null
  }
  catch
  {
    return null
  }
}

export function storeTheme(mode: ThemeMode): void
{
  try
  {
    localStorage.setItem(THEME_KEY, mode)
  }
  catch
  {
    // 隐私模式 / 存储被禁用时静默失败：本次会话仍可切换，只是不记住
  }
}

/** 切 <html> 上的 dark class，token 在 globals.css 里全量覆盖 */
export function applyTheme(mode: ThemeMode): void
{
  document.documentElement.classList.toggle('dark', mode === 'dark')
}

/** 当前生效主题：以 <html> class 为准（内联脚本已按 存储值 > 系统偏好 初始化） */
export function currentTheme(): ThemeMode
{
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}
