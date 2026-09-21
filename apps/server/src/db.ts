import { createDb } from '@momo/db'
import { env } from './config/env.js'

/** 全局共享的数据库实例（进程内单例） */
export const db = createDb(env.DATABASE_URL)
