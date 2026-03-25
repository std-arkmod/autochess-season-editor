import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Box, Text, Stack, Progress, SegmentedControl, Loader } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import type { Node, Edge } from '@xyflow/react'
import type { BuffTemplate } from '@autochess-editor/shared'
import type { DataStore } from '../../store/dataStore'
import { treeToGraph, graphToTree, type FlowNodeData } from './buff-editor/graphConversion'
import { autoLayout } from './buff-editor/layoutEngine'
import { getSchema, buildDefaultNode, loadGameData, normalizeType, type NodeSchema } from './buff-editor/nodeSchema'
import { BuffNodeCanvas, type EdgeStyle, type ReactFlowApi } from './buff-editor/BuffNodeCanvas'
import type { MouseTool } from './buff-editor/mouseTools'
import { BuffTemplateList } from './buff-editor/BuffTemplateList'
import { BuffNodePalette } from './buff-editor/BuffNodePalette'
import { BuffReferencePanel } from './buff-editor/BuffReferencePanel'
import { BuffEditorContext, type BuffEditorContextValue } from './buff-editor/BuffEditorContext'
import { BuffEditorToolbar } from './buff-editor/BuffEditorToolbar'
import { CanvasContextMenu } from './buff-editor/CanvasContextMenu'
import { NodeSearchMenu } from './buff-editor/NodeSearchMenu'
import { useCanvasCommands, type ContextMenuType } from './buff-editor/useCanvasCommands'
import { buildBuffIndex, type BuffReferenceIndex } from './buff-editor/buffReferenceIndex'
import { mergeUserTemplateKeys } from './buff-editor/enumRegistry'
import { eventLabels } from './buff-editor/buffEditorI18n'

interface Props {
  store: DataStore
}

const ALL_EVENTS = [
  'ON_ABILITY_CAST_ON_TARGET', 'ON_ABILITY_FINISH', 'ON_ABILITY_INTERRUPTED',
  'ON_ABILITY_SPELL_ON', 'ON_ABILITY_START', 'ON_ABNORMAL_FLAG_DIRTY',
  'ON_AFTER_ATTACK', 'ON_AFTER_CALCULATE_DAMAGE', 'ON_AFTER_OUTPUT_DAMAGE',
  'ON_AFTER_OUTPUT_ELEMENT_DAMAGE', 'ON_AFTER_OUTPUT_HEAL',
  'ON_APPLIED_MODIFIER', 'ON_APPLYING_MODIFIER', 'ON_APPLYING_SKIPPED_MODIFIER',
  'ON_AUTO_CHESS_MODE_CHANGED',
  'ON_BEFORE_ABILITY_SPELL_ON', 'ON_BEFORE_APPEAR', 'ON_BEFORE_APPLYING_MODIFIER',
  'ON_BEFORE_ATTACK', 'ON_BEFORE_DIRECTION_CHANGE', 'ON_BEFORE_DISAPPEAR',
  'ON_BEFORE_EP_BREAK_FINISH', 'ON_BEFORE_EP_BREAK_START',
  'ON_BEFORE_EXIT_LEVITATE_STATE', 'ON_BEFORE_EXIT_UNBALANCED_STATE',
  'ON_BEFORE_FALLDOWN', 'ON_BEFORE_TARGET_APPLY_MODIFIER',
  'ON_BEFORE_TRY_SET_EP_ZERO', 'ON_BEFORE_TRY_SET_HP_ZERO',
  'ON_BEING_CALCULATE_DAMAGE', 'ON_BLOCK_DAMAGE', 'ON_BOSS_WAVE_WILL_START',
  'ON_BUFF_DISABLE', 'ON_BUFF_ENABLE', 'ON_BUFF_FINISH',
  'ON_BUFF_LATE_ENABLE', 'ON_BUFF_START', 'ON_BUFF_TRIGGER',
  'ON_CALCULATE_CACHED_PROJECTILE_DAMAGE', 'ON_CALCULATE_DAMAGE',
  'ON_COLLIDE_WITH_HIGHLAND', 'ON_DIRECTION_CHANGED',
  'ON_END_PULLING', 'ON_ENTER_LEVITATE_STATE', 'ON_ENTER_MAGICCIRCUIT',
  'ON_ENTER_UNBALANCED_STATE', 'ON_ENTITY_WILL_OVERLAP',
  'ON_EP_BREAK_FINISH', 'ON_EP_BREAK_START', 'ON_ES_OVER_ZERO',
  'ON_EVADE_DAMAGE', 'ON_GAME_OVER',
  'ON_HALF_IDLE_KAWA_CLEANED', 'ON_HALF_IDLE_KAWA_POLLUTED',
  'ON_HALF_IDLE_TRAP_CHECK_UPGRADE', 'ON_LEAVE_MAGICCIRCUIT',
  'ON_LEGION_MODE_DANGER_LEVEL_REFRESH', 'ON_LEGION_MODE_DRAW_CARD',
  'ON_MAKE_ENEMY_UNBALANCED', 'ON_MOTION_MODE_CHANGED',
  'ON_OTHER_BUFF_START', 'ON_OTHER_RESISTABLE_BUFF_START',
  'ON_OUTPUT_ATK_OR_HEAL', 'ON_OUTPUT_ATK_OR_HEAL_EACH_SPELL',
  'ON_OUTPUT_DAMAGE', 'ON_OUTPUT_MODIFIER',
  'ON_OWNER_BEFORE_DEAD', 'ON_OWNER_BLOCKEE_CHANGED',
  'ON_OWNER_BLOCK_MODE_CHANGED', 'ON_OWNER_BORN', 'ON_OWNER_DYING',
  'ON_OWNER_FINISH', 'ON_OWNER_HP_FULL', 'ON_OWNER_KILLED',
  'ON_OWNER_KILLED_BY_MAIN_TARGET', 'ON_OWNER_LOCATE',
  'ON_OWNER_OVERLAPPED', 'ON_OWNER_POST_BORN', 'ON_OWNER_REACH_EXIT',
  'ON_OWNER_ROOT_TILE_CHANGED', 'ON_PALSY_OVERFLOW',
  'ON_POST_TRY_SET_HP_ZERO', 'ON_SANDBOX_OWNER_RES_CHANGED',
  'ON_SKILL_CAST_SUCCEED', 'ON_SKILL_FINISH', 'ON_SKILL_RETRIGGERED',
  'ON_SKILL_START', 'ON_STAGE_END',
  'ON_TAKE_DAMAGE', 'ON_TAKE_EP_DAMAGE', 'ON_TARGET_KILLED',
  'ON_TOGGLE_SKILL_START', 'ON_TRIGGER_PALSY', 'ON_UNIT_SWITCH_MODE',
]

function buildEventOptions(mode: 'cn' | 'raw' | 'rawOnly') {
  const groups = new Map<string, string[]>()
  for (const e of ALL_EVENTS) {
    const parts = e.split('_')
    const prefix = parts.length >= 3 ? parts.slice(0, 3).join('_') : parts.slice(0, 2).join('_')
    const list = groups.get(prefix) ?? []
    list.push(e)
    groups.set(prefix, list)
  }
  return Array.from(groups.entries()).map(([group, items]) => ({
    group,
    items: items.map(e => {
      const cn = eventLabels[e]
      const label = mode === 'cn' && cn ? cn : e
      return { value: e, label }
    }),
  }))
}

const MAX_UNDO = 30
const CLIPBOARD_MARKER = 'buff-editor-clipboard'
interface Snapshot { nodes: Node[]; edges: Edge[] }

// Module-level cache so data survives component remounts (tab switching)
let _cachedRefTemplates: Record<string, BuffTemplate> | null = null
let _cachedRefIndex: BuffReferenceIndex | null = null
let _loadingPromise: Promise<unknown> | null = null

export function BuffTemplateEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const data = activeSeason?.data
  const buffTemplates: Record<string, BuffTemplate> = (data as any)?.buffTemplates ?? {}

  // Keep enum registry in sync with user's template keys
  const userTemplateKeys = useMemo(() => Object.keys(buffTemplates), [buffTemplates])
  useEffect(() => { mergeUserTemplateKeys(userTemplateKeys) }, [userTemplateKeys])

  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [listMode, setListMode] = useState<'user' | 'ref'>('user')
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [edgeStyle, setEdgeStyle] = useState<EdgeStyle>('default')
  const [isReadOnly, setIsReadOnly] = useState(false)

  const [rightPanel, setRightPanel] = useState<'palette' | 'references'>('palette')
  const [selectedNodeType, setSelectedNodeType] = useState<string | null>(null)
  const [labelMode, setLabelMode] = useState<'cn' | 'raw' | 'rawOnly'>('cn')

  // Mouse tool
  const [activeTool, setActiveTool] = useState<MouseTool>('select')

  // Selection tracking
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set())

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    type: ContextMenuType
    position: { x: number; y: number }
    targetId?: string
  } | null>(null)

  // Node search menu (right-click on pane / connection drop on empty)
  const [nodeSearchMenu, setNodeSearchMenu] = useState<{
    position: { x: number; y: number }
    flowPosition: { x: number; y: number }
    pendingConnection?: {
      nodeId: string
      handleId: string | null
      handleType: 'source' | 'target' | null
    }
  } | null>(null)

  // ReactFlow API ref + canvas container ref for viewport center
  const reactFlowApiRef = useRef<ReactFlowApi | null>(null)
  const canvasBoxRef = useRef<HTMLDivElement>(null)

  /** Get center of current viewport in flow coordinates */
  const getViewportCenter = useCallback(() => {
    const api = reactFlowApiRef.current
    const box = canvasBoxRef.current
    if (!api || !box) return { x: 300, y: 200 } // fallback
    const rect = box.getBoundingClientRect()
    return api.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }, [])

  const eventOptions = useMemo(() => buildEventOptions(labelMode), [labelMode])

  // Game data + schema loading
  const [refTemplates, setRefTemplates] = useState<Record<string, BuffTemplate> | null>(_cachedRefTemplates)
  const [refIndex, setRefIndex] = useState<BuffReferenceIndex | null>(_cachedRefIndex)
  const [loadingPhase, setLoadingPhase] = useState<string | null>(null)
  const [loadingPercent, setLoadingPercent] = useState(0)
  const [loadingDetail, setLoadingDetail] = useState('')

  // Auto-load game data on mount (skip if already cached)
  useEffect(() => {
    if (_cachedRefTemplates || _loadingPromise) {
      if (_loadingPromise) {
        _loadingPromise.then(t => {
          setRefTemplates(t as Record<string, BuffTemplate>)
          if (_cachedRefIndex) setRefIndex(_cachedRefIndex)
        })
      }
      return
    }

    _loadingPromise = loadGameData((p) => {
      setLoadingPhase(p.phase === 'done' ? null : p.phase)
      setLoadingPercent(p.percent)
      setLoadingDetail(p.detail ?? '')
    }).then(templates => {
      _cachedRefTemplates = templates as Record<string, BuffTemplate>
      setRefTemplates(_cachedRefTemplates)
      const idx = buildBuffIndex(_cachedRefTemplates)
      _cachedRefIndex = idx
      setRefIndex(idx)
      return _cachedRefTemplates
    }).catch(err => {
      console.error('Failed to load game data:', err)
      setLoadingPhase(null)
      _loadingPromise = null
      return null
    })
  }, [])

  // Refs for race-condition-free saving
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])


  // ── Undo / Redo ──
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const [undoLen, setUndoLen] = useState(0)
  const [redoLen, setRedoLen] = useState(0)

  const pushUndo = useCallback(() => {
    undoStack.current.push({
      nodes: nodesRef.current.map(n => ({ ...n, data: JSON.parse(JSON.stringify(n.data)) })),
      edges: edgesRef.current.map(e => ({ ...e })),
    })
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
    redoStack.current = []
    setUndoLen(undoStack.current.length)
    setRedoLen(0)
  }, [])

  const undo = useCallback(() => {
    const s = undoStack.current.pop()
    if (!s) return
    // Push current state to redo
    redoStack.current.push({
      nodes: nodesRef.current.map(n => ({ ...n, data: JSON.parse(JSON.stringify(n.data)) })),
      edges: edgesRef.current.map(e => ({ ...e })),
    })
    setNodes(s.nodes); setEdges(s.edges)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
  }, [])

  const redo = useCallback(() => {
    const s = redoStack.current.pop()
    if (!s) return
    // Push current state to undo
    undoStack.current.push({
      nodes: nodesRef.current.map(n => ({ ...n, data: JSON.parse(JSON.stringify(n.data)) })),
      edges: edgesRef.current.map(e => ({ ...e })),
    })
    setNodes(s.nodes); setEdges(s.edges)
    setUndoLen(undoStack.current.length)
    setRedoLen(redoStack.current.length)
  }, [])

  // ── Clipboard ──
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null)
  const pasteCountRef = useRef(0)
  const [hasClipboard, setHasClipboard] = useState(false)

  const copyNodes = useCallback(() => {
    const selNodes = nodesRef.current.filter(n => selectedNodeIds.has(n.id))
    if (selNodes.length === 0) return
    const selNodeIdSet = new Set(selNodes.map(n => n.id))
    const selEdges = edgesRef.current.filter(e => selNodeIdSet.has(e.source) && selNodeIdSet.has(e.target))
    clipboardRef.current = {
      nodes: selNodes.map(n => ({ ...n, data: { ...n.data } })),
      edges: selEdges.map(e => ({ ...e })),
    }
    pasteCountRef.current = 0
    setHasClipboard(true)
    // Write to system clipboard for cross-page paste
    navigator.clipboard.writeText(JSON.stringify({
      __type: CLIPBOARD_MARKER,
      nodes: clipboardRef.current.nodes,
      edges: clipboardRef.current.edges,
    })).catch(() => {})
  }, [selectedNodeIds])

  const pasteNodes = useCallback(async () => {
    if (isReadOnly) return
    // Try system clipboard first (enables cross-page paste)
    let clipData: { nodes: Node[]; edges: Edge[] } | null = null
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text)
      if (parsed?.__type === CLIPBOARD_MARKER && Array.isArray(parsed.nodes)) {
        clipData = { nodes: parsed.nodes, edges: parsed.edges ?? [] }
      }
    } catch {
      // System clipboard unavailable or doesn't contain our data
    }
    // Fall back to local ref
    if (!clipData) clipData = clipboardRef.current
    if (!clipData) return
    pushUndo()
    const { nodes: clipNodes, edges: clipEdges } = clipData
    const idMap = new Map<string, string>()
    const now = Date.now()
    pasteCountRef.current++
    const offset = 30 * pasteCountRef.current
    const newNodes = clipNodes.map((n, i) => {
      const newId = `paste_${now}_${i}`
      idMap.set(n.id, newId)
      return { ...n, id: newId, position: { x: n.position.x + offset, y: n.position.y + offset }, data: { ...n.data }, selected: true }
    })
    const newEdges = clipEdges
      .filter(e => idMap.has(e.source) && idMap.has(e.target))
      .map((e, i) => ({
        ...e,
        id: `paste_edge_${now}_${i}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }))
    // Deselect existing nodes
    setNodes(prev => [...prev.map(n => ({ ...n, selected: false })), ...newNodes])
    setEdges(prev => [...prev, ...newEdges])
    debouncedSave()
  }, [isReadOnly]) // debouncedSave and pushUndo are stable refs added below

  const cutNodes = useCallback(() => {
    if (isReadOnly) return
    copyNodes()
    // Delete selected
    pushUndo()
    setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)))
    setEdges(prev => prev.filter(e => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target) && !selectedEdgeIds.has(e.id)))
    debouncedSave()
  }, [isReadOnly, selectedNodeIds, selectedEdgeIds, copyNodes]) // pushUndo, debouncedSave stable

  const duplicateNodes = useCallback(() => {
    if (isReadOnly) return
    copyNodes()
    // Immediately paste
    if (!clipboardRef.current) return
    pushUndo()
    const { nodes: clipNodes, edges: clipEdges } = clipboardRef.current
    const idMap = new Map<string, string>()
    const now = Date.now()
    const newNodes = clipNodes.map((n, i) => {
      const newId = `dup_${now}_${i}`
      idMap.set(n.id, newId)
      return { ...n, id: newId, position: { x: n.position.x + 30, y: n.position.y + 30 }, data: { ...n.data }, selected: true }
    })
    const newEdges = clipEdges
      .filter(e => idMap.has(e.source) && idMap.has(e.target))
      .map((e, i) => ({
        ...e,
        id: `dup_edge_${now}_${i}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }))
    setNodes(prev => [...prev.map(n => ({ ...n, selected: false })), ...newNodes])
    setEdges(prev => [...prev, ...newEdges])
    debouncedSave()
  }, [isReadOnly, copyNodes]) // pushUndo, debouncedSave stable

  const deleteSelected = useCallback(() => {
    if (isReadOnly) return
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return
    pushUndo()
    setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)))
    setEdges(prev => prev.filter(e =>
      !selectedEdgeIds.has(e.id) &&
      !selectedNodeIds.has(e.source) &&
      !selectedNodeIds.has(e.target)
    ))
    debouncedSave()
  }, [isReadOnly, selectedNodeIds, selectedEdgeIds]) // pushUndo, debouncedSave stable

  const selectAll = useCallback(() => {
    setNodes(prev => prev.map(n => ({ ...n, selected: true })))
    setEdges(prev => prev.map(e => ({ ...e, selected: true })))
  }, [])

  const frameSelected = useCallback(() => {
    if (selectedNodeIds.size === 0 || !reactFlowApiRef.current) return
    const selectedNodes = nodesRef.current.filter(n => selectedNodeIds.has(n.id))
    if (selectedNodes.length === 0) return
    reactFlowApiRef.current.fitView({ padding: 0.3, nodes: selectedNodes.map(n => ({ id: n.id })) })
  }, [selectedNodeIds])

  const fitViewCmd = useCallback(() => {
    reactFlowApiRef.current?.fitView({ padding: 0.1 })
  }, [])

  const disconnectNode = useCallback(() => {
    if (isReadOnly || selectedNodeIds.size === 0) return
    pushUndo()
    setEdges(prev => prev.filter(e => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)))
    debouncedSave()
  }, [isReadOnly, selectedNodeIds]) // pushUndo, debouncedSave stable

  // ── Knife tool: cut edges ──
  const handleCutEdges = useCallback((edgeIds: string[]) => {
    if (isReadOnly || edgeIds.length === 0) return
    pushUndo()
    const toRemove = new Set(edgeIds)
    setEdges(prev => prev.filter(e => !toRemove.has(e.id)))
    debouncedSave()
  }, [isReadOnly]) // pushUndo, debouncedSave stable

  // ── Comment tool: create comment node ──
  const handleCreateComment = useCallback((position: { x: number; y: number }, size: { width: number; height: number }) => {
    if (isReadOnly) return
    pushUndo()
    setNodes(prev => [...prev, {
      id: `comment_${Date.now()}`,
      type: 'comment',
      position,
      style: { width: size.width, height: size.height, zIndex: -1 },
      data: { label: '', color: 'rgba(255, 255, 255, 0.06)' },
    }])
    setActiveTool('select') // auto-switch back to select after creating
    debouncedSave()
  }, [isReadOnly]) // pushUndo, debouncedSave stable

  // Save
  const updateTemplates = useCallback((t: Record<string, BuffTemplate>) => {
    if (!activeSeasonId) return
    updateSeason(activeSeasonId, prev => ({ ...prev, buffTemplates: t }))
  }, [activeSeasonId, updateSeason])

  const saveGraph = useCallback(() => {
    if (!activeKey || !activeSeasonId || isReadOnly) return
    const { eventToActions } = graphToTree(nodesRef.current, edgesRef.current)
    const existing = buffTemplates[activeKey]
    if (!existing) return
    updateTemplates({ ...buffTemplates, [activeKey]: { ...existing, eventToActions } })
  }, [activeKey, activeSeasonId, isReadOnly, buffTemplates, updateTemplates])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveGraphRef = useRef(saveGraph)
  useEffect(() => { saveGraphRef.current = saveGraph }, [saveGraph])

  const debouncedSave = useCallback(() => {
    if (isReadOnly) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveGraphRef.current(), 500)
  }, [isReadOnly])
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  const saveImmediate = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    saveGraph()
  }, [saveGraph])

  // Select template
  const selectTemplate = useCallback((key: string) => {
    if (!isReadOnly && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current); saveTimerRef.current = null; saveGraph()
    }
    const isFromUser = key in buffTemplates
    const template = buffTemplates[key] ?? refTemplates?.[key]
    if (!template) return
    setActiveKey(key)
    setIsReadOnly(!isFromUser || !activeSeason)
    const { nodes: n, edges: e } = treeToGraph(template)
    setNodes(autoLayout(n, e))
    setEdges(e)
    undoStack.current = []
    redoStack.current = []
    setUndoLen(0)
    setRedoLen(0)
    setSelectedNodeIds(new Set())
    setSelectedEdgeIds(new Set())
    // fitView after React renders the new nodes
    requestAnimationFrame(() => {
      reactFlowApiRef.current?.fitView({ padding: 0.1 })
    })
  }, [buffTemplates, refTemplates, isReadOnly, activeSeason, saveGraph])

  const createTemplate = useCallback((key: string) => {
    updateTemplates({ ...buffTemplates, [key]: { templateKey: key, effectKey: '', onEventPriority: 'DEFAULT', eventToActions: {} } })
    setListMode('user'); setActiveKey(key); setIsReadOnly(false); setNodes([]); setEdges([])
    undoStack.current = []; redoStack.current = []
    setUndoLen(0); setRedoLen(0)
  }, [buffTemplates, updateTemplates])

  const deleteTemplate = useCallback((key: string) => {
    if (listMode === 'ref') return
    const { [key]: _, ...rest } = buffTemplates
    updateTemplates(rest)
    if (activeKey === key) { setActiveKey(null); setNodes([]); setEdges([]) }
  }, [buffTemplates, activeKey, listMode, updateTemplates])

  const duplicateTemplate = useCallback((sourceKey: string, newKey: string) => {
    const source = listMode === 'ref' ? refTemplates : buffTemplates
    const src = source?.[sourceKey]
    if (!src) return
    const copy: BuffTemplate = JSON.parse(JSON.stringify(src))
    copy.templateKey = newKey
    updateTemplates({ ...buffTemplates, [newKey]: copy })
  }, [buffTemplates, refTemplates, listMode, updateTemplates])

  const pendingCenterRef = useRef<{ id: string; x: number; y: number } | null>(null)

  // Center newly dropped node once ReactFlow measures it
  useEffect(() => {
    const pending = pendingCenterRef.current
    if (!pending) return
    const node = nodes.find(n => n.id === pending.id)
    if (!node?.measured?.width) return
    pendingCenterRef.current = null
    const w = node.measured.width
    setNodes(prev => prev.map(n =>
      n.id === pending.id
        ? { ...n, position: { x: pending.x - w / 2, y: pending.y } }
        : n,
    ))
  }, [nodes])

  // Reactive multi-condition slot management: compact empty gaps, re-index edges, keep one trailing empty.
  // Runs as an effect so it catches ALL edge change paths (connect, delete, cut, reconnect, node search, etc.)
  useEffect(() => {
    if (isReadOnly) return
    // Find multi-condition nodes
    const multiCondNodeIds = new Set<string>()
    for (const n of nodes) {
      const d = n.data as any
      if (getSchema(d?.nodeType ?? '').hasMultiCondition) multiCondNodeIds.add(n.id)
    }
    if (multiCondNodeIds.size === 0) return

    // Collect connected condition indices per node
    const connectedByNode = new Map<string, Set<number>>()
    for (const edge of edges) {
      const h = edge.targetHandle
      if (h?.startsWith('condition_') && multiCondNodeIds.has(edge.target)) {
        const idx = parseInt(h.replace('condition_', ''))
        let set = connectedByNode.get(edge.target)
        if (!set) { set = new Set(); connectedByNode.set(edge.target, set) }
        set.add(idx)
      }
    }

    // Build compaction per node
    const remapByNode = new Map<string, Map<number, number>>()
    const newArrByNode = new Map<string, unknown[]>()
    for (const nodeId of multiCondNodeIds) {
      const node = nodes.find(n => n.id === nodeId)
      if (!node) continue
      const d = node.data as any
      const arr: unknown[] = Array.isArray(d.actionNode?._conditionsNode) ? d.actionNode._conditionsNode : []
      const connected = connectedByNode.get(nodeId) ?? new Set<number>()
      const remap = new Map<number, number>()
      const newArr: unknown[] = []
      const maxIdx = Math.max(arr.length, connected.size > 0 ? Math.max(...connected) + 1 : 0)
      for (let i = 0; i < maxIdx; i++) {
        if (connected.has(i)) {
          remap.set(i, newArr.length)
          newArr.push(i < arr.length ? arr[i] : {})
        }
      }
      newArr.push({}) // one trailing empty slot
      if (newArr.length !== arr.length || [...remap.entries()].some(([o, n]) => o !== n)) {
        remapByNode.set(nodeId, remap)
        newArrByNode.set(nodeId, newArr)
      }
    }
    if (newArrByNode.size === 0) return // idempotent: nothing to compact

    // Re-index edges
    let edgesModified = false
    const finalEdges = edges.map(edge => {
      const h = edge.targetHandle
      if (!h?.startsWith('condition_')) return edge
      const remap = remapByNode.get(edge.target)
      if (!remap) return edge
      const oldIdx = parseInt(h.replace('condition_', ''))
      const newIdx = remap.get(oldIdx)
      if (newIdx === undefined || newIdx === oldIdx) return edge
      edgesModified = true
      return { ...edge, targetHandle: `condition_${newIdx}` }
    })
    if (edgesModified) setEdges(finalEdges)
    setNodes(prev => prev.map(n => {
      const newArr = newArrByNode.get(n.id)
      if (!newArr) return n
      const d = n.data as any
      return { ...n, data: { ...n.data, actionNode: { ...d.actionNode, _conditionsNode: newArr } } }
    }))
    debouncedSave()
  }, [edges, nodes, isReadOnly])

  const handleNodesChange = useCallback((n: Node[]) => {
    // Only push undo for structural changes (add/remove), not position/selection
    if (!isReadOnly && n.length !== nodesRef.current.length) pushUndo()
    setNodes(n)
    if (!isReadOnly) debouncedSave()
  }, [isReadOnly, debouncedSave, pushUndo])

  const handleEdgesChange = useCallback((e: Edge[]) => {
    if (isReadOnly) return
    // Push undo for structural changes: add/remove OR reconnect
    const prev = edgesRef.current
    if (e.length !== prev.length) {
      pushUndo()
    } else {
      // Fingerprint-based comparison (order-independent)
      const fp = (edge: Edge) => `${edge.source}|${edge.target}|${edge.sourceHandle ?? ''}|${edge.targetHandle ?? ''}`
      const prevSet = new Set(prev.map(fp))
      if (e.some(edge => !prevSet.has(fp(edge)))) pushUndo()
    }
    setEdges(e)
    debouncedSave()
  }, [isReadOnly, debouncedSave, pushUndo])

  const addEvent = useCallback((eventType: string | null) => {
    if (!eventType || !activeKey || isReadOnly) return
    pushUndo()
    const center = getViewportCenter()
    setNodes(prev => [...prev, {
      id: `trigger_${Date.now()}`, type: 'blueprint',
      position: { x: center.x - 90, y: center.y - 25 },
      data: { label: eventLabels[eventType] ?? eventType, nodeType: 'event_trigger', category: 'event', color: '#2c3e50', eventType, isEventTrigger: true, treePath: eventType } as FlowNodeData,
    }])
    debouncedSave()
  }, [activeKey, isReadOnly, debouncedSave, pushUndo, getViewportCenter])

  /** Build FlowNodeData for a newly created action node from schema.
   *  isCondition is NOT pre-set — BlueprintNode detects it dynamically
   *  from edges (isConditionByConnection) once the user connects it. */
  const buildNewNodeData = useCallback((schema: NodeSchema): FlowNodeData => ({
    label: schema.shortName,
    nodeType: schema.type,
    category: schema.category,
    color: '',
    actionNode: buildDefaultNode(schema.type) as FlowNodeData['actionNode'],
    treePath: `new_${Date.now()}`,
  }), [])

  const addNodeFromPalette = useCallback((schema: NodeSchema) => {
    if (isReadOnly) return; pushUndo()
    const center = getViewportCenter()
    setNodes(prev => [...prev, {
      id: `action_${Date.now()}`, type: 'blueprint',
      position: { x: center.x - 90, y: center.y - 25 },
      data: buildNewNodeData(schema) as FlowNodeData,
    }])
    debouncedSave()
  }, [isReadOnly, pushUndo, getViewportCenter, debouncedSave, buildNewNodeData])

  const handleDrop = useCallback((e: React.DragEvent, position: { x: number; y: number }) => {
    if (isReadOnly) return
    const type = e.dataTransfer.getData('application/buff-node-type')
    if (!type) return
    pushUndo()
    const schema = getSchema(type)
    const nodeId = `action_${Date.now()}`
    pendingCenterRef.current = { id: nodeId, x: position.x, y: position.y }
    setNodes(prev => [...prev, {
      id: nodeId, type: 'blueprint', position,
      data: buildNewNodeData(schema) as FlowNodeData,
    }])
    debouncedSave()
  }, [isReadOnly, pushUndo, debouncedSave, buildNewNodeData])

  const handleAutoLayout = useCallback(() => {
    pushUndo(); setNodes(autoLayout(nodesRef.current, edgesRef.current))
  }, [pushUndo])

  const handleNodeSelect = useCallback((nodeId: string | null) => {
    if (!nodeId) { setSelectedNodeType(null); return }
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) return
    const d = node.data as FlowNodeData
    if (d.nodeType && d.nodeType !== 'event_trigger') {
      const short = normalizeType(d.nodeType).split(/[.+]/).pop() ?? d.nodeType
      setSelectedNodeType(short)
    }
  }, [])

  // Selection update from ReactFlow
  const handleSelectionUpdate = useCallback(({ nodes: selNodes, edges: selEdges }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodeIds(new Set(selNodes.map(n => n.id)))
    setSelectedEdgeIds(new Set(selEdges.map(e => e.id)))
  }, [])

  // ReactFlow API callback
  const handleReactFlowReady = useCallback((api: ReactFlowApi) => {
    reactFlowApiRef.current = api
  }, [])

  // ── Context menu handlers ──
  const handlePaneContextMenu = useCallback((e: React.MouseEvent) => {
    if (isReadOnly) {
      setContextMenu({ type: 'pane', position: { x: e.clientX, y: e.clientY } })
      return
    }
    // In edit mode, open node search menu (like Blender/UE)
    const api = reactFlowApiRef.current
    if (!api) return
    const flowPos = api.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setNodeSearchMenu({
      position: { x: e.clientX, y: e.clientY },
      flowPosition: flowPos,
    })
  }, [isReadOnly])

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    // If multiple nodes selected and right-clicked node is in selection, show selection menu
    if (selectedNodeIds.size > 1 && selectedNodeIds.has(node.id)) {
      setContextMenu({ type: 'selection', position: { x: e.clientX, y: e.clientY } })
    } else {
      // Select this node
      setSelectedNodeIds(new Set([node.id]))
      setSelectedEdgeIds(new Set())
      setContextMenu({ type: 'node', position: { x: e.clientX, y: e.clientY }, targetId: node.id })
    }
  }, [selectedNodeIds])

  const handleEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeIds(new Set([edge.id]))
    setContextMenu({ type: 'edge', position: { x: e.clientX, y: e.clientY }, targetId: edge.id })
  }, [])

  const handleSelectionContextMenu = useCallback((e: React.MouseEvent) => {
    setContextMenu({ type: 'selection', position: { x: e.clientX, y: e.clientY } })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // ── Connection drop on empty → open node search with pending connection ──
  const handleConnectEndEmpty = useCallback((info: {
    nodeId: string; handleId: string | null
    handleType: 'source' | 'target' | null; screenPosition: { x: number; y: number }
  }) => {
    if (isReadOnly) return
    const api = reactFlowApiRef.current
    if (!api) return
    const flowPos = api.screenToFlowPosition(info.screenPosition)
    setNodeSearchMenu({
      position: info.screenPosition,
      flowPosition: flowPos,
      pendingConnection: {
        nodeId: info.nodeId,
        handleId: info.handleId,
        handleType: info.handleType,
      },
    })
  }, [isReadOnly])

  // ── Node selected from search menu → create node + optional auto-connect ──
  const handleNodeSearchSelect = useCallback((schema: NodeSchema) => {
    if (isReadOnly || !nodeSearchMenu) return
    pushUndo()
    const nodeId = `action_${Date.now()}`
    const position = nodeSearchMenu.flowPosition

    setNodes(prev => [...prev, {
      id: nodeId, type: 'blueprint', position,
      data: buildNewNodeData(schema) as FlowNodeData,
    }])

    // Auto-connect if triggered from a dangling connection
    if (nodeSearchMenu.pendingConnection) {
      const { nodeId: fromNodeId, handleId: fromHandleId, handleType } = nodeSearchMenu.pendingConnection
      if (handleType === 'target') {
        // Dragged backwards from an input → new node's output connects to that input
        const sourceHandle = fromHandleId?.startsWith('condition') ? 'bool_out' : 'next'
        setEdges(prev => {
          const filtered = prev.filter(e =>
            !(e.target === fromNodeId && e.targetHandle === fromHandleId),
          )
          return [...filtered, {
            id: `edge_${Date.now()}`, source: nodeId, sourceHandle,
            target: fromNodeId, targetHandle: fromHandleId, type: edgeStyle,
          }]
        })
      } else {
        // Normal: from output → new node's input
        const targetHandle = fromHandleId === 'bool_out' ? 'condition' : 'in'
        setEdges(prev => {
          const filtered = prev.filter(e =>
            !(e.source === fromNodeId && e.sourceHandle === fromHandleId),
          )
          return [...filtered, {
            id: `edge_${Date.now()}`, source: fromNodeId, sourceHandle: fromHandleId,
            target: nodeId, targetHandle, type: edgeStyle,
          }]
        })
      }
    }

    setNodeSearchMenu(null)
    debouncedSave()
  }, [isReadOnly, nodeSearchMenu, pushUndo, edgeStyle, debouncedSave, buildNewNodeData])

  const goToDefinition = useCallback((templateKey: string) => {
    if (templateKey in buffTemplates) {
      setListMode('user')
    } else if (refTemplates && templateKey in refTemplates) {
      setListMode('ref')
    }
    selectTemplate(templateKey)
    setRightPanel('references')
  }, [buffTemplates, refTemplates, selectTemplate])

  // ── Command system ──
  const { commands, hotkeyBindings, getContextMenuItems } = useCanvasCommands({
    nodes, edges, selectedNodeIds, selectedEdgeIds,
    isReadOnly, hasUndo: undoLen > 0, hasRedo: redoLen > 0,
    hasClipboard, activeKey,
    undo, redo, copyNodes, pasteNodes, cutNodes, duplicateNodes,
    deleteSelected, selectAll, autoLayout: handleAutoLayout,
    frameSelected, fitView: fitViewCmd, disconnectNode,
    save: saveImmediate, setActiveTool,
  })

  useHotkeys(hotkeyBindings)

  const contextMenuItems = useMemo(() =>
    contextMenu ? getContextMenuItems(contextMenu.type) : [],
    [contextMenu, getContextMenuItems],
  )

  const handlePropertyEdit = useCallback((nodeId: string, key: string, value: unknown) => {
    if (isReadOnly) return
    pushUndo()
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n
      const nd = n.data as unknown as FlowNodeData
      const updatedAction = nd.actionNode
        ? { ...nd.actionNode, [key]: value }
        : { $type: nd.nodeType, [key]: value }
      return { ...n, data: { ...nd, actionNode: updatedAction } }
    }))
    debouncedSave()
  }, [isReadOnly, pushUndo, debouncedSave])

  const contextValue = useMemo<BuffEditorContextValue>(() => ({
    goToDefinition,
    refIndex,
    refTemplates,
    activeKey,
    selectedNodeType,
    labelMode,
    isReadOnly,
    onPropertyEdit: handlePropertyEdit,
  }), [goToDefinition, refIndex, refTemplates, activeKey, selectedNodeType, labelMode, isReadOnly, handlePropertyEdit])

  const displayedTemplates = listMode === 'ref' ? (refTemplates ?? {}) : buffTemplates

  const noSeason = !activeSeason

  return (
    <BuffEditorContext.Provider value={contextValue}>
    <Box style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* ── Loading overlay ── */}
      {loadingPhase && (
        <Box style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Stack align="center" gap="md" style={{ width: 320 }}>
            <Loader size="lg" color="teal" />
            <Text size="sm" c="white" fw={600}>
              {loadingPhase === 'download' ? '下载游戏数据' : loadingPhase === 'parse' ? '解析 JSON' : '分析节点类型'}
            </Text>
            <Progress value={loadingPercent} size="lg" style={{ width: '100%' }} animated />
            <Text size="xs" c="dimmed">{loadingDetail}</Text>
          </Stack>
        </Box>
      )}

      {/* Left: Template list */}
      <Box style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid var(--mantine-color-dark-4)',
        padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {noSeason ? (
          <>
            <Text size="xs" c="dimmed" ta="center" py={4}>未选择赛季，仅可浏览游戏参考</Text>
            {!refTemplates && !loadingPhase && (
              <Text size="xs" c="dimmed" ta="center">加载失败，刷新重试</Text>
            )}
            <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <BuffTemplateList
                templates={refTemplates ?? {}}
                activeKey={activeKey}
                onSelect={selectTemplate}
                onCreate={() => {}}
                onDelete={() => {}}
                onDuplicate={() => {}}
                readOnly
              />
            </Box>
          </>
        ) : (
          <>
            <SegmentedControl
              size="xs"
              value={listMode}
              onChange={v => setListMode(v as 'user' | 'ref')}
              data={[
                { value: 'user', label: '我的模板' },
                { value: 'ref', label: '游戏参考' },
              ]}
            />
            {listMode === 'ref' && !refTemplates && !loadingPhase && (
              <Text size="xs" c="dimmed" ta="center">加载失败，刷新重试</Text>
            )}
            <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <BuffTemplateList
                templates={displayedTemplates}
                activeKey={activeKey}
                onSelect={selectTemplate}
                onCreate={listMode === 'user' ? createTemplate : () => {}}
                onDelete={listMode === 'user' ? deleteTemplate : () => {}}
                onDuplicate={duplicateTemplate}
                readOnly={listMode === 'ref'}
              />
            </Box>
          </>
        )}
      </Box>

      {/* Center: Canvas + toolbar */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeKey && (
          <BuffEditorToolbar
            activeKey={activeKey}
            isReadOnly={isReadOnly}
            commands={commands}
            activeTool={activeTool}
            onToolChange={setActiveTool}
            eventOptions={eventOptions}
            onAddEvent={addEvent}
            edgeStyle={edgeStyle}
            onEdgeStyleChange={setEdgeStyle}
            labelMode={labelMode}
            onLabelModeChange={setLabelMode}
          />
        )}
        <Box ref={canvasBoxRef} style={{ flex: 1, position: 'relative' }}>
          {activeKey ? (
            <BuffNodeCanvas
              nodes={nodes} edges={edges} edgeStyle={edgeStyle}
              activeTool={activeTool}
              onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
              onNodeSelect={handleNodeSelect} onDrop={isReadOnly ? undefined : handleDrop}
              onPaneContextMenu={handlePaneContextMenu}
              onNodeContextMenu={handleNodeContextMenu}
              onEdgeContextMenu={handleEdgeContextMenu}
              onSelectionContextMenu={handleSelectionContextMenu}
              onSelectionUpdate={handleSelectionUpdate}
              onReactFlowReady={handleReactFlowReady}
              onCutEdges={handleCutEdges}
              onCreateComment={handleCreateComment}
              onConnectEndEmpty={handleConnectEndEmpty}
            />
          ) : (
            <Stack align="center" justify="center" style={{ height: '100%' }}>
              <Text c="dimmed">{noSeason ? '请先选择一个赛季' : '选择一个模板开始编辑，或创建新模板'}</Text>
            </Stack>
          )}
        </Box>
      </Box>

      {/* Right: Node palette / References */}
      {activeKey && (
        <Box style={{
          width: 260, flexShrink: 0,
          borderLeft: '1px solid var(--mantine-color-dark-4)',
          overflow: 'hidden', padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <SegmentedControl
            size="xs" fullWidth
            value={rightPanel}
            onChange={v => setRightPanel(v as 'palette' | 'references')}
            data={[
              { value: 'palette', label: '节点面板' },
              { value: 'references', label: '引用分析' },
            ]}
          />
          <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {rightPanel === 'palette' ? (
              <BuffNodePalette onAddNode={addNodeFromPalette} />
            ) : (
              <BuffReferencePanel />
            )}
          </Box>
        </Box>
      )}

      {/* Context menu */}
      <CanvasContextMenu
        position={contextMenu?.position ?? null}
        items={contextMenuItems}
        opened={!!contextMenu}
        onClose={closeContextMenu}
        isReadOnly={isReadOnly}
      />

      {/* Node search menu (pane right-click / connection drop on empty) */}
      {nodeSearchMenu && (
        <NodeSearchMenu
          position={nodeSearchMenu.position}
          opened
          onClose={() => setNodeSearchMenu(null)}
          onSelect={handleNodeSearchSelect}
          connectionFilter={nodeSearchMenu.pendingConnection ? {
            handleId: nodeSearchMenu.pendingConnection.handleId,
            handleType: nodeSearchMenu.pendingConnection.handleType,
          } : undefined}
        />
      )}
    </Box>
    </BuffEditorContext.Provider>
  )
}
