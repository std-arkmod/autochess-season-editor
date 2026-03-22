import { createMiddleware } from 'hono/factory'
import jwt from 'jsonwebtoken'

export interface JwtPayload {
  userId: string
  username: string
  role: 'admin' | 'editor' | 'viewer'
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'autochess-editor-secret-change-me'
export const JWT_EXPIRY = '24h'

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

declare module 'hono' {
  interface ContextVariableMap {
    user: JwtPayload
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  // Try cookie first, then Authorization header
  const cookieHeader = c.req.header('cookie') ?? ''
  const tokenFromCookie = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('token='))
    ?.split('=')[1]

  const authHeader = c.req.header('authorization')
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined

  const token = tokenFromCookie ?? tokenFromHeader

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const payload = verifyToken(token)
    c.set('user', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
})

export const requireRole = (...roles: string[]) => {
  return createMiddleware(async (c, next) => {
    const user = c.get('user')
    if (!roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  })
}
