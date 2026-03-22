import { Tooltip, Box } from '@mantine/core'

interface FieldLockIndicatorProps {
  user: { displayName: string; color: string }
}

export function FieldLockIndicator({ user }: FieldLockIndicatorProps) {
  return (
    <Tooltip label={`${user.displayName} 正在编辑`} openDelay={200}>
      <Box
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: `var(--mantine-color-${user.color}-6)`,
          flexShrink: 0,
          cursor: 'default',
        }}
      />
    </Tooltip>
  )
}
