import { Group, Tooltip, Box } from '@mantine/core'
import { useCollab } from '../../context/CollabContext'
import { getUserColor } from './presenceUtils'

interface PresenceIndicatorProps {
  itemId: string
}

export function PresenceIndicator({ itemId }: PresenceIndicatorProps) {
  const { users, currentUserId, currentModule } = useCollab()

  const focused = users.filter(
    u => u.focusId === itemId && u.module === currentModule && u.userId !== currentUserId
  )

  if (focused.length === 0) return null

  return (
    <Group gap={2} wrap="nowrap">
      {focused.map(user => {
        const fieldLabel = user.focusField ? ` (${user.focusField})` : ''
        return (
          <Tooltip key={user.userId} label={`${user.displayName} 正在编辑${fieldLabel}`} openDelay={300}>
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: `var(--mantine-color-${getUserColor(user.userId)}-6)`,
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )
      })}
    </Group>
  )
}
