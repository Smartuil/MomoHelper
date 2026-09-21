import { relations } from 'drizzle-orm'
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
 * 用户与凭据相关表（docs/development-guide.md 第 6.1 ~ 6.3、6.13 节）。
 *
 * 通用规则：所有表含 id（uuid 主键）、created_at、updated_at；
 * 时间字段统一 timestamptz；用户相关表含 user_id 并建立索引。
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  unionId: text('union_id').unique(),
  openIdWeb: text('open_id_web').unique(),
  openIdMp: text('open_id_mp').unique(),
  /** 墨墨 OIDC 用户标识（id_token.payload.sub），开放平台授权登录预留 */
  maimemoSub: text('maimemo_sub').unique(),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export const maimemoCredentials = pgTable('maimemo_credentials', {
  /** 一用户一条 */
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  credentialType: text('credential_type').notNull().default('MANUAL'),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  /** refresh token 加密三件套，仅 OIDC 使用（预留） */
  refreshCiphertext: text('refresh_ciphertext'),
  refreshIv: text('refresh_iv'),
  refreshAuthTag: text('refresh_auth_tag'),
  keyVersion: integer('key_version').notNull().default(1),
  tokenStatus: text('token_status').notNull().default('ACTIVE'),
  /** MANUAL 按 7 天有效期记录（C10）；OIDC 记录 access token 过期时间 */
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  /** 写入权限默认全关（保守策略，AC-6.1） */
  allowInterpretation: boolean('allow_interpretation').notNull().default(false),
  allowPhrase: boolean('allow_phrase').notNull().default(false),
  allowNote: boolean('allow_note').notNull().default(false),
  allowNotepad: boolean('allow_notepad').notNull().default(false),
  allowStudyPlan: boolean('allow_study_plan').notNull().default(false),
  /** 当日已用配额（C4：三类内容合计 600 条/天），事务 + 行锁扣减 */
  dailyQuotaUsed: integer('daily_quota_used').notNull().default(0),
  quotaResetDate: date('quota_reset_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
})

export const operationLogs = pgTable(
  'operation_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    target: text('target').notNull(),
    result: text('result').notNull(),
    detail: jsonb('detail'),
    /** 统一来自 getClientIp，禁止直接读 remoteAddress（约定 4.3.1） */
    clientIp: text('client_ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('operation_logs_user_idx').on(table.userId, table.createdAt)]
)

export const usersRelations = relations(users, ({ one, many }) => ({
  credential: one(maimemoCredentials),
  preferences: one(userPreferences),
  operationLogs: many(operationLogs)
}))
