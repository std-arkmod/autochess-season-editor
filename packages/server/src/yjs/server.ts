import { WebSocketServer, type WebSocket } from 'ws'
import * as Y from 'yjs'
import type { IncomingMessage } from 'http'
import type { Server } from 'http'
import { verifyToken } from '../middleware/auth.ts'
import { loadYjsDoc, saveYjsDoc, yDocToPlainObject, plainObjectToYDoc } from './persistence.ts'

interface ConnectedClient {
  ws: WebSocket
  userId: string
  displayName: string
  seasonId: string
  awareness: {
    module?: string
    focusId?: string | null
    focusField?: string | null
  }
}

// In-memory Yjs docs keyed by seasonId
const docs = new Map<string, Y.Doc>()
const clients = new Map<WebSocket, ConnectedClient>()
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

const SAVE_DEBOUNCE_MS = 2000
const PING_INTERVAL_MS = 30_000

function getOrCreateDoc(seasonId: string): Promise<Y.Doc> {
  const existing = docs.get(seasonId)
  if (existing) return Promise.resolve(existing)

  return loadYjsDoc(seasonId).then((doc) => {
    docs.set(seasonId, doc)

    // Watch for changes and auto-save
    doc.on('update', () => {
      debouncedSave(seasonId, doc)
    })

    return doc
  })
}

function debouncedSave(seasonId: string, doc: Y.Doc) {
  const existing = saveTimers.get(seasonId)
  if (existing) clearTimeout(existing)

  saveTimers.set(seasonId, setTimeout(async () => {
    try {
      await saveYjsDoc(seasonId, doc)
    } catch (err) {
      console.error(`Failed to save Yjs doc for season ${seasonId}:`, err)
    }
  }, SAVE_DEBOUNCE_MS))
}

function broadcastToRoom(seasonId: string, message: unknown, exclude?: WebSocket) {
  const msg = JSON.stringify(message)
  for (const [ws, client] of clients) {
    if (client.seasonId === seasonId && ws !== exclude && ws.readyState === ws.OPEN) {
      ws.send(msg)
    }
  }
}

function getRoomPresence(seasonId: string, excludeWs?: WebSocket): Array<{ userId: string; displayName: string; module?: string; focusId?: string | null; focusField?: string | null }> {
  // Deduplicate by userId (same user may have multiple tabs)
  const seen = new Map<string, { userId: string; displayName: string; module?: string; focusId?: string | null; focusField?: string | null }>()
  for (const [ws, client] of clients) {
    if (client.seasonId === seasonId && ws !== excludeWs) {
      // Last connection wins for awareness info
      seen.set(client.userId, {
        userId: client.userId,
        displayName: client.displayName,
        ...client.awareness,
      })
    }
  }
  return [...seen.values()]
}

/** Broadcast a season_deleted event to all clients in the room. */
export function notifySeasonDeleted(seasonId: string) {
  broadcastToRoom(seasonId, { type: 'season_deleted', seasonId })
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true })

  // Ping all clients periodically to keep connections alive
  const pingInterval = setInterval(() => {
    for (const [ws] of clients) {
      if (ws.readyState === ws.OPEN) {
        ws.ping()
      }
    }
  }, PING_INTERVAL_MS)

  wss.on('close', () => clearInterval(pingInterval))

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host}`)
    const pathname = url.pathname

    // Only handle /yjs/:seasonId
    const match = pathname.match(/^\/yjs\/(.+)$/)
    if (!match) {
      socket.destroy()
      return
    }

    const seasonId = match[1]
    const token = url.searchParams.get('token')

    if (!token) {
      socket.destroy()
      return
    }

    try {
      const payload = verifyToken(token)

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, { seasonId, ...payload })
      })
    } catch {
      socket.destroy()
    }
  })

  wss.on('connection', async (ws: WebSocket, _request: IncomingMessage, meta: { seasonId: string; userId: string; username: string; role: string }) => {
    const { seasonId, userId, username } = meta

    const client: ConnectedClient = {
      ws,
      userId,
      displayName: username,
      seasonId,
      awareness: {},
    }
    clients.set(ws, client)

    // Terminate connection if pong not received
    let alive = true
    ws.on('pong', () => { alive = true })

    const aliveCheck = setInterval(() => {
      if (!alive) {
        clearInterval(aliveCheck)
        ws.terminate()
        return
      }
      alive = false
    }, PING_INTERVAL_MS + 5000)

    try {
      // Load the doc and send full state
      const doc = await getOrCreateDoc(seasonId)
      const state = Y.encodeStateAsUpdate(doc)

      ws.send(JSON.stringify({
        type: 'sync',
        state: Buffer.from(state).toString('base64'),
      }))

      // Notify room about new user
      broadcastToRoom(seasonId, {
        type: 'user_joined',
        userId,
        displayName: username,
      }, ws)

      // Send current presence (excluding self, self is already known to the client)
      ws.send(JSON.stringify({
        type: 'presence_list',
        users: getRoomPresence(seasonId, ws),
      }))
    } catch (err) {
      console.error('Failed to initialize WebSocket connection:', err)
      clearInterval(aliveCheck)
      ws.close()
      return
    }

    ws.on('message', async (rawData) => {
      try {
        const message = JSON.parse(rawData.toString())

        switch (message.type) {
          case 'update': {
            // Client sends a Yjs update
            const doc = docs.get(seasonId)
            if (!doc) break

            const update = Buffer.from(message.update, 'base64')
            Y.applyUpdate(doc, new Uint8Array(update))

            // Broadcast to other clients
            broadcastToRoom(seasonId, {
              type: 'update',
              update: message.update,
              userId,
            }, ws)
            break
          }

          case 'presence': {
            // Update awareness
            client.awareness = {
              module: message.module,
              focusId: message.focusId,
              focusField: message.focusField,
            }

            broadcastToRoom(seasonId, {
              type: 'presence',
              userId,
              displayName: username,
              module: message.module,
              focusId: message.focusId,
              focusField: message.focusField,
            }, ws)
            break
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err)
      }
    })

    ws.on('close', () => {
      clearInterval(aliveCheck)
      clients.delete(ws)

      // Only send user_left if this user has no other connections in the room
      const stillConnected = [...clients.values()].some(c => c.seasonId === seasonId && c.userId === userId)
      if (!stillConnected) {
        broadcastToRoom(seasonId, {
          type: 'user_left',
          userId,
        })
      }

      // If no more clients for this doc, save and cleanup after a delay
      const hasClients = [...clients.values()].some(c => c.seasonId === seasonId)
      if (!hasClients) {
        const doc = docs.get(seasonId)
        if (doc) {
          saveYjsDoc(seasonId, doc)
            .then(() => {
              docs.delete(seasonId)
              doc.destroy()
            })
            .catch(err => console.error('Failed to save on disconnect:', err))
        }
      }
    })
  })
}
