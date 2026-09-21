import { Hono } from 'hono'

import { errorHandler } from './middleware/error.js'
import { authRoutes } from './routes/auth.js'
import { askRoutes } from './routes/ask.js'
import { confusionRoutes } from './routes/confusion.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { healthRoutes } from './routes/health.js'
import { maimemoRoutes } from './routes/maimemo.js'
import { notepadRoutes } from './routes/notepads.js'
import { systemRoutes } from './routes/system.js'

/**
 * HTTP 应用装配。
 *
 * 约定（docs/architecture.md 第 10.3 节）：所有接口统一挂载在 /api 下。
 */
export function createApp(): Hono
{
  const app = new Hono()

  app.onError(errorHandler)

  const api = new Hono()

  api.route('/', healthRoutes)
  api.route('/', authRoutes)
  api.route('/', maimemoRoutes)
  api.route('/', dashboardRoutes)
  api.route('/', confusionRoutes)
  api.route('/', askRoutes)
  api.route('/', notepadRoutes)
  api.route('/', systemRoutes)

  app.route('/api', api)

  return app
}
