import { Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import {
  IconLayoutDashboard, IconSwords, IconUsers, IconShield,
  IconShoppingCart, IconSkull, IconBolt, IconGitCompare,
  IconCoins, IconSettings, IconStar,
} from '@tabler/icons-react'
import type { ActiveModule } from '../store/dataStore'

interface NavItem {
  id: ActiveModule
  icon: React.ReactNode
  label: string
}

const navItems: NavItem[] = [
  { id: 'overview', icon: <IconLayoutDashboard size={20} />, label: '概览' },
  { id: 'modes', icon: <IconSettings size={20} />, label: '模式' },
  { id: 'bonds', icon: <IconUsers size={20} />, label: '盟约' },
  { id: 'chess', icon: <IconSwords size={20} />, label: '棋子' },
  { id: 'traps', icon: <IconShield size={20} />, label: '装备' },
  { id: 'shop', icon: <IconShoppingCart size={20} />, label: '商店' },
  { id: 'boss', icon: <IconSkull size={20} />, label: 'BOSS' },
  { id: 'effects', icon: <IconBolt size={20} />, label: '效果' },
  { id: 'garrison', icon: <IconStar size={20} />, label: '特质' },
  { id: 'rewards', icon: <IconCoins size={20} />, label: '奖励' },
  { id: 'diff', icon: <IconGitCompare size={20} />, label: '对比' },
]

interface Props {
  active: ActiveModule
  onChange: (m: ActiveModule) => void
}

export function Sidebar({ active, onChange }: Props) {
  return (
    <Stack
      gap={4}
      py="md"
      px={8}
      style={{
        width: 60,
        borderRight: '1px solid var(--mantine-color-dark-4)',
        height: '100%',
        background: 'var(--mantine-color-dark-8)',
      }}
    >
      {navItems.map(item => (
        <Tooltip key={item.id} label={item.label} position="right" withArrow>
          <UnstyledButton
            onClick={() => onChange(item.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 4px',
              borderRadius: 8,
              cursor: 'pointer',
              color: active === item.id ? 'var(--mantine-color-teal-4)' : 'var(--mantine-color-dark-2)',
              background: active === item.id ? 'var(--mantine-color-teal-9)' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            {item.icon}
            <Text size="9px" mt={3} lh={1}>{item.label}</Text>
          </UnstyledButton>
        </Tooltip>
      ))}
    </Stack>
  )
}
