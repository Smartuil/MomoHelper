import { Hono } from 'hono'
import { errorHandler } from './middleware/error.js'
import { healthRoutes } from './routes/health.js'

/**
 * HTTP 应用装配。
 *
 * 约定（docs/architecture.md 第 10.3 节）：所有接口统一挂载在 /api 下。
 * 后续业务路由（dashboard / diagnose / generate / notepads 等）
 * 在此挂载。
 */
export function createApp(): Hono
{
  const app = new Hono()

  app.onError(errorHandler)

  const api = new Hono()
  api.route('/', healthRoutes)

  app.route('/api', api)

  return app
}
