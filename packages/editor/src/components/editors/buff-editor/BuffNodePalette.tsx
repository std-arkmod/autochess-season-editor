import { useState, useMemo, useRef, useCallback, useEffect, memo } from 'react'
import { Stack, TextInput, Text, Paper, Group, Badge, Accordion } from '@mantine/core'
import { IconSearch, IconPlus } from '@tabler/icons-react'
import { getAllSchemas, getSchemasByCategory, categoryLabels, categoryColors, type NodeSchema } from './nodeSchema'
import { nodeNames, tl, tlTip } from './buffEditorI18n'
import { useBuffEditor } from './BuffEditorContext'

const PAGE_SIZE = 60

/** Reusable off-screen container for drag preview */
let dragGhost: HTMLDivElement | null = null
function getDragGhost() {
  if (!dragGhost) {
    dragGhost = document.createElement('div')
    Object.assign(dragGhost.style, {
      position: 'absolute', left: '0px', top: '0px',
      pointerEvents: 'none', zIndex: '99999',
      transform: 'translate(-9999px, -9999px)',
    })
    document.body.appendChild(dragGhost)
  }
  return dragGhost
}

function buildNodeCard(name: string, catLabel: string, color: string, schema: NodeSchema): HTMLDivElement {
  const card = document.createElement('div')
  Object.assign(card.style, {
    background: '#1a1a2e', borderRadius: '6px',
    border: `1px solid ${color}`,
    width: '280px', fontSize: '11px',
    boxShadow: `0 4px 16px ${color}44`,
    overflow: 'hidden', fontFamily: 'sans-serif',
  })

  // Title bar
  const title = document.createElement('div')
  Object.assign(title.style, {
    background: color, color: '#fff',
    padding: '5px 10px', fontWeight: '600', fontSize: '11px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  })
  const nameSpan = document.createElement('span')
  nameSpan.textContent = name
  const catSpan = document.createElement('span')
  catSpan.textContent = catLabel
  Object.assign(catSpan.style, { fontSize: '9px', opacity: '0.6' })
  title.appendChild(nameSpan)
  title.appendChild(catSpan)
  card.appendChild(title)

  // Build pins — default (action) layout.
  // Dual-use types also show Result pin so users can see both options.
  const leftPins: { label: string; color: string }[] = []
  leftPins.push({ label: '▶ Exec', color: '#ccc' })
  if (schema.hasCondition) {
    leftPins.push({ label: '● 条件', color: '#f39c12' })
  }
  if (schema.hasMultiCondition) {
    leftPins.push({ label: '● 条件1', color: '#f39c12' })
  }

  const rightPins: { label: string; color: string }[] = []
  rightPins.push({ label: 'Exec ▶', color: '#ccc' })
  if (schema.hasBranches) {
    rightPins.push({ label: 'True ▶', color: '#2ecc71' })
    rightPins.push({ label: 'False ▶', color: '#e74c3c' })
  }
  if (schema.usedAsCondition) {
    rightPins.push({ label: 'Result ▶', color: '#f39c12' })
  }

  const pinCount = Math.max(leftPins.length, rightPins.length)
  const propKeys = Object.keys(schema.properties)
  const hasPins = pinCount > 0
  const hasProps = propKeys.length > 0

  if (hasPins) {
    const pinsDiv = document.createElement('div')
    if (hasProps) pinsDiv.style.borderBottom = '1px solid #333'
    for (let i = 0; i < pinCount; i++) {
      const row = document.createElement('div')
      Object.assign(row.style, {
        display: 'flex', justifyContent: 'space-between',
        padding: '3px 10px', fontSize: '9px', minHeight: '18px',
      })
      const left = leftPins[i]
      const right = rightPins[i]
      const ls = document.createElement('span')
      ls.textContent = left?.label ?? ''
      ls.style.color = left?.color ?? 'transparent'
      const rs = document.createElement('span')
      rs.textContent = right?.label ?? ''
      rs.style.color = right?.color ?? 'transparent'
      row.appendChild(ls)
      row.appendChild(rs)
      pinsDiv.appendChild(row)
    }
    card.appendChild(pinsDiv)
  }

  // Properties
  if (hasProps) {
    const body = document.createElement('div')
    Object.assign(body.style, { padding: '4px 8px' })
    for (const key of propKeys.slice(0, 5)) {
      const row = document.createElement('div')
      Object.assign(row.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1px 0', fontSize: '9px',
      })
      const label = document.createElement('span')
      label.textContent = key
      Object.assign(label.style, { color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' })
      const val = document.createElement('span')
      const def = schema.properties[key]?.defaultValue
      val.textContent = def === null ? 'null' : def === '' ? '""' : String(def ?? '···')
      Object.assign(val.style, { color: '#666', fontSize: '9px', fontFamily: 'monospace', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
      row.appendChild(label)
      row.appendChild(val)
      body.appendChild(row)
    }
    if (propKeys.length > 5) {
      const more = document.createElement('div')
      more.textContent = `... +${propKeys.length - 5}`
      Object.assign(more.style, { fontSize: '8px', color: '#555', textAlign: 'center', padding: '2px 0' })
      body.appendChild(more)
    }
    card.appendChild(body)
  }

  return card
}

interface Props {
  onAddNode: (schema: NodeSchema) => void
}

export const BuffNodePalette = memo(function BuffNodePalette({ onAddNode }: Props) {
  const { labelMode } = useBuffEditor()
  const [search, setSearch] = useState('')
  const [customType, setCustomType] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement>(null)

  const allSchemas = useMemo(() => getAllSchemas(), [])

  const filtered = useMemo(() => {
    if (!search) return null
    const q = search.toLowerCase()
    return allSchemas.filter(s =>
      s.shortName.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q) ||
      (nodeNames[s.shortName] ?? '').includes(q)  // always search CN regardless of mode
    )
  }, [search, allSchemas])

  const byCategory = useMemo(() => getSchemasByCategory(), [])

  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !filtered) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filtered.length))
    }
  }, [filtered])

  const handleDragStart = (e: React.DragEvent, schema: NodeSchema) => {
    e.dataTransfer.setData('application/buff-node-type', schema.type)
    e.dataTransfer.effectAllowed = 'move'

    const color = categoryColors[schema.category] ?? '#7f8c8d'
    const name = tl(schema.shortName, nodeNames, labelMode)
    const catLabel = tl(schema.category, categoryLabels, labelMode)
    const ghost = getDragGhost()
    ghost.innerHTML = ''
    ghost.appendChild(buildNodeCard(name, catLabel, color, schema))
    // Force browser to layout before capture
    void ghost.offsetHeight
    e.dataTransfer.setDragImage(ghost, 140, 14)
  }

  const handleCustomCreate = () => {
    if (!customType.trim()) return
    const schema: NodeSchema = {
      type: customType.trim(),
      shortName: customType.trim().split(/[.+]/).pop() ?? customType.trim(),
      category: 'other',
      properties: {},
      hasBranches: false,
      hasCondition: false,
      hasMultiCondition: false,
      usedAsCondition: false,
      instanceCount: 0,
    }
    onAddNode(schema)
    setCustomType('')
  }

  const renderItem = (s: NodeSchema) => (
    <Paper
      key={s.type}
      p={4}
      className="palette-item"
      style={{ cursor: 'grab', fontSize: 10 }}
      draggable
      onDragStart={e => handleDragStart(e, s)}
      onClick={() => onAddNode(s)}
    >
      <Group gap={4} wrap="nowrap">
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: categoryColors[s.category] ?? '#7f8c8d',
          flexShrink: 0,
        }} />
        <Text size="10px" truncate style={{ flex: 1 }} title={tlTip(s.shortName, nodeNames, labelMode) ?? s.shortName}>{tl(s.shortName, nodeNames, labelMode)}</Text>
        {s.instanceCount > 0 && (
          <Text size="9px" c="dimmed">{s.instanceCount}</Text>
        )}
      </Group>
    </Paper>
  )

  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      <Text size="xs" fw={600}>节点面板</Text>

      {/* Search */}
      <TextInput
        size="xs"
        placeholder="搜索节点类型..."
        leftSection={<IconSearch size={12} />}
        value={search}
        onChange={e => setSearch(e.currentTarget.value)}
      />

      {/* Custom $type input */}
      <TextInput
        size="xs"
        placeholder="自定义 $type，回车创建"
        leftSection={<IconPlus size={12} />}
        value={customType}
        onChange={e => setCustomType(e.currentTarget.value)}
        onKeyDown={e => e.key === 'Enter' && handleCustomCreate()}
      />

      <Text size="10px" c="dimmed">{allSchemas.length} 种节点类型</Text>

      {/* Results */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {filtered ? (
          <Stack gap={2}>
            {filtered.slice(0, visibleCount).map(renderItem)}
            {filtered.length === 0 && <Text size="xs" c="dimmed" ta="center">无匹配</Text>}
            {visibleCount < filtered.length && (
              <Text size="9px" c="dimmed" ta="center">滚动加载更多...</Text>
            )}
          </Stack>
        ) : (
          <Accordion variant="separated" multiple defaultValue={['buff', 'control_flow', 'damage']}>
            {Array.from(byCategory.entries())
              .sort((a, b) => {
                // Sort: common categories first
                const order = ['control_flow', 'buff', 'damage', 'healing', 'ability', 'effect', 'blackboard', 'entity', 'movement', 'stage_specific', 'other']
                return order.indexOf(a[0]) - order.indexOf(b[0])
              })
              .map(([cat, schemas]) => (
                <Accordion.Item key={cat} value={cat}>
                  <Accordion.Control>
                    <Group gap={6}>
                      <Text size="10px" title={tlTip(cat, categoryLabels, labelMode)}>{tl(cat, categoryLabels, labelMode)}</Text>
                      <Badge size="xs" variant="light">{schemas.length}</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={2}>
                      {[...schemas]
                        .sort((a, b) => b.instanceCount - a.instanceCount)
                        .slice(0, 50)
                        .map(renderItem)}
                      {schemas.length > 50 && (
                        <Text size="9px" c="dimmed" ta="center">搜索查看更多...</Text>
                      )}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
          </Accordion>
        )}
      </div>
    </Stack>
  )
})
