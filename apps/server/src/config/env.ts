import { z } from 'zod'

const toBool = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1),

  MAIMEMO_TOKEN_KEY: z.string().min(1),
  MAIMEMO_TOKEN_KEY_VERSION: z.coerce.number().int().positive().default(1),

  DEEPSEEK_API_KEY: z.string().min(1),
  DEEPSEEK_BASE_URL: z.string().min(1).default('https://api.deepseek.com'),

  SESSION_SECRET: z.string().min(16),

  // 微信登录资质到位前为可选；MVP 用开发登录（DEV_LOGIN）替代
  WECHAT_APP_ID: z.string().optional(),
  WECHAT_APP_SECRET: z.string().optional(),
  /** 开发登录开关：生产默认关闭；当前无微信资质，部署时需显式置 true */
  DEV_LOGIN: toBool.default(false),

  ENABLE_API: toBool.default(true),
  ENABLE_WORKER: toBool.default(true),
  ENABLE_SCHEDULER: toBool.default(true),

  // 1G 内存机器：默认 1，上限 2（docs/architecture.md 2.2）
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(2).default(1)
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env
{
  const result = envSchema.safeParse(process.env)

  if (!result.success)
  {
    console.error('环境变量校验失败：')
    for (const issue of result.error.issues)
    {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }

  return result.data
}

export const env = loadEnv()
