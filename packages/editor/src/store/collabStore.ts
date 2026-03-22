import { useState, useEffect, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import type { AutoChessSeasonData } from '@autochess-editor/shared'

/** Base64 → Uint8Array (browser-safe) */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Uint8Array → Base64 (browser-safe) */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export interface CollabUser {
  userId: string
  displayName: string
  module?: string
  focusId?: string | null
  focusField?: string | null
}

interface WsMessage {
  type: string
  [key: string]: unknown
}

/**
 * Callback type for when remote edits arrive via Yjs.
 * App.tsx provides this to update the dataStore.
 */
export type OnRemoteUpdate = (data: AutoChessSeasonData) => void
export type OnSeasonDeleted = (seasonId: string) => void

const RECONNECT_INTERVAL = 2000
const MAX_RECONNECT_ATTEMPTS = 10

function buildWsUrl(seasonId: string, token: string): string {
  const apiBase = import.meta.env.VITE_API_URL ?? ''
  if (apiBase) {
    const url = new URL(apiBase)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = `/yjs/${seasonId}`
    url.search = `?token=${token}`
    return url.toString()
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProtocol}//${window.location.host}/yjs/${seasonId}?token=${token}`
}

export function useCollabStore(seasonId: string | null, token: string | null) {
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [connected, setConnected] = useState(false)
  const [synced, setSynced] = useState(false)
  const [users, setUsers] = useState<CollabUser[]>([])
  const [reconnectFailed, setReconnectFailed] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const docRef = useRef<Y.Doc | null>(null)
  const onRemoteUpdateRef = useRef<OnRemoteUpdate | null>(null)
  const onSeasonDeletedRef = useRef<OnSeasonDeleted | null>(null)
  const connectRef = useRef<(() => void) | null>(null)

  /** Register callback for remote updates */
  const setOnRemoteUpdate = useCallback((cb: OnRemoteUpdate | null) => {
    onRemoteUpdateRef.current = cb
  }, [])

  /** Register callback for season deletion */
  const setOnSeasonDeleted = useCallback((cb: OnSeasonDeleted | null) => {
    onSeasonDeletedRef.current = cb
  }, [])

  // Connect WebSocket when season changes
  useEffect(() => {
    if (!seasonId || !token) return

    const ydoc = new Y.Doc()
    docRef.current = ydoc
    setDoc(ydoc)

    let reconnectAttempt = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let intentionallyClosed = false

    // Send local Y.Doc changes to server (only local origin, not remote echoes)
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'update',
          update: uint8ArrayToBase64(update),
        }))
      }
    }
    ydoc.on('update', updateHandler)

    function connect() {
      const wsUrl = buildWsUrl(seasonId!, token!)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectAttempt = 0
        setReconnectFailed(false)
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null

        if (!intentionallyClosed) {
          if (reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempt++
            console.log(`WebSocket closed, reconnecting in ${RECONNECT_INTERVAL}ms (attempt ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`)
            reconnectTimer = setTimeout(connect, RECONNECT_INTERVAL)
          } else {
            console.log('Max reconnect attempts reached, manual reconnect required')
            setReconnectFailed(true)
          }
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror, reconnect is handled there
      }

      ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data)

          switch (message.type) {
            case 'sync': {
              const state = base64ToUint8Array(message.state as string)
              Y.applyUpdate(ydoc, state, 'remote')
              setSynced(true)
              break
            }

            case 'update': {
              const update = base64ToUint8Array(message.update as string)
              Y.applyUpdate(ydoc, update, 'remote')
              const data = yDocToPlainObject(ydoc)
              if (Object.keys(data).length > 0 && onRemoteUpdateRef.current) {
                onRemoteUpdateRef.current(data as unknown as AutoChessSeasonData)
              }
              break
            }

            case 'presence_list':
              setUsers(message.users as CollabUser[])
              break

            case 'presence':
              setUsers(prev => {
                const filtered = prev.filter(u => u.userId !== (message.userId as string))
                return [...filtered, {
                  userId: message.userId as string,
                  displayName: message.displayName as string,
                  module: message.module as string | undefined,
                  focusId: message.focusId as string | null | undefined,
                  focusField: message.focusField as string | null | undefined,
                }]
              })
              break

            case 'user_joined':
              setUsers(prev => {
                // Deduplicate: don't add if already present
                if (prev.some(u => u.userId === (message.userId as string))) return prev
                return [...prev, {
                  userId: message.userId as string,
                  displayName: message.displayName as string,
                }]
              })
              break

            case 'user_left':
              setUsers(prev => prev.filter(u => u.userId !== (message.userId as string)))
              break

            case 'season_deleted':
              if (onSeasonDeletedRef.current) {
                onSeasonDeletedRef.current(message.seasonId as string)
              }
              break
          }
        } catch (err) {
          console.error('WebSocket message error:', err)
        }
      }
    }

    connectRef.current = connect
    connect()

    return () => {
      intentionallyClosed = true
      connectRef.current = null
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ydoc.off('update', updateHandler)
      wsRef.current?.close()
      ydoc.destroy()
      wsRef.current = null
      docRef.current = null
      setDoc(null)
      setConnected(false)
      setSynced(false)
      setUsers([])
      setReconnectFailed(false)
    }
  }, [seasonId, token])

  // Manual reconnect after max attempts exhausted
  const manualReconnect = useCallback(() => {
    if (connectRef.current) {
      setReconnectFailed(false)
      connectRef.current()
    }
  }, [])

  // Send presence update
  const updatePresence = useCallback((module: string, focusId: string | null, focusField?: string | null) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'presence', module, focusId, focusField: focusField ?? null }))
    }
  }, [])

  // Get season data from Y.Doc
  const getSeasonData = useCallback((): AutoChessSeasonData | null => {
    const ydoc = docRef.current
    if (!ydoc) return null
    const data = yDocToPlainObject(ydoc)
    return Object.keys(data).length > 0 ? data as unknown as AutoChessSeasonData : null
  }, [])

  /**
   * Push a local edit to Y.Doc (which broadcasts to other clients).
   * Called by App.tsx after updateSeason modifies the React state.
   *
   * For dict fields (plain objects), uses nested YMaps so only changed
   * records are sent over the wire instead of the entire dict.
   */
  const pushLocalEdit = useCallback((data: AutoChessSeasonData) => {
    const ydoc = docRef.current
    if (!ydoc) return

    const yMap = ydoc.getMap('season')
    ydoc.transact(() => {
      for (const [key, value] of Object.entries(data)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          // Dict field → use nested YMap for incremental sync
          const dict = value as Record<string, unknown>
          let nested = yMap.get(key)

          // Migrate from old string format or create new nested YMap
          if (!(nested instanceof Y.Map)) {
            nested = new Y.Map<string>()
            yMap.set(key, nested)
          }
          const nestedMap = nested as Y.Map<string>

          // Update changed entries
          const newKeys = new Set(Object.keys(dict))
          for (const [subKey, subValue] of Object.entries(dict)) {
            const newJson = JSON.stringify(subValue)
            if (nestedMap.get(subKey) !== newJson) {
              nestedMap.set(subKey, newJson)
            }
          }

          // Remove deleted entries
          nestedMap.forEach((_: unknown, subKey: string) => {
            if (!newKeys.has(subKey)) {
              nestedMap.delete(subKey)
            }
          })
        } else {
          // Array or primitive → store as JSON string
          const newJson = JSON.stringify(value)
          if (yMap.get(key) !== newJson) {
            yMap.set(key, newJson)
          }
        }
      }
    })
  }, [])

  return {
    doc,
    connected,
    synced,
    users,
    reconnectFailed,
    manualReconnect,
    updatePresence,
    getSeasonData,
    pushLocalEdit,
    setOnRemoteUpdate,
    setOnSeasonDeleted,
  }
}

function yDocToPlainObject(doc: Y.Doc): Record<string, unknown> {
  const yMap = doc.getMap('season')
  if (yMap.size === 0) return {}

  const result: Record<string, unknown> = {}
  yMap.forEach((val, key) => {
    if (val instanceof Y.Map) {
      // Nested YMap → reconstruct dict
      const dict: Record<string, unknown> = {}
      val.forEach((subVal: unknown, subKey: string) => {
        if (typeof subVal === 'string') {
          try {
            dict[subKey] = JSON.parse(subVal)
          } catch {
            dict[subKey] = subVal
          }
        } else {
          dict[subKey] = subVal
        }
      })
      result[key] = dict
    } else if (typeof val === 'string') {
      try {
        result[key] = JSON.parse(val)
      } catch {
        result[key] = val
      }
    } else {
      result[key] = val
    }
  })
  return result
}

export type CollabStore = ReturnType<typeof useCollabStore>
