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

export function useCollabStore(seasonId: string | null, token: string | null) {
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [connected, setConnected] = useState(false)
  const [synced, setSynced] = useState(false)
  const [users, setUsers] = useState<CollabUser[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const docRef = useRef<Y.Doc | null>(null)
  const onRemoteUpdateRef = useRef<OnRemoteUpdate | null>(null)
  const onSeasonDeletedRef = useRef<OnSeasonDeleted | null>(null)

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

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsHost = window.location.host
    const ws = new WebSocket(`${wsProtocol}//${wsHost}/yjs/${seasonId}?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

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
            // Remote update from another client — mark origin as 'remote'
            const update = base64ToUint8Array(message.update as string)
            Y.applyUpdate(ydoc, update, 'remote')
            // Notify App.tsx about the remote change
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
            setUsers(prev => [...prev, {
              userId: message.userId as string,
              displayName: message.displayName as string,
            }])
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

    // Send local Y.Doc changes to server (only local origin, not remote echoes)
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'update',
          update: uint8ArrayToBase64(update),
        }))
      }
    }
    ydoc.on('update', updateHandler)

    return () => {
      ydoc.off('update', updateHandler)
      ws.close()
      ydoc.destroy()
      wsRef.current = null
      docRef.current = null
      setDoc(null)
      setConnected(false)
      setSynced(false)
      setUsers([])
    }
  }, [seasonId, token])

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
   */
  const pushLocalEdit = useCallback((data: AutoChessSeasonData) => {
    const ydoc = docRef.current
    if (!ydoc) return

    const yMap = ydoc.getMap('season')
    ydoc.transact(() => {
      for (const [key, value] of Object.entries(data)) {
        const newJson = JSON.stringify(value)
        const oldJson = yMap.get(key)
        if (oldJson !== newJson) {
          yMap.set(key, newJson)
        }
      }
    })
    // The 'update' event fires → updateHandler sends to server
    // Origin is not 'remote' so it will be broadcast
  }, [])

  return {
    doc,
    connected,
    synced,
    users,
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
    if (typeof val === 'string') {
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
