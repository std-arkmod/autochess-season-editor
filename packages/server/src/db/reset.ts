/**
 * Reset database: delete templates and related data, mark user seasons as outdated.
 * Usage: tsx src/db/reset.ts
 */
import { db, schema } from './index.ts'
import { sql, eq, isNotNull, and, not, like } from 'drizzle-orm'

async function main() {
  console.log('Resetting database (keeping users)...')

  // Mark user-owned seasons as outdated (append suffix if not already present)
  const outdated = await db.update(schema.seasons)
    .set({ label: sql`label || '（已过时）'` })
    .where(and(
      isNotNull(schema.seasons.ownerId),
      not(like(schema.seasons.label, '%（已过时）')),
    ))
    .returning({ id: schema.seasons.id })

  if (outdated.length > 0) {
    console.log(`  ✓ Marked ${outdated.length} user season(s) as outdated`)
  }

  // Delete templates and their dependent data (cascade handles snapshots/permissions/yjs)
  const deleted = await db.delete(schema.seasons)
    .where(eq(schema.seasons.isTemplate, 1))
    .returning({ id: schema.seasons.id })

  console.log(`  ✓ Deleted ${deleted.length} template(s)`)

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.users)
  console.log(`  ✓ Kept ${count} user(s)`)

  const [{ seasonCount }] = await db.select({ seasonCount: sql<number>`count(*)` }).from(schema.seasons)
  console.log(`  ✓ Kept ${seasonCount} user season(s)`)

  console.log('Done.')
  process.exit(0)
}

main().catch(err => {
  console.error('Reset failed:', err)
  process.exit(1)
})
