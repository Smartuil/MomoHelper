import { drizzle } from 'drizzle-orm/node-postgres'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as authSchema from './schema/auth.js'
import * as contentSchema from './schema/content.js'
import * as notepadSchema from './schema/notepads.js'
import * as studySchema from './schema/study.js'

export const schema = {
  ...authSchema,
  ...studySchema,
  ...contentSchema,
  ...notepadSchema
}

export * from './schema/auth.js'
export * from './schema/study.js'
export * from './schema/content.js'
export * from './schema/notepads.js'

export type Db = NodePgDatabase<typeof schema>

/**
 * 创建数据库连接池。
 *
 * 连接串只从 DATABASE_URL 读取；数据库仅监听 127.0.0.1，
 * 绝不暴露公网（docs/architecture.md 第 8 节）。
 * 1G 内存机器上 max_connections 已降到 30，池上限留余量。
 */
export function createDb(databaseUrl: string): Db
{
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  })

  return drizzle(pool, { schema })
}
