import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'

/**
 * 学习数据表（docs/development-guide.md 第 6.4、6.9、6.11、6.12 节）。
 *
 * 墨墨 API 无按天历史序列（C3），趋势类功能全部依赖本文件的快照与累积表。
 */

export const dailyStudySnapshots = pgTable(
  'daily_study_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    /** 北京时间日期（C14） */
    snapshotDate: date('snapshot_date').notNull(),
    finished: integer('finished').notNull(),
    total: integer('total').notNull(),
    studyTimeMs: bigint('study_time_ms', { mode: 'number' }).notNull(),
    /** C2：当日未打开 App 初始化时数据不可信，展示需标注 */
    isReliable: boolean('is_reliable').notNull().default(true),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique('daily_snapshot_unique').on(table.userId, table.snapshotDate)]
)

export const forgetEvents = pgTable(
  'forget_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    vocId: text('voc_id').notNull(),
    spelling: text('spelling').notNull(),
    eventDate: date('event_date').notNull(),
    response: text('response').notNull(),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('forget_event_unique').on(table.userId, table.vocId, table.eventDate, table.source),
    index('forget_events_user_date_idx').on(table.userId, table.eventDate)
  ]
)

export const dailyReviews = pgTable(
  'daily_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    reviewDate: date('review_date').notNull(),
    /** 结构化复盘内容；唯一约束避免重复生成产生不一致文案（AC-12.2） */
    content: jsonb('content').notNull(),
    metrics: jsonb('metrics').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique('daily_review_unique').on(table.userId, table.reviewDate)]
)

export const periodicReports = pgTable(
  'periodic_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    periodType: text('period_type').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    content: jsonb('content').notNull(),
    /** 快照完整度，低于 0.7 时 UI 需提示（AC-13.1） */
    dataCompleteness: numeric('data_completeness', { precision: 3, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique('periodic_report_unique').on(table.userId, table.periodType, table.periodStart)
  ]
)
