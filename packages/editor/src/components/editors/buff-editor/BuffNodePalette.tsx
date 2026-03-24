import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { Stack, TextInput, Text, Paper, Group, Badge, Accordion } from '@mantine/core'
import { IconSearch, IconPlus } from '@tabler/icons-react'
import { getAllSchemas, getSchemasByCategory, categoryLabels, type NodeSchema } from './nodeSchema'
import { nodeNames } from './buffEditorI18n'

const PAGE_SIZE = 60

interface Props {
  onAddNode: (schema: NodeSchema) => void
}

export function BuffNodePalette({ onAddNode }: Props) {
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
      (nodeNames[s.shortName] ?? '').includes(q)
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
      instanceCount: 0,
    }
    onAddNode(schema)
    setCustomType('')
  }

  const renderItem = (s: NodeSchema) => (
    <Paper
      key={s.type}
      p={4}
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
          background: categoryLabels[s.category] ? undefined : '#7f8c8d',
          flexShrink: 0,
        }} />
        <Text size="10px" truncate style={{ flex: 1 }} title={s.shortName}>{nodeNames[s.shortName] ?? s.shortName}</Text>
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
                      <Text size="10px">{categoryLabels[cat] ?? cat}</Text>
                      <Badge size="xs" variant="light">{schemas.length}</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap={2}>
                      {schemas
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
}
