import { serve } from '@hono/node-server'
import { env } from './config/env.js'
import { createApp } from './http/app.js'
import { startScheduler } from './scheduler/index.js'
import { startWorker } from './worker/index.js'

/**
 * 独立服务器进程入口。
 *
 * 单进程承载三个模块（docs/architecture.md 第 4.2 节）：
 *   HTTP API + Queue Worker + Scheduler
 *
 * 启动顺序：Scheduler 注册 → Worker 启动 → HTTP 监听
 * 关闭顺序：停止接收新请求 → 停 Scheduler → 等 Worker 完成当前任务 → 退出
 *
 * 优雅关闭是必须的：硬中断会让正在写入墨墨的任务状态不一致。
 */
async function main(): Promise<void>
{
  const scheduler = env.ENABLE_SCHEDULER ? startScheduler() : null
  const worker = env.ENABLE_WORKER ? startWorker() : null

  const app = env.ENABLE_API ? createApp() : null
  const server = app
    ? serve({ fetch: app.fetch, port: env.PORT, hostname: '127.0.0.1' })
    : null

  if (server)
  {
    console.log(`[http] 监听 127.0.0.1:${env.PORT}`)
  }

  let shuttingDown = false

  const shutdown = async (signal: string): Promise<void> =>
  {
    if (shuttingDown)
    {
      return
    }
    shuttingDown = true

    console.log(`[server] 收到 ${signal}，开始优雅关闭`)

    await scheduler?.stop()
    await worker?.stop()

    if (server)
    {
      server.close((err) =>
      {
        if (err)
        {
          console.error('[server] 关闭 HTTP 服务失败', err)
        }
        process.exit(err ? 1 : 0)
      })
    }
    else
    {
      process.exit(0)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

void main()
