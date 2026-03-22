import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import type { Server } from 'http'
import authRoutes from './routes/auth.ts'
import seasonRoutes from './routes/seasons.ts'
import userRoutes from './routes/users.ts'
import { setupWebSocketServer } from './yjs/server.ts'

const app = new Hono()

// Routes
app.route('/api/auth', authRoutes)
app.route('/api/seasons', seasonRoutes)
app.route('/api/users', userRoutes)

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

const port = parseInt(process.env.PORT ?? '3001', 10)

const hostname = process.env.HOST ?? '0.0.0.0'

const server = serve({
  fetch: app.fetch,
  port,
  hostname,
}, (info) => {
  console.log(`Server running on http://${hostname}:${info.port}`)
})

// Attach WebSocket server for Yjs sync
setupWebSocketServer(server as unknown as Server)
