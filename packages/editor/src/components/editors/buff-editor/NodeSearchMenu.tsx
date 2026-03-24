import { useState, useMemo, useRef, useEffect } from 'react'
import { TextInput, Paper, Text, Group, Badge } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { getAllSchemas, getSchemasByCategory, categoryLabels, categoryColors, type NodeSchema } from './nodeSchema'
import { nodeNames, tl, tlTip } from './buffEditorI18n'
import { useBuffEditor } from './BuffEditorContext'

export interface ConnectionFilter {
  handleId: string | null
  handleType: 'source' | 'target' | null
}

interface Props {
  position: { x: number; y: number } | null
  opened: boolean
  onClose: () => void
  onSelect: (schema: NodeSchema) => void
  /** When set, filter to nodes compatible with this handle */
  connectionFilter?: ConnectionFilter
}

const CATEGORY_ORDER = [
  'control_flow', 'buff', 'damage', 'healing', 'ability', 'effect',
  'blackboard', 'entity', 'movement', 'stage_specific', 'other',
]

/**
 * Determine which schemas are compatible with a given handle.
 *
 * - condition/condition_N (target) ← needs a condition-producing node (control_flow)
 * - bool_out (source) → needs a node with condition input (hasCondition/hasMultiCondition)
 * - exec handles (next/true/false/in) → any action node
 */
function buildHandleFilter(cf?: ConnectionFilter): ((s: NodeSchema) => boolean) | null {
  if (!cf?.handleId) return null
  const { handleId, handleType } = cf

  // Dragging from a condition input → need condition nodes
  if (handleType === 'target' && (handleId === 'condition' || handleId.startsWith('condition_'))) {
    return (s) => s.category === 'control_flow'
  }

  // Dragging from bool_out → need nodes that accept conditions
  if (handleType === 'source' && handleId === 'bool_out') {
    return (s) => s.hasCondition || s.hasMultiCondition
  }

  // Exec handles — no restriction
  return null
}

function filterHint(cf?: ConnectionFilter): string | null {
  if (!cf?.handleId) return null
  const { handleId, handleType } = cf
  if (handleType === 'target' && (handleId === 'condition' || handleId.startsWith('condition_'))) {
    return '筛选：条件节点'
  }
  if (handleType === 'source' && handleId === 'bool_out') {
    return '筛选：可接收条件的节点'
  }
  return null
}

export function NodeSearchMenu({ position, opened, onClose, onSelect, connectionFilter }: Props) {
  const { labelMode } = useBuffEditor()
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const allSchemas = useMemo(() => getAllSchemas(), [])
  const byCategory = useMemo(() => getSchemasByCategory(), [])

  const handleFilter = useMemo(() => buildHandleFilter(connectionFilter), [connectionFilter])
  const hint = useMemo(() => filterHint(connectionFilter), [connectionFilter])

  const baseSchemas = useMemo(
    () => handleFilter ? allSchemas.filter(handleFilter) : allSchemas,
    [allSchemas, handleFilter],
  )

  const filteredByCategory = useMemo(() => {
    if (!handleFilter) return byCategory
    const m = new Map<string, NodeSchema[]>()
    for (const [cat, schemas] of byCategory) {
      const f = schemas.filter(handleFilter)
      if (f.length > 0) m.set(cat, f)
    }
    return m
  }, [byCategory, handleFilter])

  const filtered = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return baseSchemas
      .filter(s =>
        s.shortName.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        (nodeNames[s.shortName] ?? '').includes(q)
      )
      .sort((a, b) => b.instanceCount - a.instanceCount)
  }, [search, baseSchemas])

  // Reset search and focus on open
  useEffect(() => {
    if (opened) {
      setSearch('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [opened])

  // Close on Escape / click outside
  useEffect(() => {
    if (!opened) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    // Delay to avoid closing on the same click that opened
    const timer = setTimeout(() => window.addEventListener('mousedown', onClick), 50)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onClick)
      clearTimeout(timer)
    }
  }, [opened, onClose])

  if (!opened || !position) return null

  const w = 280, maxH = 400
  const x = Math.min(position.x, window.innerWidth - w - 8)
  const y = Math.min(position.y, window.innerHeight - maxH - 8)

  const handleSelect = (s: NodeSchema) => { onSelect(s); onClose() }

  const renderItem = (s: NodeSchema) => (
    <div
      key={s.type}
      className="palette-item"
      style={{ padding: '3px 8px', cursor: 'pointer', borderRadius: 3, fontSize: 10 }}
      onClick={() => handleSelect(s)}
    >
      <Group gap={4} wrap="nowrap">
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: categoryColors[s.category] ?? '#7f8c8d', flexShrink: 0,
        }} />
        <Text size="10px" truncate style={{ flex: 1 }}
          title={tlTip(s.shortName, nodeNames, labelMode) ?? s.shortName}
        >
          {tl(s.shortName, nodeNames, labelMode)}
        </Text>
        {s.instanceCount > 0 && (
          <Text size="9px" c="dimmed">{s.instanceCount}</Text>
        )}
      </Group>
    </div>
  )

  return (
    <Paper
      ref={menuRef}
      shadow="xl"
      style={{
        position: 'fixed', left: x, top: y,
        width: w, maxHeight: maxH,
        zIndex: 1000,
        display: 'flex', flexDirection: 'column',
        border: '1px solid var(--mantine-color-dark-4)',
        background: 'var(--mantine-color-dark-7)',
      }}
    >
      <div style={{ padding: '8px 8px 4px' }}>
        <TextInput
          ref={inputRef}
          size="xs"
          placeholder="搜索节点..."
          leftSection={<IconSearch size={12} />}
          value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && filtered && filtered.length > 0) {
              handleSelect(filtered[0])
            }
          }}
        />
        {hint && (
          <Badge size="xs" variant="light" color="teal" mt={4}>{hint}</Badge>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 4px' }}>
        {filtered ? (
          filtered.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py={8}>无匹配</Text>
          ) : (
            filtered.map(renderItem)
          )
        ) : (
          CATEGORY_ORDER.map(cat => {
            const schemas = filteredByCategory.get(cat)
            if (!schemas || schemas.length === 0) return null
            return (
              <div key={cat}>
                <Text size="9px" c="dimmed" fw={600} px={8} py={3}
                  title={tlTip(cat, categoryLabels, labelMode)}
                >
                  {tl(cat, categoryLabels, labelMode)} ({schemas.length})
                </Text>
                {schemas
                  .sort((a, b) => b.instanceCount - a.instanceCount)
                  .slice(0, 15)
                  .map(renderItem)}
                {schemas.length > 15 && (
                  <Text size="9px" c="dimmed" ta="center" py={2}>搜索查看更多...</Text>
                )}
              </div>
            )
          })
        )}
      </div>
    </Paper>
  )
}
