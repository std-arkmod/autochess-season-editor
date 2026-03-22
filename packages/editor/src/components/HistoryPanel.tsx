import { Drawer, Stack, Text, Group, Badge, ScrollArea, Box } from '@mantine/core'
import {
  IconLayoutDashboard,
  IconChess,
  IconSwords,
  IconUsers,
  IconPackage,
  IconShoppingCart,
  IconSkull,
  IconSparkles,
  IconShield,
  IconGift,
  IconLayersDifference,
  IconStack,
  IconUserCog,
} from '@tabler/icons-react'
import type { DataStore, ActiveModule } from '../store/dataStore'

interface Props {
  store: DataStore
  opened: boolean
  onClose: () => void
}

const moduleIcons: Record<ActiveModule, React.ReactNode> = {
  overview: <IconLayoutDashboard size={14} />,
  modes: <IconSwords size={14} />,
  bonds: <IconUsers size={14} />,
  chess: <IconChess size={14} />,
  traps: <IconPackage size={14} />,
  shop: <IconShoppingCart size={14} />,
  boss: <IconSkull size={14} />,
  effects: <IconSparkles size={14} />,
  garrison: <IconShield size={14} />,
  rewards: <IconGift size={14} />,
  diff: <IconLayersDifference size={14} />,
  misc: <IconStack size={14} />,
  admin: <IconUserCog size={14} />,
}

const moduleNames: Record<ActiveModule, string> = {
  overview: '概览',
  modes: '游戏模式',
  bonds: '盟约',
  chess: '棋子',
  traps: '装备/法术',
  shop: '商店配置',
  boss: 'BOSS',
  effects: '效果信息',
  garrison: '干员特质',
  rewards: '奖励',
  diff: '数据对比',
  misc: '其他',
  admin: '用户管理',
}

export function HistoryPanel({ store, opened, onClose }: Props) {
  const { currentTabHistory, historyJumpTo, activeSeason } = store
  const { stack, cursor } = currentTabHistory

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Text fw={600}>导航历史</Text>
          {activeSeason && (
            <Badge size="xs" color="teal" variant="light">{activeSeason.label}</Badge>
          )}
        </Group>
      }
      position="right"
      size={280}
      styles={{
        body: { padding: '8px 0' },
      }}
    >
      {stack.length === 0 ? (
        <Box px="md" py="xl">
          <Text c="dimmed" size="sm" ta="center">暂无历史记录</Text>
          <Text c="dimmed" size="xs" ta="center" mt={4}>使用导航跳转后将在此显示</Text>
        </Box>
      ) : (
        <ScrollArea h="calc(100vh - 80px)">
          <Stack gap={0}>
            {[...stack].reverse().map((entry, reversedIndex) => {
              const actualIndex = stack.length - 1 - reversedIndex
              const isCurrent = actualIndex === cursor
              return (
                <Box
                  key={actualIndex}
                  px="md"
                  py="xs"
                  style={{
                    cursor: 'pointer',
                    background: isCurrent
                      ? 'var(--mantine-color-teal-9)'
                      : 'transparent',
                    borderLeft: isCurrent
                      ? '3px solid var(--mantine-color-teal-4)'
                      : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => {
                    historyJumpTo(actualIndex)
                    onClose()
                  }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Box c={isCurrent ? 'teal.3' : 'dimmed'} style={{ flexShrink: 0 }}>
                      {moduleIcons[entry.module]}
                    </Box>
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text
                        size="xs"
                        c={isCurrent ? 'teal.1' : 'dimmed'}
                        style={{ lineHeight: 1.3 }}
                      >
                        {moduleNames[entry.module]}
                      </Text>
                      {entry.label && (
                        <Text
                          size="sm"
                          fw={isCurrent ? 600 : 400}
                          c={isCurrent ? 'white' : 'default'}
                          truncate
                          style={{ lineHeight: 1.4 }}
                        >
                          {entry.label}
                        </Text>
                      )}
                      {!entry.label && entry.focusId && (
                        <Text
                          size="xs"
                          ff="monospace"
                          c={isCurrent ? 'teal.2' : 'dimmed'}
                          truncate
                        >
                          {entry.focusId}
                        </Text>
                      )}
                    </Box>
                    {isCurrent && (
                      <Badge size="xs" color="teal" variant="filled" style={{ flexShrink: 0 }}>
                        当前
                      </Badge>
                    )}
                  </Group>
                </Box>
              )
            })}
          </Stack>
        </ScrollArea>
      )}
    </Drawer>
  )
}
