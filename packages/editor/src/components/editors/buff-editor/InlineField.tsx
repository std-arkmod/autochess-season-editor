import { useState } from 'react'
import { TextInput, NumberInput, Switch, Group, Text, ActionIcon, UnstyledButton, Collapse, Stack, Paper } from '@mantine/core'
import { IconChevronRight, IconChevronDown, IconPlus, IconTrash, IconArrowUp, IconArrowDown } from '@tabler/icons-react'

interface Props {
  propKey: string
  value: unknown
  onChange: (value: unknown) => void
  /** Hint examples from schema */
  examples?: unknown[]
}

export function InlineField({ propKey, value, onChange, examples }: Props) {
  // null / undefined
  if (value === undefined || value === null) {
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={100} truncate title={propKey}>{propKey}</Text>
        <TextInput
          size="xs"
          value=""
          placeholder="null"
          onChange={e => onChange(e.currentTarget.value || null)}
          style={{ flex: 1 }}
          styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
        />
      </Group>
    )
  }

  // boolean
  if (typeof value === 'boolean') {
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={100} truncate title={propKey}>{propKey}</Text>
        <Switch
          size="xs"
          checked={value}
          onChange={e => onChange(e.currentTarget.checked)}
        />
      </Group>
    )
  }

  // number
  if (typeof value === 'number') {
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={100} truncate title={propKey}>{propKey}</Text>
        <NumberInput
          size="xs"
          value={value}
          onChange={v => onChange(typeof v === 'number' ? v : 0)}
          step={Number.isInteger(value) ? 1 : 0.1}
          decimalScale={4}
          style={{ flex: 1 }}
          styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
        />
      </Group>
    )
  }

  // string
  if (typeof value === 'string') {
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={100} truncate title={propKey}>{propKey}</Text>
        <TextInput
          size="xs"
          value={value}
          onChange={e => onChange(e.currentTarget.value)}
          style={{ flex: 1 }}
          styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
        />
      </Group>
    )
  }

  // array
  if (Array.isArray(value)) {
    return <InlineArray propKey={propKey} value={value} onChange={onChange} />
  }

  // object
  if (typeof value === 'object') {
    return <InlineObject propKey={propKey} value={value as Record<string, unknown>} onChange={onChange} />
  }

  // fallback
  return (
    <Group gap={4} wrap="nowrap" align="center">
      <Text size="10px" c="dimmed" w={100} truncate>{propKey}</Text>
      <TextInput
        size="xs"
        value={String(value)}
        onChange={e => onChange(e.currentTarget.value)}
        style={{ flex: 1 }}
        styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
      />
    </Group>
  )
}

/** Collapsible array with add/remove/reorder */
function InlineArray({ propKey, value, onChange }: { propKey: string; value: unknown[]; onChange: (v: unknown) => void }) {
  const [opened, setOpened] = useState(false)

  const addItem = () => {
    // Infer new item type from existing items
    let newItem: unknown = ''
    if (value.length > 0) {
      const sample = value[0]
      if (typeof sample === 'number') newItem = 0
      else if (typeof sample === 'boolean') newItem = false
      else if (typeof sample === 'object' && sample !== null) newItem = Array.isArray(sample) ? [] : {}
      else newItem = ''
    }
    onChange([...value, newItem])
  }

  const removeItem = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  const moveItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= value.length) return
    const arr = [...value]
    ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
    onChange(arr)
  }

  const updateItem = (idx: number, newVal: unknown) => {
    const arr = [...value]
    arr[idx] = newVal
    onChange(arr)
  }

  return (
    <Paper p={0} style={{ borderLeft: '2px solid var(--mantine-color-dark-4)' }}>
      <UnstyledButton
        onClick={() => setOpened(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '2px 6px' }}
      >
        {opened ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
        <Text size="10px" c="dimmed">{propKey} ({value.length}项)</Text>
        <ActionIcon size={14} variant="subtle" ml="auto" onClick={e => { e.stopPropagation(); addItem() }}>
          <IconPlus size={10} />
        </ActionIcon>
      </UnstyledButton>
      <Collapse in={opened}>
        <Stack gap={2} pl={8} pr={4} pb={4}>
          {value.map((item, idx) => (
            <Group key={idx} gap={2} wrap="nowrap" align="flex-start">
              <div style={{ flex: 1, minWidth: 0 }}>
                <InlineField propKey={`[${idx}]`} value={item} onChange={v => updateItem(idx, v)} />
              </div>
              <Group gap={0} wrap="nowrap" style={{ flexShrink: 0 }}>
                <ActionIcon size={14} variant="subtle" onClick={() => moveItem(idx, -1)} disabled={idx === 0}>
                  <IconArrowUp size={8} />
                </ActionIcon>
                <ActionIcon size={14} variant="subtle" onClick={() => moveItem(idx, 1)} disabled={idx === value.length - 1}>
                  <IconArrowDown size={8} />
                </ActionIcon>
                <ActionIcon size={14} variant="subtle" color="red" onClick={() => removeItem(idx)}>
                  <IconTrash size={8} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
          {value.length === 0 && (
            <Text size="10px" c="dimmed" ta="center" py={2}>空数组</Text>
          )}
        </Stack>
      </Collapse>
    </Paper>
  )
}

/** Collapsible object with add/remove keys */
function InlineObject({ propKey, value, onChange }: { propKey: string; value: Record<string, unknown>; onChange: (v: unknown) => void }) {
  const [opened, setOpened] = useState(false)
  const [newKeyInput, setNewKeyInput] = useState('')
  const [showAddKey, setShowAddKey] = useState(false)

  const entries = Object.entries(value)

  const updateField = (key: string, newVal: unknown) => {
    onChange({ ...value, [key]: newVal })
  }

  const removeField = (key: string) => {
    const { [key]: _, ...rest } = value
    onChange(rest)
  }

  const addField = () => {
    if (!newKeyInput.trim()) return
    onChange({ ...value, [newKeyInput.trim()]: '' })
    setNewKeyInput('')
    setShowAddKey(false)
  }

  return (
    <Paper p={0} style={{ borderLeft: '2px solid var(--mantine-color-dark-4)' }}>
      <UnstyledButton
        onClick={() => setOpened(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '2px 6px' }}
      >
        {opened ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
        <Text size="10px" c="dimmed">{propKey} ({entries.length}字段)</Text>
        <ActionIcon size={14} variant="subtle" ml="auto" onClick={e => { e.stopPropagation(); setShowAddKey(true); setOpened(true) }}>
          <IconPlus size={10} />
        </ActionIcon>
      </UnstyledButton>
      <Collapse in={opened}>
        <Stack gap={2} pl={8} pr={4} pb={4}>
          {entries.map(([k, v]) => (
            <Group key={k} gap={2} wrap="nowrap" align="flex-start">
              <div style={{ flex: 1, minWidth: 0 }}>
                <InlineField propKey={k} value={v} onChange={newV => updateField(k, newV)} />
              </div>
              <ActionIcon size={14} variant="subtle" color="red" style={{ flexShrink: 0 }} onClick={() => removeField(k)}>
                <IconTrash size={8} />
              </ActionIcon>
            </Group>
          ))}
          {showAddKey && (
            <Group gap={4}>
              <TextInput
                size="xs"
                placeholder="新字段名"
                value={newKeyInput}
                onChange={e => setNewKeyInput(e.currentTarget.value)}
                onKeyDown={e => e.key === 'Enter' && addField()}
                style={{ flex: 1 }}
                styles={{ input: { height: 22, minHeight: 22, fontSize: 10 } }}
                autoFocus
              />
              <ActionIcon size={16} variant="light" color="teal" onClick={addField}>
                <IconPlus size={10} />
              </ActionIcon>
            </Group>
          )}
        </Stack>
      </Collapse>
    </Paper>
  )
}
