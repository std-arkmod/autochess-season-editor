import { pgTable, text, timestamp, jsonb, integer, unique } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull().default('editor'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const seasons = pgTable('seasons', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  data: jsonb('data').notNull(),
  version: integer('version').notNull().default(1),
  /** true = admin-managed template; false = user's private season copy */
  isTemplate: integer('is_template').notNull().default(0),
  /** Owner of private season (null for templates) */
  ownerId: text('owner_id').references(() => users.id),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})

export const seasonPermissions = pgTable('season_permissions', {
  id: text('id').primaryKey(),
  seasonId: text('season_id').references(() => seasons.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role', { enum: ['editor', 'viewer'] }).notNull(),
}, (table) => [
  unique('season_user_unique').on(table.seasonId, table.userId),
])

/** Season data snapshots for edit history (full baseline or incremental diff) */
export const seasonSnapshots = pgTable('season_snapshots', {
  id: text('id').primaryKey(),
  seasonId: text('season_id').references(() => seasons.id, { onDelete: 'cascade' }).notNull(),
  /** For 'full': complete season data. For 'diff': only changed top-level fields. */
  data: jsonb('data').notNull(),
  snapshotType: text('snapshot_type', { enum: ['full', 'diff'] }).notNull().default('full'),
  userId: text('user_id').references(() => users.id),
  description: text('description'),
  dataHash: text('data_hash').notNull(),
  /** Number of detailed field-level changes in this snapshot */
  changeCount: integer('change_count'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

/** Yjs document state stored as binary for persistence */
export const yjsDocuments = pgTable('yjs_documents', {
  seasonId: text('season_id').primaryKey().references(() => seasons.id, { onDelete: 'cascade' }),
  state: text('state').notNull(), // base64-encoded Yjs state
  updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
})
