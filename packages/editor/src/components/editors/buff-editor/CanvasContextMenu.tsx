import { Menu, Kbd, Text, Group } from '@mantine/core'
import {
  IconArrowBackUp, IconArrowForwardUp, IconCopy, IconClipboard,
  IconScissors, IconCopyPlus, IconTrash, IconSelectAll,
  IconLayoutAlignBottom, IconFocusCentered, IconMaximize, IconUnlink,
} from '@tabler/icons-react'
import type { ContextMenuItem } from './useCanvasCommands'

const iconMap: Record<string, React.FC<{ size?: number }>> = {
  IconArrowBackUp, IconArrowForwardUp, IconCopy, IconClipboard,
  IconScissors, IconCopyPlus, IconTrash, IconSelectAll,
  IconLayoutAlignBottom, IconFocusCentered, IconMaximize, IconUnlink,
}

interface Props {
  position: { x: number; y: number } | null
  items: ContextMenuItem[]
  opened: boolean
  onClose: () => void
  isReadOnly: boolean
}

export function CanvasContextMenu({ position, items, opened, onClose, isReadOnly }: Props) {
  if (!position) return null

  const visibleItems = items.filter(item => {
    if (isReadOnly && !item.command.readOnlyAllowed) return false
    return true
  })

  if (visibleItems.length === 0) return null

  return (
    <Menu
      opened={opened}
      onClose={onClose}
      withinPortal
      shadow="lg"
      position="bottom-start"
      offset={0}
    >
      <Menu.Target>
        <div style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: 0,
          height: 0,
          pointerEvents: 'none',
        }} />
      </Menu.Target>
      <Menu.Dropdown>
        {visibleItems.map((item, i) => {
          const IconComp = item.command.icon ? iconMap[item.command.icon] : null
          const disabled = !item.command.enabled()
          return (
            <div key={item.command.id + i}>
              <Menu.Item
                disabled={disabled}
                leftSection={IconComp ? <IconComp size={14} /> : undefined}
                rightSection={
                  item.command.shortcut ? (
                    <Group gap={2}>
                      {item.command.shortcut.split('+').map((k, j) => (
                        <Kbd key={j} size="xs">{k === 'Ctrl' ? '⌘' : k}</Kbd>
                      ))}
                    </Group>
                  ) : undefined
                }
                onClick={() => {
                  if (item.command.enabled()) {
                    item.command.execute()
                  }
                  onClose()
                }}
              >
                <Text size="sm">{item.command.label}</Text>
              </Menu.Item>
              {item.dividerAfter && i < visibleItems.length - 1 && <Menu.Divider />}
            </div>
          )
        })}
      </Menu.Dropdown>
    </Menu>
  )
}
