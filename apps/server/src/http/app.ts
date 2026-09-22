import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { env } from '../config/env.js'
import { errorHandler } from './middleware/error.js'
import { authRoutes } from './routes/auth.js'
import { askRoutes } from './routes/ask.js'
import { confusionRoutes } from './routes/confusion.js'
import { contentRoutes } from './routes/content.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { extractRoutes } from './routes/extract.js'
import { forgetRoutes } from './routes/forget.js'
import { healthRoutes } from './routes/health.js'
import { maimemoRoutes } from './routes/maimemo.js'
import { notepadRoutes } from './routes/notepads.js'
import { planRoutes } from './routes/plan.js'
import { reviewRoutes } from './routes/review.js'
import { systemRoutes } from './routes/system.js'
import { wordcloudRoutes } from './routes/wordcloud.js'

/**
 * HTTP 应用装配。
 *
 * 约定（docs/architecture.md 第 10.3 节）：所有接口统一挂载在 /api 下。
 */
export function createApp(): Hono
{
  const app = new Hono()

  app.onError(errorHandler)

  // 本地开发：web(3100) 跨端口访问 API(3000)；生产同域部署无需 CORS
  if (env.NODE_ENV === 'development')
  {
    app.use(
      '/api/*',
      cors({
        origin: ['http://localhost:3100', 'http://127.0.0.1:3100'],
        allowHeaders: ['Content-Type'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true
      })
    )
  }

  const api = new Hono()

  api.route('/', healthRoutes)
  api.route('/', authRoutes)
  api.route('/', maimemoRoutes)
  api.route('/', dashboardRoutes)
  api.route('/', forgetRoutes)
  api.route('/', confusionRoutes)
  api.route('/', askRoutes)
  api.route('/', contentRoutes)
  api.route('/', notepadRoutes)
  api.route('/', planRoutes)
  api.route('/', extractRoutes)
  api.route('/', reviewRoutes)
  api.route('/', wordcloudRoutes)
  api.route('/', systemRoutes)

  app.route('/api', api)

  return app
}
