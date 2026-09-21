import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from 'drizzle-orm/pg-core'

/**
 * 云词本映射与易混词组（docs/development-guide.md 第 6.8、6.10 节）。
 */

export const confusionGroups = pgTable(
  'confusion_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    /** 易混词组，如 ['adapt','adopt','adept'] */
    words: text('words').array().notNull(),
    reason: text('reason'),
    score: numeric('score', { precision: 6, scale: 4 }),
    /** 发现方式：EDIT_DISTANCE（本地算法）/ AI（推测，UI 需标注） */
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index('confusion_groups_user_idx').on(table.userId)]
)

export const notepadMappings = pgTable(
  'notepad_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    /** 墨墨云词本 ID（形如 np-...，不做格式假设） */
    notepadId: text('notepad_id').notNull(),
    title: text('title').notNull(),
    /** 平台侧标签 */
    tags: text('tags').array().notNull().default([]),
    /** 乐观锁版本号：更新接口全字段覆盖，并发写会互相覆盖（C11） */
    contentVersion: integer('content_version').notNull().default(1),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique('notepad_mapping_unique').on(table.userId, table.notepadId)]
)
