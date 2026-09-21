import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'

/**
 * 内容生成与写入队列表（docs/development-guide.md 第 6.5 ~ 6.7 节）。
 *
 * C4：释义 / 例句 / 助记三类合计每天最多 600 条，批量写入必须
 * 走分天队列，本组表是队列状态与配额记账的持久化载体。
 */

export const contentWriteJobs = pgTable(
  'content_write_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    jobType: text('job_type').notNull(),
    /** 生成场景（CONCISE / EXAM / TECH 等） */
    scene: text('scene').notNull(),
    totalCount: integer('total_count').notNull(),
    doneCount: integer('done_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    status: text('status').notNull().default('PENDING'),
    /** 配额归属日期（北京时间），跨天续跑依据 */
    quotaDate: date('quota_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('content_jobs_user_idx').on(table.userId, table.status)]
)

export const contentWriteItems = pgTable(
  'content_write_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => contentWriteJobs.id, { onDelete: 'cascade' }),
    /** 冗余幂等键列：与 jobId 关联的 job 冗余存储，支撑唯一索引（约定 4.3.8） */
    userId: uuid('user_id').notNull(),
    jobType: text('job_type').notNull(),
    scene: text('scene').notNull(),
    vocId: text('voc_id').notNull(),
    spelling: text('spelling').notNull(),
    /** AI 生成的结构化内容（已经 Zod 校验后才落库，约定 4.3.7） */
    payload: jsonb('payload'),
    status: text('status').notNull().default('PENDING'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    writtenAt: timestamp('written_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    /** 幂等键：重复提交不产生重复写入 */
    unique('content_item_idempotent').on(table.userId, table.jobType, table.vocId, table.scene),
    index('content_items_job_idx').on(table.jobId, table.status)
  ]
)

export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    scene: text('scene').notNull(),
    model: text('model').notNull(),
    /** 输入摘要（不存完整 prompt，控制体积，否则年增长可达 GB 级） */
    inputDigest: text('input_digest').notNull(),
    output: jsonb('output'),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    /** 用户是否采纳，用于 AI 内容采纳率指标 */
    accepted: boolean('accepted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('ai_generations_user_idx').on(table.userId, table.createdAt)]
)
