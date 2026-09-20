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

  ENABLE_API: toBool.default('true'),
  ENABLE_WORKER: toBool.default('true'),
  ENABLE_SCHEDULER: toBool.default('true'),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2)
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
