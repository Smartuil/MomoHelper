import { defineConfig } from 'drizzle-kit'

/**
 * Drizzle 迁移配置。
 *
 * 迁移文件输出到 packages/db/migrations/，
 * 在服务器上执行 pnpm --filter @momo/db db:migrate 应用。
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ''
  }
})
