import { memo } from 'react'
import { Group, Text, Select, ActionIcon, Tooltip, SegmentedControl, Divider, Kbd } from '@mantine/core'
import {
  IconArrowBackUp, IconArrowForwardUp, IconCopy, IconClipboard,
  IconScissors, IconCopyPlus, IconTrash, IconSelectAll,
  IconLayoutAlignBottom, IconFocusCentered, IconMaximize,
  IconPointer, IconHandStop, IconCut, IconTextPlus,
} from '@tabler/icons-react'
import type { Command } from './useCanvasCommands'
import type { EdgeStyle } from './BuffNodeCanvas'
import { MOUSE_TOOLS, type MouseTool } from './mouseTools'

const cmdIconMap: Record<string, React.FC<{ size?: number }>> = {
  IconArrowBackUp, IconArrowForwardUp, IconCopy, IconClipboard,
  IconScissors, IconCopyPlus, IconTrash, IconSelectAll,
  IconLayoutAlignBottom, IconFocusCentered, IconMaximize,
}

const toolIconMap: Record<string, React.FC<{ size?: number }>> = {
  IconPointer, IconHandStop, IconCut, IconTextPlus,
}

interface Props {
  activeKey: string
  isReadOnly: boolean
  viewerOnly?: boolean
  commands: Map<string, Command>
  activeTool: MouseTool
  onToolChange: (tool: MouseTool) => void
  // Existing controls
  eventOptions: Array<{ group: string; items: Array<{ value: string; label: string }> }>
  onAddEvent: (eventType: string | null) => void
  edgeStyle: EdgeStyle
  onEdgeStyleChange: (style: EdgeStyle) => void
  labelMode: 'cn' | 'raw' | 'rawOnly'
  onLabelModeChange: (mode: 'cn' | 'raw' | 'rawOnly') => void
}

function CmdButton({ cmd }: { cmd: Command }) {
  const IconComp = cmd.icon ? cmdIconMap[cmd.icon] : null
  if (!IconComp) return null
  const tooltip = cmd.shortcut ? `${cmd.label} (${cmd.shortcut})` : cmd.label
  return (
    <Tooltip label={tooltip} openDelay={400}>
      <ActionIcon size="sm" variant="light" onClick={cmd.execute} disabled={!cmd.enabled()}>
        <IconComp size={14} />
      </ActionIcon>
    </Tooltip>
  )
}

export const BuffEditorToolbar = memo(function BuffEditorToolbar({
  activeKey, isReadOnly, viewerOnly, commands,
  activeTool, onToolChange,
  eventOptions, onAddEvent,
  edgeStyle, onEdgeStyleChange,
  labelMode, onLabelModeChange,
}: Props) {
  const cmd = (id: string) => commands.get(id)!

  if (viewerOnly) {
    return (
      <Group gap="xs" px="sm" py={6} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }} wrap="nowrap">
        <Text size="xs" fw={600} style={{ flexShrink: 0 }}>{activeKey}</Text>

        <Divider orientation="vertical" />

        {/* Copy */}
        <CmdButton cmd={cmd('copy')} />

        <Divider orientation="vertical" />

        {/* Layout operations */}
        <Group gap={2} wrap="nowrap">
          <CmdButton cmd={cmd('autoLayout')} />
          <CmdButton cmd={cmd('frameSelected')} />
          <CmdButton cmd={cmd('fitView')} />
        </Group>

        <Divider orientation="vertical" />

        <CmdButton cmd={cmd('selectAll')} />

        {/* Right-aligned controls */}
        <Group gap="xs" wrap="nowrap" style={{ marginLeft: 'auto' }}>
          <Select
            size="xs" value={edgeStyle}
            onChange={v => v && onEdgeStyleChange(v as EdgeStyle)}
            data={[
              { value: 'default', label: '曲线' },
              { value: 'straight', label: '直线' },
              { value: 'step', label: '直角' },
              { value: 'smoothstep', label: '圆角直角' },
            ]}
            style={{ width: 110 }} allowDeselect={false}
          />
          <SegmentedControl
            size="xs"
            value={labelMode}
            onChange={v => onLabelModeChange(v as 'cn' | 'raw' | 'rawOnly')}
            data={[
              { value: 'cn', label: '中文' },
              { value: 'raw', label: '原文' },
              { value: 'rawOnly', label: '纯原文' },
            ]}
          />
        </Group>
      </Group>
    )
  }

  return (
    <Group gap="xs" px="sm" py={6} style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', flexShrink: 0 }} wrap="nowrap">
      {/* Template name + event selector */}
      <Text size="xs" fw={600} style={{ flexShrink: 0 }}>{activeKey}</Text>
      {isReadOnly && <Text size="10px" c="yellow" fw={600} style={{ flexShrink: 0 }}>只读参考</Text>}
      {!isReadOnly && (
        <Select size="xs" placeholder="添加事件..." data={eventOptions} value={null} onChange={onAddEvent} clearable searchable style={{ width: 240, flexShrink: 0 }} />
      )}

      <Divider orientation="vertical" />

      {/* Mouse tools */}
      <Group gap={2} wrap="nowrap">
        {MOUSE_TOOLS.map(tool => {
          const IconComp = toolIconMap[tool.icon]
          if (!IconComp) return null
          const isActive = activeTool === tool.id
          return (
            <Tooltip key={tool.id} label={<Group gap={4}>{tool.label} <Kbd size="xs">{tool.shortcut}</Kbd></Group>} openDelay={400}>
              <ActionIcon
                size="sm"
                variant={isActive ? 'filled' : 'light'}
                color={isActive ? 'teal' : undefined}
                onClick={() => onToolChange(tool.id)}
              >
                <IconComp size={14} />
              </ActionIcon>
            </Tooltip>
          )
        })}
      </Group>

      <Divider orientation="vertical" />

      {/* Undo/Redo */}
      <Group gap={2} wrap="nowrap">
        <CmdButton cmd={cmd('undo')} />
        <CmdButton cmd={cmd('redo')} />
      </Group>

      <Divider orientation="vertical" />

      {/* Clipboard operations */}
      <Group gap={2} wrap="nowrap">
        <CmdButton cmd={cmd('copy')} />
        <CmdButton cmd={cmd('paste')} />
        <CmdButton cmd={cmd('cut')} />
        <CmdButton cmd={cmd('duplicate')} />
      </Group>

      <Divider orientation="vertical" />

      {/* Delete */}
      <CmdButton cmd={cmd('delete')} />

      <Divider orientation="vertical" />

      {/* Layout operations */}
      <Group gap={2} wrap="nowrap">
        <CmdButton cmd={cmd('autoLayout')} />
        <CmdButton cmd={cmd('frameSelected')} />
        <CmdButton cmd={cmd('fitView')} />
      </Group>

      <Divider orientation="vertical" />

      {/* Select all */}
      <CmdButton cmd={cmd('selectAll')} />

      {/* Right-aligned controls */}
      <Group gap="xs" wrap="nowrap" style={{ marginLeft: 'auto' }}>
        <Select
          size="xs" value={edgeStyle}
          onChange={v => v && onEdgeStyleChange(v as EdgeStyle)}
          data={[
            { value: 'default', label: '曲线' },
            { value: 'straight', label: '直线' },
            { value: 'step', label: '直角' },
            { value: 'smoothstep', label: '圆角直角' },
          ]}
          style={{ width: 110 }} allowDeselect={false}
        />
        <SegmentedControl
          size="xs"
          value={labelMode}
          onChange={v => onLabelModeChange(v as 'cn' | 'raw' | 'rawOnly')}
          data={[
            { value: 'cn', label: '中文' },
            { value: 'raw', label: '原文' },
            { value: 'rawOnly', label: '纯原文' },
          ]}
        />
      </Group>
    </Group>
  )
})
