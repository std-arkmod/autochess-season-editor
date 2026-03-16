import { useState, useCallback, useEffect, useRef } from 'react'
import type { AutoChessSeasonData } from '../autochess-season-data'

export interface SeasonSlot {
  id: string
  label: string
  data: AutoChessSeasonData
  isDirty: boolean
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
  | 'diff'

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
    localStorage.setItem(LS_KEY, JSON.stringify(seasons))
  } catch (e) {
    // localStorage 满了就算了
    console.warn('localStorage save failed:', e)
  }
}

export function useDataStore() {
  const [seasons, setSeasons] = useState<SeasonSlot[]>(() => loadFromStorage())
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(() => {
    const stored = localStorage.getItem(LS_ACTIVE_KEY)
    const loaded = loadFromStorage()
    // 确保存储的 activeId 仍然存在
    if (stored && loaded.some(s => s.id === stored)) return stored
    return loaded.length > 0 ? loaded[0].id : null
  })
  const [activeModule, setActiveModule] = useState<ActiveModule>('overview')
  const [focusId, setFocusId] = useState<string | null>(null)

  // 防抖保存到 localStorage
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveToStorage(seasons)
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [seasons])

  useEffect(() => {
    if (activeSeasonId) localStorage.setItem(LS_ACTIVE_KEY, activeSeasonId)
    else localStorage.removeItem(LS_ACTIVE_KEY)
  }, [activeSeasonId])

  const activeSeason = seasons.find(s => s.id === activeSeasonId) ?? null

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

  const navigateTo = useCallback((module: ActiveModule, id?: string) => {
    setActiveModule(module)
    setFocusId(id ?? null)
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
  }
}

export type DataStore = ReturnType<typeof useDataStore>
