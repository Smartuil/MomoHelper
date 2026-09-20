export interface SchedulerHandle
{
  stop: () => Promise<void>
}

/** 定时任务清单（cron 表达式为 6 段，含秒） */
export const SCHEDULED_TASKS = [
  {
    name: 'daily-snapshot',
    cron: '0 10 0 * * *',
    description: '每日学习快照，调用 get_study_progress 写入 daily_study_snapshots'
  },
  {
    name: 'queue-resume',
    cron: '0 30 0 * * *',
    description: '新的一天配额恢复后，继续执行未完成的写入任务'
  },
  {
    name: 'token-check',
    cron: '0 0 8 * * *',
    description: 'Token 过期巡检，标记 EXPIRED 并推送提醒'
  },
  {
    name: 'forget-accumulate',
    cron: '0 40 23 * * *',
    description: '汇总当日遗忘事件到 forget_events'
  },
  {
    name: 'weekly-report',
    cron: '0 0 9 * * 1',
    description: '生成上周周报'
  }
] as const

/**
 * 定时任务调度。
 *
 * 这些任务必须无人值守执行：墨墨学习数据接口只有今日快照、没有历史序列，
 * 漏采一天就永久缺失一天，周报与趋势功能全部依赖快照表。
 *
 * 当前为骨架实现：如需启用，接入 node-cron 后逐个注册 SCHEDULED_TASKS。
 */
export function startScheduler(): SchedulerHandle
{
  let running = true

  console.log(`[scheduler] 已注册 ${SCHEDULED_TASKS.length} 项定时任务（骨架，未实际调度）`)

  return {
    stop: async () =>
    {
      running = false
      void running
    }
  }
}
