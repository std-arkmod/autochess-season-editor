import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { Box, Text, Group, Select, ActionIcon, Tooltip, Stack, Progress, SegmentedControl, Loader, Switch } from '@mantine/core'
import { IconLayoutAlignBottom, IconArrowBackUp } from '@tabler/icons-react'
import type { Node, Edge } from '@xyflow/react'
import type { BuffTemplate } from '@autochess-editor/shared'
import type { DataStore } from '../../store/dataStore'
import { treeToGraph, graphToTree, type FlowNodeData } from './buff-editor/graphConversion'
import { autoLayout } from './buff-editor/layoutEngine'
import { getSchema, buildDefaultNode, loadGameData, normalizeType, type NodeSchema } from './buff-editor/nodeSchema'
import { BuffNodeCanvas, type EdgeStyle } from './buff-editor/BuffNodeCanvas'
import { BuffTemplateList } from './buff-editor/BuffTemplateList'
import { BuffNodePalette } from './buff-editor/BuffNodePalette'
import { BuffReferencePanel } from './buff-editor/BuffReferencePanel'
import { BuffEditorContext, type BuffEditorContextValue } from './buff-editor/BuffEditorContext'
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

const EVENT_OPTIONS = (() => {
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
    items: items.map(e => ({ value: e, label: eventLabels[e] ?? e })),
  }))
})()

const MAX_UNDO = 30
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
  const [showEnumLabels, setShowEnumLabels] = useState(true)

  // Game data + schema loading
  const [refTemplates, setRefTemplates] = useState<Record<string, BuffTemplate> | null>(_cachedRefTemplates)
  const [refIndex, setRefIndex] = useState<BuffReferenceIndex | null>(_cachedRefIndex)
  const [loadingPhase, setLoadingPhase] = useState<string | null>(null)
  const [loadingPercent, setLoadingPercent] = useState(0)
  const [loadingDetail, setLoadingDetail] = useState('')

  // Auto-load game data on mount (skip if already cached)
  useEffect(() => {
    if (_cachedRefTemplates || _loadingPromise) {
      // Already loaded or in progress
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
      // Build reference index in background
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

  // Undo
  const undoStack = useRef<Snapshot[]>([])
  const pushUndo = useCallback(() => {
    undoStack.current.push({
      nodes: nodesRef.current.map(n => ({ ...n, data: { ...n.data } })),
      edges: [...edgesRef.current],
    })
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
  }, [])
  const undo = useCallback(() => {
    const s = undoStack.current.pop()
    if (s) { setNodes(s.nodes); setEdges(s.edges) }
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [undo])

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
  const debouncedSave = useCallback(() => {
    if (isReadOnly) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(saveGraph, 500)
  }, [saveGraph, isReadOnly])
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // Select template — try user templates first, then reference
  const selectTemplate = useCallback((key: string) => {
    if (!isReadOnly && saveTimerRef.current) {
      clearTimeout(saveTimerRef.current); saveTimerRef.current = null; saveGraph()
    }
    // Find template from either source
    const isFromUser = key in buffTemplates
    const template = buffTemplates[key] ?? refTemplates?.[key]
    if (!template) return
    setActiveKey(key)
    setIsReadOnly(!isFromUser || !activeSeason)
    const { nodes: n, edges: e } = treeToGraph(template)
    setNodes(autoLayout(n, e))
    setEdges(e)
    undoStack.current = []
  }, [buffTemplates, refTemplates, isReadOnly, activeSeason, saveGraph])

  const createTemplate = useCallback((key: string) => {
    updateTemplates({ ...buffTemplates, [key]: { templateKey: key, effectKey: '', onEventPriority: 'DEFAULT', eventToActions: {} } })
    setListMode('user'); setActiveKey(key); setIsReadOnly(false); setNodes([]); setEdges([]); undoStack.current = []
  }, [buffTemplates, updateTemplates])

  const deleteTemplate = useCallback((key: string) => {
    if (listMode === 'ref') return
    const { [key]: _, ...rest } = buffTemplates
    updateTemplates(rest)
    if (activeKey === key) { setActiveKey(null); setNodes([]); setEdges([]) }
  }, [buffTemplates, activeKey, listMode, updateTemplates])

  const duplicateTemplate = useCallback((key: string) => {
    const source = listMode === 'ref' ? refTemplates : buffTemplates
    const src = source?.[key]
    if (!src) return
    const newKey = `${key}_copy`
    const copy: BuffTemplate = JSON.parse(JSON.stringify(src))
    copy.templateKey = newKey
    updateTemplates({ ...buffTemplates, [newKey]: copy })
  }, [buffTemplates, refTemplates, listMode, updateTemplates])

  const handleNodesChange = useCallback((n: Node[]) => {
    setNodes(n)
    if (!isReadOnly) { pushUndo(); debouncedSave() }
  }, [isReadOnly, debouncedSave, pushUndo])

  const handleEdgesChange = useCallback((e: Edge[]) => {
    if (isReadOnly) return
    pushUndo(); setEdges(e); debouncedSave()
  }, [isReadOnly, debouncedSave, pushUndo])

  const addEvent = useCallback((eventType: string | null) => {
    if (!eventType || !activeKey || isReadOnly) return
    pushUndo()
    setNodes(prev => [...prev, {
      id: `trigger_${Date.now()}`, type: 'blueprint',
      position: { x: 50, y: nodesRef.current.length * 100 + 50 },
      data: { label: eventLabels[eventType] ?? eventType, nodeType: 'event_trigger', category: 'event', color: '#2c3e50', eventType, isEventTrigger: true, treePath: eventType } as FlowNodeData,
    }])
    debouncedSave()
  }, [activeKey, isReadOnly, debouncedSave, pushUndo])

  const addNodeFromPalette = useCallback((schema: NodeSchema) => {
    if (isReadOnly) return; pushUndo()
    setNodes(prev => [...prev, {
      id: `action_${Date.now()}`, type: 'blueprint',
      position: { x: 300, y: nodesRef.current.length * 80 + 50 },
      data: { label: schema.shortName, nodeType: schema.type, category: schema.category, color: '', actionNode: buildDefaultNode(schema.type), treePath: `new_${Date.now()}` } as FlowNodeData,
    }])
  }, [isReadOnly, pushUndo])

  const handleDrop = useCallback((e: React.DragEvent, position: { x: number; y: number }) => {
    if (isReadOnly) return
    const type = e.dataTransfer.getData('application/buff-node-type')
    if (!type) return
    pushUndo()
    const schema = getSchema(type)
    setNodes(prev => [...prev, {
      id: `action_${Date.now()}`, type: 'blueprint', position,
      data: { label: schema.shortName, nodeType: type, category: schema.category, color: '', actionNode: buildDefaultNode(type), treePath: `new_${Date.now()}` } as FlowNodeData,
    }])
  }, [isReadOnly, pushUndo])

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

  const goToDefinition = useCallback((templateKey: string) => {
    // Switch to ref list if the template is a reference template
    if (templateKey in buffTemplates) {
      setListMode('user')
    } else if (refTemplates && templateKey in refTemplates) {
      setListMode('ref')
    }
    selectTemplate(templateKey)
    setRightPanel('references')
  }, [buffTemplates, refTemplates, selectTemplate])

  const contextValue = useMemo<BuffEditorContextValue>(() => ({
    goToDefinition,
    refIndex,
    refTemplates,
    activeKey,
    selectedNodeType,
    showEnumLabels,
  }), [goToDefinition, refIndex, refTemplates, activeKey, selectedNodeType, showEnumLabels])

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
          <Group gap="xs" px="sm" py={6} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }}>
            <Text size="xs" fw={600}>{activeKey}</Text>
            {isReadOnly && <Text size="10px" c="yellow" fw={600}>只读参考</Text>}
            {!isReadOnly && (
              <Select size="xs" placeholder="添加事件..." data={EVENT_OPTIONS} value={null} onChange={addEvent} clearable searchable style={{ width: 240 }} />
            )}
            <Tooltip label="自动布局">
              <ActionIcon size="sm" variant="light" onClick={handleAutoLayout}>
                <IconLayoutAlignBottom size={14} />
              </ActionIcon>
            </Tooltip>
            {!isReadOnly && (
              <Tooltip label="撤销 (Ctrl+Z)">
                <ActionIcon size="sm" variant="light" onClick={undo} disabled={undoStack.current.length === 0}>
                  <IconArrowBackUp size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            <Select
              size="xs" value={edgeStyle}
              onChange={v => v && setEdgeStyle(v as EdgeStyle)}
              data={[
                { value: 'default', label: '曲线' },
                { value: 'straight', label: '直线' },
                { value: 'step', label: '直角' },
                { value: 'smoothstep', label: '圆角直角' },
              ]}
              style={{ width: 110 }} allowDeselect={false}
            />
            <Tooltip label="显示/隐藏枚举中文翻译">
              <Group gap={4} wrap="nowrap" style={{ marginLeft: 'auto' }}>
                <Text size="10px" c="dimmed">翻译</Text>
                <Switch size="xs" checked={showEnumLabels} onChange={e => setShowEnumLabels(e.currentTarget.checked)} />
              </Group>
            </Tooltip>
          </Group>
        )}
        <Box style={{ flex: 1, position: 'relative' }}>
          {activeKey ? (
            <BuffNodeCanvas
              nodes={nodes} edges={edges} edgeStyle={edgeStyle}
              onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
              onNodeSelect={handleNodeSelect} onDrop={isReadOnly ? undefined : handleDrop}
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
    </Box>
    </BuffEditorContext.Provider>
  )
}
