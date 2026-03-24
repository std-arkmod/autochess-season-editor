import { useState } from 'react'
import {
  TextInput, Autocomplete, Switch, Group, Text,
  ActionIcon, Tooltip, Collapse, Stack, Paper,
} from '@mantine/core'
import {
  IconChevronRight, IconChevronDown, IconPlus, IconTrash,
  IconArrowUp, IconArrowDown, IconExternalLink,
} from '@tabler/icons-react'
import { propLabels, tl, tlTip } from './buffEditorI18n'
import { useBuffEditor } from './BuffEditorContext'
import { getEnumInfo, isRefProp, type EnumInfo, type LabelMode } from './enumRegistry'

const LABEL_W = 130

interface Props {
  propKey: string
  value: unknown
  onChange: (value: unknown) => void
  /** Hint examples from schema */
  examples?: unknown[]
  /** Parent array/object key — used to inherit enum/ref context for array items */
  parentKey?: string
}

export function InlineField({ propKey, value, onChange, examples, parentKey }: Props) {
  const { labelMode } = useBuffEditor()
  const label = tl(propKey, propLabels, labelMode)
  const tip = tlTip(propKey, propLabels, labelMode) ?? propKey

  // null / undefined
  if (value === undefined || value === null) {
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
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
        <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
        <Switch
          size="xs"
          checked={value}
          onChange={e => onChange(e.currentTarget.checked)}
          ml="auto"
        />
      </Group>
    )
  }

  // number — check for integer enum, use parentKey for array items
  if (typeof value === 'number') {
    const effectiveKey = parentKey ?? propKey
    return <InlineNumberField propKey={effectiveKey} value={value} onChange={onChange} label={label} tip={tip} />
  }

  // string — use parentKey for enum/ref context when inside arrays
  if (typeof value === 'string') {
    const effectiveKey = parentKey ?? propKey
    return <InlineStringField propKey={effectiveKey} value={value} onChange={onChange} label={label} tip={tip} />
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
      <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
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

// ── Shared Autocomplete render for enum options with CN labels ──

function AutocompleteRenderOption(enumInfo: EnumInfo, mode: LabelMode) {
  return ({ option }: { option: { value: string; label: string } }) => {
    const cn = enumInfo.labelMap[option.value]
    if (!cn || mode === 'rawOnly') return <>{option.value}</>
    if (mode === 'cn') {
      return <span>{cn} <span style={{ opacity: 0.5, fontSize: '9px' }}>({option.value})</span></span>
    }
    return <span>{option.value} <span style={{ opacity: 0.5, fontSize: '9px' }}>{cn}</span></span>
  }
}

// ── Number field (with optional enum autocomplete) ──

/** Parse input: return number if valid, otherwise keep as string */
function smartParse(v: string): unknown {
  if (v === '') return 0
  const num = Number(v)
  return isNaN(num) ? v : num
}

function InlineNumberField({ propKey, value, onChange, label, tip }: {
  propKey: string; value: number; onChange: (v: unknown) => void; label: string; tip: string
}) {
  const { labelMode } = useBuffEditor()
  const enumInfo = getEnumInfo(propKey)

  if (enumInfo) {
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
        <Autocomplete
          size="xs"
          value={String(value)}
          onChange={v => onChange(smartParse(v))}
          data={enumInfo.values}
          renderOption={AutocompleteRenderOption(enumInfo, labelMode)}
          limit={Infinity}
          style={{ flex: 1 }}
          styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
        />
      </Group>
    )
  }

  return (
    <Group gap={4} wrap="nowrap" align="center">
      <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
      <TextInput
        size="xs"
        value={String(value)}
        onChange={e => onChange(smartParse(e.currentTarget.value))}
        style={{ flex: 1 }}
        styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
      />
    </Group>
  )
}

// ── String field (enum select / buff ref select / plain text) ──

function InlineStringField({ propKey, value, onChange, label, tip }: {
  propKey: string; value: string; onChange: (v: unknown) => void; label: string; tip: string
}) {
  const { goToDefinition, refIndex, labelMode } = useBuffEditor()
  const enumInfo = getEnumInfo(propKey)
  const isKnownKey = value && refIndex?.allTemplateKeys.has(value)
  const showLink = isKnownKey || isRefProp(propKey)

  if (enumInfo) {
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
        <Autocomplete
          size="xs"
          value={value}
          onChange={v => onChange(v)}
          data={enumInfo.values}
          renderOption={AutocompleteRenderOption(enumInfo, labelMode)}
          limit={Infinity}
          style={{ flex: 1 }}
          styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
        />
        {showLink && value && (
          <GoToDefButton value={value} goToDefinition={goToDefinition} />
        )}
      </Group>
    )
  }

  // Fallback for fields not yet in enum registry (e.g. before game data loads)
  return (
    <Group gap={4} wrap="nowrap" align="center">
      <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
      <TextInput
        size="xs"
        value={value}
        onChange={e => onChange(e.currentTarget.value)}
        style={{ flex: 1 }}
        styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
      />
      {showLink && value && (
        <GoToDefButton value={value} goToDefinition={goToDefinition} />
      )}
    </Group>
  )
}

function GoToDefButton({ value, goToDefinition }: { value: string; goToDefinition: (k: string) => void }) {
  return (
    <Tooltip label={`跳转到 ${value}`} position="left">
      <ActionIcon size={16} variant="subtle" color="teal" style={{ flexShrink: 0 }} onClick={() => goToDefinition(value)}>
        <IconExternalLink size={10} />
      </ActionIcon>
    </Tooltip>
  )
}

// ── Collapsible array with add/remove/reorder ──

function InlineArray({ propKey, value, onChange }: { propKey: string; value: unknown[]; onChange: (v: unknown) => void }) {
  const { labelMode } = useBuffEditor()
  const [opened, setOpened] = useState(false)
  const label = tl(propKey, propLabels, labelMode)
  const tip = tlTip(propKey, propLabels, labelMode) ?? propKey

  const addItem = () => {
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
      <div
        role="button" tabIndex={0}
        onClick={() => setOpened(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpened(o => !o) }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '2px 6px', cursor: 'pointer' }}
      >
        {opened ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
        <Text size="10px" c="dimmed" style={{ flex: 1 }} title={tip}>{label} ({value.length}项)</Text>
        <ActionIcon size={14} variant="subtle" style={{ flexShrink: 0 }} onClick={e => { e.stopPropagation(); addItem() }}>
          <IconPlus size={10} />
        </ActionIcon>
      </div>
      <Collapse in={opened}>
        <Stack gap={2} pl={8} pr={4} pb={4}>
          {value.map((item, idx) => (
            <Group key={idx} gap={2} wrap="nowrap" align="flex-start">
              <div style={{ flex: 1, minWidth: 0 }}>
                <InlineField propKey={`[${idx}]`} value={item} onChange={v => updateItem(idx, v)} parentKey={propKey} />
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

// ── Collapsible object with add/remove keys ──

function InlineObject({ propKey, value, onChange }: { propKey: string; value: Record<string, unknown>; onChange: (v: unknown) => void }) {
  const { labelMode } = useBuffEditor()
  const [opened, setOpened] = useState(false)
  const [newKeyInput, setNewKeyInput] = useState('')
  const [showAddKey, setShowAddKey] = useState(false)
  const label = tl(propKey, propLabels, labelMode)
  const tip = tlTip(propKey, propLabels, labelMode) ?? propKey

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
      <div
        role="button" tabIndex={0}
        onClick={() => setOpened(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpened(o => !o) }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', padding: '2px 6px', cursor: 'pointer' }}
      >
        {opened ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
        <Text size="10px" c="dimmed" style={{ flex: 1 }} title={tip}>{label} ({entries.length}字段)</Text>
        <ActionIcon size={14} variant="subtle" style={{ flexShrink: 0 }} onClick={e => { e.stopPropagation(); setShowAddKey(true); setOpened(true) }}>
          <IconPlus size={10} />
        </ActionIcon>
      </div>
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
