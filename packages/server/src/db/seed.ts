import { db, schema } from './index.ts'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'

async function main() {
  const username = process.argv[2] ?? 'admin'
  const password = process.argv[3] ?? 'admin123'

  const existing = await db.select().from(schema.users).where(
    (await import('drizzle-orm')).eq(schema.users.username, username)
  )

  if (existing.length > 0) {
    console.log(`User "${username}" already exists.`)
    process.exit(0)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  await db.insert(schema.users).values({
    id: nanoid(),
    username,
    passwordHash,
    displayName: username,
    role: 'admin',
  })

  console.log(`Admin user "${username}" created with password "${password}".`)
  console.log('Please change the password after first login.')
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
