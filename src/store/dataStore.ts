import { useState, useCallback, useEffect, useRef } from 'react'
import type { AutoChessSeasonData } from '../autochess-season-data'

export interface SeasonSlot {
  id: string
  label: string
  data: AutoChessSeasonData
  isDirty: boolean
  /** Web FS API 目录句柄（页面刷新后丢失，需重新授权） */
  fsHandle?: FileSystemDirectoryHandle
  /** 最后一次由我们自己写入目录的时间戳（ms）——供外部变更检测对比 */
  fsSavedAt?: number
  /** FS 同步状态 */
  fsSyncStatus?: 'synced' | 'saving' | 'unsaved'
  /**
   * 刷新后需要重新授权的目录名（持久化到 localStorage，提示用户重新绑定）
   * 仅存名字，不存句柄（句柄不可序列化）
   */
  fsHandleName?: string
}

export type ActiveModule =
  | 'overview'
  | 'modes'
  | 'bonds'
  | 'chess'
  | 'traps'
  | 'shop'
  | 'boss'
  | 'effects'
  | 'garrison'
  | 'rewards'
  | 'misc'
  | 'diff'

/** 历史条目 */
export interface NavEntry {
  module: ActiveModule
  focusId: string | null
  label?: string
}

interface TabHistory {
  stack: NavEntry[]
  cursor: number
}

const MAX_HISTORY = 50

const LS_KEY = 'autochess_editor_seasons'
const LS_ACTIVE_KEY = 'autochess_editor_active'

function loadFromStorage(): SeasonSlot[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SeasonSlot[]
  } catch {
    return []
  }
}

function saveToStorage(seasons: SeasonSlot[]) {
  try {
    // fsHandle 不可序列化，不存；其余字段都存
    const toSave = seasons.map(({ fsHandle, ...rest }) => rest)
    localStorage.setItem(LS_KEY, JSON.stringify(toSave))
  } catch (e) {
    console.warn('localStorage save failed:', e)
  }
}

export function useDataStore() {
  const [seasons, setSeasons] = useState<SeasonSlot[]>(() => loadFromStorage())
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(() => {
    const stored = localStorage.getItem(LS_ACTIVE_KEY)
    const loaded = loadFromStorage()
    if (stored && loaded.some(s => s.id === stored)) return stored
    return loaded.length > 0 ? loaded[0].id : null
  })
  const [activeModule, setActiveModule] = useState<ActiveModule>('overview')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [tabHistories, setTabHistories] = useState<Record<string, TabHistory>>({})

  // 防抖保存到 localStorage（仅在 seasons 变化时）
  const lsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (lsTimer.current) clearTimeout(lsTimer.current)
    lsTimer.current = setTimeout(() => saveToStorage(seasons), 800)
    return () => { if (lsTimer.current) clearTimeout(lsTimer.current) }
  }, [seasons])

  useEffect(() => {
    if (activeSeasonId) localStorage.setItem(LS_ACTIVE_KEY, activeSeasonId)
    else localStorage.removeItem(LS_ACTIVE_KEY)
  }, [activeSeasonId])

  const activeSeason = seasons.find(s => s.id === activeSeasonId) ?? null

  const currentTabHistory: TabHistory = activeSeasonId
    ? (tabHistories[activeSeasonId] ?? { stack: [], cursor: -1 })
    : { stack: [], cursor: -1 }

  const canGoBack = currentTabHistory.cursor > 0
  const canGoForward = currentTabHistory.cursor < currentTabHistory.stack.length - 1

  // ---- Actions ----

  const addSeason = useCallback((label: string, data: AutoChessSeasonData) => {
    const id = `season_${Date.now()}`
    setSeasons(prev => [...prev, { id, label, data, isDirty: false }])
    setActiveSeasonId(id)
    return id
  }, [])

  const updateSeason = useCallback((id: string, updater: (data: AutoChessSeasonData) => AutoChessSeasonData) => {
    setSeasons(prev =>
      prev.map(s => s.id === id ? { ...s, data: updater(s.data), isDirty: true } : s)
    )
  }, [])

  const removeSeason = useCallback((id: string) => {
    setSeasons(prev => {
      const next = prev.filter(s => s.id !== id)
      saveToStorage(next)
      return next
    })
    setTabHistories(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setActiveSeasonId(prev => {
      if (prev !== id) return prev
      const remaining = seasons.filter(s => s.id !== id)
      return remaining.length > 0 ? remaining[0].id : null
    })
  }, [seasons])

  const renameSeason = useCallback((id: string, label: string) => {
    setSeasons(prev => prev.map(s => s.id === id ? { ...s, label } : s))
  }, [])

  const markClean = useCallback((id: string) => {
    setSeasons(prev => prev.map(s => s.id === id ? { ...s, isDirty: false } : s))
  }, [])

  /** 设置 FS 目录句柄。handle=undefined 表示断开。同步更新 fsHandleName 供刷新后提示。 */
  const setSeasonFsHandle = useCallback((id: string, handle: FileSystemDirectoryHandle | undefined) => {
    setSeasons(prev => prev.map(s => s.id === id
      ? {
          ...s,
          fsHandle: handle,
          fsHandleName: handle ? handle.name : undefined,
          fsSyncStatus: handle ? s.fsSyncStatus : undefined,
        }
      : s
    ))
  }, [])

  /** 更新 FS 状态（savedAt + status），不改变其他字段 */
  const setSeasonFsState = useCallback((id: string, savedAt: number, status: SeasonSlot['fsSyncStatus']) => {
    setSeasons(prev => prev.map(s => s.id === id
      ? { ...s, fsSavedAt: savedAt, fsSyncStatus: status, isDirty: status === 'synced' ? false : s.isDirty }
      : s
    ))
  }, [])

  /** 仅更新 fsSyncStatus（不改 savedAt） */
  const setSeasonFsSyncStatus = useCallback((id: string, status: SeasonSlot['fsSyncStatus']) => {
    setSeasons(prev => prev.map(s => s.id === id ? { ...s, fsSyncStatus: status } : s))
  }, [])

  const navigateTo = useCallback((module: ActiveModule, id?: string, label?: string) => {
    setActiveModule(module)
    setFocusId(id ?? null)
    setActiveSeasonId(seasonId => {
      if (seasonId) {
        setTabHistories(histories => {
          const current = histories[seasonId] ?? { stack: [], cursor: -1 }
          const newStack = current.stack.slice(0, current.cursor + 1)
          const entry: NavEntry = { module, focusId: id ?? null, label }
          const last = newStack[newStack.length - 1]
          if (last && last.module === module && last.focusId === (id ?? null)) return histories
          newStack.push(entry)
          if (newStack.length > MAX_HISTORY) newStack.splice(0, newStack.length - MAX_HISTORY)
          return { ...histories, [seasonId]: { stack: newStack, cursor: newStack.length - 1 } }
        })
      }
      return seasonId
    })
  }, [])

  const historyBack = useCallback(() => {
    setActiveSeasonId(seasonId => {
      if (!seasonId) return seasonId
      setTabHistories(histories => {
        const current = histories[seasonId] ?? { stack: [], cursor: -1 }
        if (current.cursor <= 0) return histories
        const newCursor = current.cursor - 1
        const entry = current.stack[newCursor]
        setActiveModule(entry.module)
        setFocusId(entry.focusId)
        return { ...histories, [seasonId]: { ...current, cursor: newCursor } }
      })
      return seasonId
    })
  }, [])

  const historyForward = useCallback(() => {
    setActiveSeasonId(seasonId => {
      if (!seasonId) return seasonId
      setTabHistories(histories => {
        const current = histories[seasonId] ?? { stack: [], cursor: -1 }
        if (current.cursor >= current.stack.length - 1) return histories
        const newCursor = current.cursor + 1
        const entry = current.stack[newCursor]
        setActiveModule(entry.module)
        setFocusId(entry.focusId)
        return { ...histories, [seasonId]: { ...current, cursor: newCursor } }
      })
      return seasonId
    })
  }, [])

  const historyJumpTo = useCallback((index: number) => {
    setActiveSeasonId(seasonId => {
      if (!seasonId) return seasonId
      setTabHistories(histories => {
        const current = histories[seasonId] ?? { stack: [], cursor: -1 }
        if (index < 0 || index >= current.stack.length) return histories
        const entry = current.stack[index]
        setActiveModule(entry.module)
        setFocusId(entry.focusId)
        return { ...histories, [seasonId]: { ...current, cursor: index } }
      })
      return seasonId
    })
  }, [])

  return {
    seasons,
    activeSeason,
    activeSeasonId,
    setActiveSeasonId,
    activeModule,
    setActiveModule,
    focusId,
    setFocusId,
    navigateTo,
    addSeason,
    updateSeason,
    removeSeason,
    renameSeason,
    markClean,
    setSeasonFsHandle,
    setSeasonFsState,
    setSeasonFsSyncStatus,
    tabHistories,
    currentTabHistory,
    canGoBack,
    canGoForward,
    historyBack,
    historyForward,
    historyJumpTo,
  }
}

export type DataStore = ReturnType<typeof useDataStore>
