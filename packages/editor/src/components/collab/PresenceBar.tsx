import { Group, Avatar, Tooltip, Text, ActionIcon } from '@mantine/core'
import { IconCircleFilled, IconEye, IconEyeOff } from '@tabler/icons-react'
import type { CollabUser } from '../../store/collabStore'
import { useCollab } from '../../context/CollabContext'
import { getUserColor } from './presenceUtils'

interface PresenceBarProps {
  users: CollabUser[]
  currentUserId?: string
  connected: boolean
}

export function PresenceBar({ users, currentUserId, connected }: PresenceBarProps) {
  const { followingUserId, setFollowingUserId } = useCollab()
  const otherUsers = users.filter(u => u.userId !== currentUserId)

  return (
    <Group gap={6}>
      <Tooltip label={connected ? '已连接' : '连接中...'}>
        <IconCircleFilled
          size={8}
          color={connected ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-yellow-6)'}
        />
      </Tooltip>

      {otherUsers.length > 0 && (
        <Group gap={4}>
          {otherUsers.map(user => {
            const isFollowing = followingUserId === user.userId
            const fieldInfo = user.focusField ? ` → ${user.focusField}` : ''
            const label = `${user.displayName}${user.module ? ` — ${user.module}` : ''}${user.focusId ? ` / ${user.focusId}` : ''}${fieldInfo}`
            return (
              <Group key={user.userId} gap={2} wrap="nowrap">
                <Tooltip label={label}>
                  <Avatar
                    size="xs"
                    radius="xl"
                    color={getUserColor(user.userId)}
                    style={isFollowing ? { outline: '2px solid var(--mantine-color-teal-5)', outlineOffset: 1 } : undefined}
                  >
                    {user.displayName.charAt(0).toUpperCase()}
                  </Avatar>
                </Tooltip>
                <Tooltip label={isFollowing ? '取消跟随' : `跟随 ${user.displayName}`} openDelay={400}>
                  <ActionIcon
                    size={16}
                    variant={isFollowing ? 'filled' : 'subtle'}
                    color={isFollowing ? 'teal' : 'gray'}
                    onClick={() => setFollowingUserId(isFollowing ? null : user.userId)}
                  >
                    {isFollowing ? <IconEyeOff size={10} /> : <IconEye size={10} />}
                  </ActionIcon>
                </Tooltip>
              </Group>
            )
          })}
          <Text size="xs" c="dimmed">
            {otherUsers.length} 人在线
          </Text>
        </Group>
      )}

      {otherUsers.length === 0 && (
        <Text size="xs" c="dimmed">仅你在线</Text>
      )}
    </Group>
  )
}
