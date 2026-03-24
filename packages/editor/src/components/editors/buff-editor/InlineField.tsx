import { useState } from 'react'
import {
  TextInput, NumberInput, Switch, Select, Group, Text,
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

// ── Shared enum Select with tooltip support ──

function enumSelectData(enumInfo: EnumInfo, mode: LabelMode) {
  return mode === 'cn' ? enumInfo.cnOptions : enumInfo.rawOptions
}

/** Get tooltip text for a value based on the current label mode */
function enumTooltip(enumInfo: EnumInfo, rawValue: string, mode: LabelMode): string | undefined {
  if (mode === 'cn') return rawValue  // hovering CN shows raw
  if (mode === 'raw') return enumInfo.labelMap[rawValue]  // hovering raw shows CN
  return undefined  // rawOnly: no tooltip
}

function EnumSelectRenderOption(mode: LabelMode, enumInfo: EnumInfo) {
  if (mode === 'rawOnly') return undefined
  return ({ option }: { option: { value: string; label: string } }) => {
    const tip = enumTooltip(enumInfo, option.value, mode)
    return <span title={tip}>{option.label}</span>
  }
}

// ── Number field (with optional enum select) ──

function InlineNumberField({ propKey, value, onChange, label, tip }: {
  propKey: string; value: number; onChange: (v: unknown) => void; label: string; tip: string
}) {
  const { labelMode } = useBuffEditor()
  const enumInfo = getEnumInfo(propKey)

  if (enumInfo) {
    const strVal = String(value)
    const selectTip = enumTooltip(enumInfo, strVal, labelMode)
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
        <div style={{ flex: 1 }} title={selectTip}>
          <Select
            size="xs"
            value={enumInfo.values.includes(strVal) ? strVal : null}
            placeholder={!enumInfo.values.includes(strVal) ? strVal : undefined}
            onChange={v => onChange(v !== null ? Number(v) : value)}
            data={enumSelectData(enumInfo, labelMode)}
            renderOption={EnumSelectRenderOption(labelMode, enumInfo)}
            searchable
            allowDeselect={false}
            styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
          />
        </div>
      </Group>
    )
  }

  return (
    <Group gap={4} wrap="nowrap" align="center">
      <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
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

// ── String field (enum select / buff ref select / plain text) ──

function InlineStringField({ propKey, value, onChange, label, tip }: {
  propKey: string; value: string; onChange: (v: unknown) => void; label: string; tip: string
}) {
  const { goToDefinition, refIndex, labelMode } = useBuffEditor()
  const enumInfo = getEnumInfo(propKey)
  const isKnownKey = value && refIndex?.allTemplateKeys.has(value)
  const showLink = isKnownKey || isRefProp(propKey)

  // All string fields use Select — game logic only accepts known values
  if (enumInfo) {
    const isInEnum = enumInfo.values.includes(value)
    const selectTip = enumTooltip(enumInfo, value, labelMode)
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <Text size="10px" c="dimmed" w={LABEL_W} style={{ flexShrink: 0 }} truncate title={tip}>{label}</Text>
        <div style={{ flex: 1 }} title={selectTip}>
          <Select
            size="xs"
            value={isInEnum ? value : null}
            placeholder={isInEnum ? undefined : value}
            onChange={v => { if (v !== null) onChange(v) }}
            data={enumSelectData(enumInfo, labelMode)}
            renderOption={EnumSelectRenderOption(labelMode, enumInfo)}
            searchable
            allowDeselect={false}
            limit={80}
            styles={{ input: { height: 24, minHeight: 24, fontSize: 11 } }}
          />
        </div>
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
