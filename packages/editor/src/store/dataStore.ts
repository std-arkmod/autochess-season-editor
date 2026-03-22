import { useState, useCallback, useEffect, useRef } from 'react'
import type { AutoChessSeasonData } from '@autochess-editor/shared'
import { normalizeSeasonDataForRuntime, deepSortValue } from '@autochess-editor/shared'
import { api, type SeasonSummaryWithAccess, type TemplateSummary } from '../api/client'

export interface SeasonSlot {
  id: string
  label: string
  data: AutoChessSeasonData
  isDirty: boolean
  version: number
  /** Last data successfully saved to server (for computing patch) */
  lastSavedData?: AutoChessSeasonData
  /** Web FS API 目录句柄（页面刷新后丢失，需重新授权） */
  fsHandle?: FileSystemDirectoryHandle
  /** 最后一次由我们自己写入目录的时间戳（ms）——供外部变更检测对比 */
  fsSavedAt?: number
  /** FS 同步状态 */
  fsSyncStatus?: 'synced' | 'saving' | 'unsaved'
  fsHandleName?: string
  /** Whether this season is read-only for the current user */
  readOnly?: boolean
  /** Whether the current user is the owner of this season */
  isOwner?: boolean
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
  | 'admin'

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

export function useDataStore() {
  const [seasons, setSeasons] = useState<SeasonSlot[]>([])
  const [serverSeasons, setServerSeasons] = useState<SeasonSummaryWithAccess[]>([])
  const [serverTemplates, setServerTemplates] = useState<TemplateSummary[]>([])
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null)
  const [activeModule, setActiveModule] = useState<ActiveModule>('overview')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [tabHistories, setTabHistories] = useState<Record<string, TabHistory>>({})
  const [loading, setLoading] = useState(false)

  const activeSeason = seasons.find(s => s.id === activeSeasonId) ?? null

  const currentTabHistory: TabHistory = activeSeasonId
    ? (tabHistories[activeSeasonId] ?? { stack: [], cursor: -1 })
    : { stack: [], cursor: -1 }

  const canGoBack = currentTabHistory.cursor > 0
  const canGoForward = currentTabHistory.cursor < currentTabHistory.stack.length - 1

  // Load season list from server
  const refreshSeasonList = useCallback(async () => {
    try {
      const res = await api.listSeasons()
      setServerSeasons(res.seasons)
    } catch (err) {
      console.error('Failed to load season list:', err)
    }
  }, [])

  // Load template list from server
  const refreshTemplateList = useCallback(async () => {
    try {
      const res = await api.listTemplates()
      setServerTemplates(res.templates)
    } catch (err) {
      console.error('Failed to load template list:', err)
    }
  }, [])

  // Load a specific season from server
  const loadSeason = useCallback(async (id: string, readOnly = false, isOwner = true) => {
    // Check if already loaded
    const existing = seasons.find(s => s.id === id)
    if (existing) {
      setActiveSeasonId(id)
      return
    }

    setLoading(true)
    try {
      const res = await api.getSeason(id)
      const season = res.season
      const normalized = normalizeSeasonDataForRuntime(season.data as AutoChessSeasonData)
      const slot: SeasonSlot = {
        id: season.id,
        label: season.label,
        data: normalized,
        isDirty: false,
        version: season.version,
        lastSavedData: normalized,
        readOnly,
        isOwner,
      }
      setSeasons(prev => [...prev, slot])
      setActiveSeasonId(id)
    } catch (err) {
      console.error('Failed to load season:', err)
    } finally {
      setLoading(false)
    }
  }, [seasons])

  // Fork a template into a new private season
  const forkTemplate = useCallback(async (templateId: string, label?: string) => {
    setLoading(true)
    try {
      const res = await api.forkTemplate(templateId, label)
      const seasonRes = await api.getSeason(res.season.id)
      const season = seasonRes.season
      const normalized = normalizeSeasonDataForRuntime(season.data as AutoChessSeasonData)
      const slot: SeasonSlot = {
        id: season.id,
        label: season.label,
        data: normalized,
        isDirty: false,
        version: season.version,
        lastSavedData: normalized,
        isOwner: true,
      }
      setSeasons(prev => [...prev, slot])
      setActiveSeasonId(season.id)
      refreshSeasonList()
      return season.id
    } catch (err) {
      console.error('Failed to fork template:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [refreshSeasonList])

  // Unload a season from local state (not delete from server)
  const unloadSeason = useCallback((id: string) => {
    setSeasons(prev => prev.filter(s => s.id !== id))
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

  // ---- Actions ----

  const addSeason = useCallback(async (label: string, data: AutoChessSeasonData) => {
    try {
      const res = await api.createSeason(label, data)
      const slot: SeasonSlot = {
        id: res.season.id,
        label,
        data: normalizeSeasonDataForRuntime(data),
        isDirty: false,
        version: res.season.version,
        isOwner: true,
      }
      setSeasons(prev => [...prev, slot])
      setActiveSeasonId(res.season.id)
      refreshSeasonList()
      return res.season.id
    } catch (err) {
      console.error('Failed to create season:', err)
      throw err
    }
  }, [refreshSeasonList])

  const updateSeason = useCallback((id: string, updater: (data: AutoChessSeasonData) => AutoChessSeasonData) => {
    setSeasons(prev =>
      prev.map(s => s.id === id ? { ...s, data: updater(s.data), isDirty: true } : s)
    )
  }, [])

  // Save current season data to server (uses patch)
  const saveSeasonToServer = useCallback(async (id: string) => {
    const season = seasons.find(s => s.id === id)
    if (!season || season.readOnly) return

    try {
      const patch: Record<string, unknown> = {}
      const base = (season.lastSavedData ?? {}) as unknown as Record<string, unknown>
      for (const key of Object.keys(season.data)) {
        const newVal = (season.data as unknown as Record<string, unknown>)[key]
        const oldVal = base[key]
        if (JSON.stringify(deepSortValue(newVal)) !== JSON.stringify(deepSortValue(oldVal))) {
          patch[key] = newVal
        }
      }
      const res = await api.updateSeason(id, {
        dataPatch: Object.keys(patch).length > 0 ? patch : undefined,
        label: season.label,
        version: season.version,
      })
      setSeasons(prev =>
        prev.map(s => s.id === id ? { ...s, isDirty: false, version: (res.season as { version: number }).version, lastSavedData: s.data } : s)
      )
    } catch (err) {
      console.error('Failed to save season:', err)
      throw err
    }
  }, [seasons])

  // Auto-save to server when dirty (debounced)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const dirty = seasons.filter(s => s.isDirty && !s.readOnly)
    if (dirty.length === 0) return

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      for (const s of dirty) {
        // Compute patch: only send top-level fields that changed
        const patch: Record<string, unknown> = {}
        const base = (s.lastSavedData ?? {}) as unknown as Record<string, unknown>
        for (const key of Object.keys(s.data)) {
          const newVal = (s.data as unknown as Record<string, unknown>)[key]
          const oldVal = base[key]
          if (JSON.stringify(deepSortValue(newVal)) !== JSON.stringify(deepSortValue(oldVal))) {
            patch[key] = newVal
          }
        }

        const hasDataChanges = Object.keys(patch).length > 0
        api.updateSeason(s.id, {
          dataPatch: hasDataChanges ? patch : undefined,
          label: s.label,
          version: s.version,
        })
          .then(res => {
            setSeasons(prev =>
              prev.map(p => p.id === s.id ? { ...p, isDirty: false, version: (res.season as { version: number }).version, lastSavedData: p.data } : p)
            )
            // Create snapshot after successful save (server deduplicates by hash)
            api.createSnapshot(s.id).catch(() => {})
          })
          .catch(err => console.error('Auto-save failed:', err))
      }
    }, 2000)

    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [seasons])

  const removeSeason = useCallback(async (id: string) => {
    try {
      await api.deleteSeason(id)
    } catch (err) {
      console.error('Failed to delete season:', err)
    }
    setSeasons(prev => prev.filter(s => s.id !== id))
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
    refreshSeasonList()
  }, [seasons, refreshSeasonList])

  const renameSeason = useCallback((id: string, label: string) => {
    setSeasons(prev => prev.map(s => s.id === id ? { ...s, label, isDirty: true } : s))
  }, [])

  const markClean = useCallback((id: string) => {
    setSeasons(prev => prev.map(s => s.id === id ? { ...s, isDirty: false } : s))
  }, [])

  /** 设置 FS 目录句柄 */
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

  const setSeasonFsState = useCallback((id: string, savedAt: number, status: SeasonSlot['fsSyncStatus']) => {
    setSeasons(prev => prev.map(s => s.id === id
      ? { ...s, fsSavedAt: savedAt, fsSyncStatus: status, isDirty: status === 'synced' ? false : s.isDirty }
      : s
    ))
  }, [])

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

  // Set season data directly (used by collab store for Yjs sync)
  const setSeasonData = useCallback((id: string, data: AutoChessSeasonData) => {
    setSeasons(prev =>
      prev.map(s => s.id === id ? { ...s, data } : s)
    )
  }, [])

  return {
    seasons,
    serverSeasons,
    serverTemplates,
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
    // Server-related
    loading,
    refreshSeasonList,
    refreshTemplateList,
    loadSeason,
    unloadSeason,
    saveSeasonToServer,
    setSeasonData,
    forkTemplate,
  }
}

export type DataStore = ReturnType<typeof useDataStore>
