import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'
import { db, schema } from '../db/index.ts'
import { authMiddleware, requireRole } from '../middleware/auth.ts'

const users = new Hono()

// Lightweight user list for sharing — any authenticated user can access
users.get('/list', authMiddleware, async (c) => {
  const result = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
    })
    .from(schema.users)
    .orderBy(schema.users.createdAt)

  return c.json({ users: result })
})

// All remaining routes require admin
users.use('*', authMiddleware, requireRole('admin'))

// List all users (admin — includes role & createdAt)
users.get('/', async (c) => {
  const result = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(schema.users.createdAt)

  return c.json({ users: result })
})

// Create user
users.post('/', async (c) => {
  const { username, password, displayName, role } = await c.req.json<{
    username: string
    password: string
    displayName?: string
    role?: string
  }>()

  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400)
  }

  // Check if username already exists
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))

  if (existing) {
    return c.json({ error: 'Username already exists' }, 409)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const id = nanoid()

  await db.insert(schema.users).values({
    id,
    username,
    passwordHash,
    displayName: displayName ?? username,
    role: (role as 'admin' | 'editor' | 'viewer') ?? 'editor',
  })

  return c.json({
    user: { id, username, displayName: displayName ?? username, role: role ?? 'editor' }
  }, 201)
})

// Update user
users.put('/:id', async (c) => {
  const { id } = c.req.param()
  const { displayName, role, password } = await c.req.json<{
    displayName?: string
    role?: string
    password?: string
  }>()

  const updates: Record<string, unknown> = {}
  if (displayName !== undefined) updates.displayName = displayName
  if (role !== undefined) updates.role = role
  if (password) updates.passwordHash = await bcrypt.hash(password, 10)

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  await db
    .update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, id))

  return c.json({ ok: true })
})

// Delete user
users.delete('/:id', async (c) => {
  const { id } = c.req.param()
  const currentUser = c.get('user')

  if (id === currentUser.userId) {
    return c.json({ error: 'Cannot delete yourself' }, 400)
  }

  await db.delete(schema.users).where(eq(schema.users.id, id))
  return c.body(null, 204)
})

export default users
