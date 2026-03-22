import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.ts'
import { signToken, authMiddleware, type JwtPayload } from '../middleware/auth.ts'

const auth = new Hono()

auth.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>()

  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400)
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role as JwtPayload['role'],
  }

  const token = signToken(payload)

  // Set HTTP-only cookie
  c.header('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`)

  return c.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    token,
  })
})

auth.post('/logout', (c) => {
  c.header('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0')
  return c.json({ ok: true })
})

auth.get('/me', authMiddleware, async (c) => {
  const jwtUser = c.get('user')

  const [user] = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.id, jwtUser.userId))

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ user })
})

auth.put('/password', authMiddleware, async (c) => {
  const jwtUser = c.get('user')
  const { oldPassword, newPassword } = await c.req.json<{ oldPassword: string; newPassword: string }>()

  if (!oldPassword || !newPassword) {
    return c.json({ error: 'Old and new password required' }, 400)
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, jwtUser.userId))

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  const valid = await bcrypt.compare(oldPassword, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid old password' }, 401)
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await db
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, jwtUser.userId))

  return c.json({ ok: true })
})

export default auth
