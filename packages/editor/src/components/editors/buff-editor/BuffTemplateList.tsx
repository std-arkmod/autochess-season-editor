import { useState, useMemo, useRef, useCallback, useEffect, memo } from 'react'
import { Stack, TextInput, Paper, Text, Group, ActionIcon, Modal, Button } from '@mantine/core'
import { IconPlus, IconTrash, IconCopy, IconSearch } from '@tabler/icons-react'
import type { BuffTemplate } from '@autochess-editor/shared'

const PAGE_SIZE = 80

interface Props {
  templates: Record<string, BuffTemplate>
  activeKey: string | null
  onSelect: (key: string) => void
  onCreate: (key: string) => void
  onDelete: (key: string) => void
  onDuplicate: (sourceKey: string, newKey: string) => void
  readOnly?: boolean
}

export const BuffTemplateList = memo(function BuffTemplateList({ templates, activeKey, onSelect, onCreate, onDelete, onDuplicate, readOnly }: Props) {
  const [search, setSearch] = useState('')
  const [newKeyModal, setNewKeyModal] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [dupModal, setDupModal] = useState<string | null>(null)
  const [dupKey, setDupKey] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement>(null)

  const keys = useMemo(() =>
    Object.keys(templates).filter(k =>
      k.toLowerCase().includes(search.toLowerCase())
    ),
    [templates, search]
  )

  // Reset visible count on search change
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search])

  const visibleKeys = keys.slice(0, visibleCount)

  // Scroll-based loading
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      setVisibleCount(prev => Math.min(prev + PAGE_SIZE, keys.length))
    }
  }, [keys.length])

  const handleCreate = () => {
    if (!newKey.trim()) return
    onCreate(newKey.trim())
    setNewKey('')
    setNewKeyModal(false)
  }

  const openDupModal = (key: string) => {
    setDupModal(key)
    setDupKey(`${key}_copy`)
  }

  const handleDuplicate = () => {
    if (!dupModal || !dupKey.trim()) return
    onDuplicate(dupModal, dupKey.trim())
    setDupModal(null)
    setDupKey('')
  }

  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      <Group gap="xs">
        <TextInput
          size="xs"
          placeholder="搜索模板..."
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        {!readOnly && (
          <ActionIcon size="sm" variant="light" color="teal" onClick={() => setNewKeyModal(true)}>
            <IconPlus size={14} />
          </ActionIcon>
        )}
      </Group>

      <Text size="xs" c="dimmed">
        {keys.length} 个模板{visibleCount < keys.length ? ` (显示 ${visibleCount})` : ''}
      </Text>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {visibleKeys.map(key => (
          <Paper
            key={key}
            p="xs"
            withBorder
            style={{
              cursor: 'pointer',
              flexShrink: 0,
              background: key === activeKey ? 'var(--mantine-color-teal-9)' : undefined,
              borderColor: key === activeKey ? 'var(--mantine-color-teal-6)' : undefined,
            }}
            onClick={() => onSelect(key)}
          >
            <Group gap={4} justify="space-between" wrap="nowrap">
              <Text size="xs" truncate style={{ flex: 1 }}>{key}</Text>
              <Group gap={2} wrap="nowrap">
                <ActionIcon size={16} variant="subtle" onClick={e => { e.stopPropagation(); openDupModal(key) }}>
                  <IconCopy size={10} />
                </ActionIcon>
                {!readOnly && (
                  <ActionIcon size={16} variant="subtle" color="red" onClick={e => { e.stopPropagation(); onDelete(key) }}>
                    <IconTrash size={10} />
                  </ActionIcon>
                )}
              </Group>
            </Group>
            <Text size="10px" c="dimmed">
              {Object.keys(templates[key].eventToActions).length} 个事件
            </Text>
          </Paper>
        ))}
        {visibleCount < keys.length && (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            滚动加载更多...
          </Text>
        )}
      </div>

      <Modal opened={newKeyModal} onClose={() => setNewKeyModal(false)} title="新建 Buff 模板" size="sm">
        <Stack gap="sm">
          <TextInput
            label="Template Key"
            placeholder="例如: custom_bond_t_1"
            value={newKey}
            onChange={e => setNewKey(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <Button onClick={handleCreate} disabled={!newKey.trim()}>创建</Button>
        </Stack>
      </Modal>

      <Modal opened={dupModal !== null} onClose={() => setDupModal(null)} title="复制模板" size="sm">
        <Stack gap="sm">
          <Text size="xs" c="dimmed">源模板: {dupModal}</Text>
          <TextInput
            label="新模板 Key"
            placeholder="输入新模板名称"
            value={dupKey}
            onChange={e => setDupKey(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Enter' && handleDuplicate()}
            autoFocus
          />
          <Button onClick={handleDuplicate} disabled={!dupKey.trim()}>复制</Button>
        </Stack>
      </Modal>
    </Stack>
  )
})
