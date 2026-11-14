/**
 * 遗忘词诊断历史（纯前端方案，localStorage 持久化）。
 *
 * 用途：遗忘词页右栏「已诊断」标记 + 二次查看免再请求。
 * 单用户自用工具，不追求跨设备同步，存本机即可。
 * 上限 200 条（遗忘词按天滚动，旧记录自然淘汰）。
 */

import type { ForgetDiagnosis } from '@momo/ai'

import { getAiThinkingMode } from './settings'

const HISTORY_KEY = 'momo.diagnoseHistory'
const MAX_ITEMS = 200

export interface DiagnoseRecord
{
  spelling: string
  /** 诊断时间（ISO） */
  at: string
  /** 诊断时用的思考模式，回看时区分参考价值 */
  thinking: boolean
  data: ForgetDiagnosis
}

function readAll(): DiagnoseRecord[]
{
  try
  {
    const raw = localStorage.getItem(HISTORY_KEY)

    if (!raw)
    {
      return []
    }

    const parsed = JSON.parse(raw) as DiagnoseRecord[]

    return Array.isArray(parsed) ? parsed.filter((item) => item?.spelling && item?.data) : []
  }
  catch
  {
    return []
  }
}

function writeAll(records: DiagnoseRecord[]): void
{
  try
  {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_ITEMS)))
  }
  catch
  {
    // 存储满 / 隐私模式：静默失败，本次会话仍可正常诊断
  }
}

/** 全部历史，最新在前（用于右栏直接回看与已诊断标记） */
export function getDiagnoseHistory(): DiagnoseRecord[]
{
  return readAll()
}

/** 查单个词的最近一次诊断 */
export function findDiagnosis(spelling: string): DiagnoseRecord | undefined
{
  const key = spelling.toLowerCase()

  return readAll().find((item) => item.spelling.toLowerCase() === key)
}

/**
 * 记录一次诊断（同词去重，最新在前）。
 * 在诊断成功回调里调用。
 */
export function saveDiagnosis(
  spelling: string,
  data: ForgetDiagnosis,
  thinking: boolean
): void
{
  const record: DiagnoseRecord = {
    spelling,
    at: new Date().toISOString(),
    thinking,
    data
  }

  const key = spelling.toLowerCase()
  const rest = readAll().filter((item) => item.spelling.toLowerCase() !== key)

  writeAll([record, ...rest])
}

/** 清空历史（设置页或调试入口用） */
export function clearDiagnoseHistory(): void
{
  try
  {
    localStorage.removeItem(HISTORY_KEY)
  }
  catch
  {
    // 忽略
  }
}

/** 便捷：读历史同时带当前思考模式（历史记录里 thinking 为存量字段，仅供展示） */
export function currentThinking(): boolean | null
{
  return getAiThinkingMode() === 'on'
}
