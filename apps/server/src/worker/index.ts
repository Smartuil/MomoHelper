export interface WorkerHandle
{
  stop: () => Promise<void>
}

/**
 * 内容写入队列消费。
 *
 * 约束：
 * - 全局并发限制为 env.WORKER_CONCURRENCY（2 核 2G 规格建议 2），
 *   目的不是提高吞吐，而是保护机器不被批量任务打爆。
 * - 墨墨 C4：释义 / 例句 / 助记三类合计每天最多 600 条，
 *   必须按天分配额度，支持断点续传与失败重试。
 * - 墨墨 C9：10 秒 20 次、60 秒 40 次、5 小时 2000 次，
 *   必须串行等待而非瞬时打满。
 * - 写操作需幂等，避免重试产生重复内容。
 *
 * 当前为骨架实现，返回的 stop 会等待进行中的任务结束后再返回。
 */
export function startWorker(): WorkerHandle
{
  let running = true
  let pending = Promise.resolve()

  const loop = async (): Promise<void> =>
  {
    while (running)
    {
      const processed = await processNextBatch()
      if (!processed)
      {
        await sleep(2000)
      }
    }
  }

  pending = loop()

  return {
    stop: async () =>
    {
      running = false
      await pending
    }
  }
}

/** 处理一个批次，返回是否实际处理了任务 */
async function processNextBatch(): Promise<boolean>
{
  // TODO: 从 content_write_items 取 PENDING 任务，串行执行
  return false
}

function sleep(ms: number): Promise<void>
{
  return new Promise((resolve) => setTimeout(resolve, ms))
}
