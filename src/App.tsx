import { Group, ScrollArea, Text, Box, Title } from '@mantine/core'
import { useDataStore } from './store/dataStore'
import { SeasonTabs } from './components/SeasonTabs'
import { Sidebar } from './components/Sidebar'
import { OverviewEditor } from './components/editors/OverviewEditor'
import { ModesEditor } from './components/editors/ModesEditor'
import { BondsEditor } from './components/editors/BondsEditor'
import { ChessEditor } from './components/editors/ChessEditor'
import { TrapsEditor } from './components/editors/TrapsEditor'
import { ShopEditor } from './components/editors/ShopEditor'
import { BossEditor } from './components/editors/BossEditor'
import { EffectsEditor } from './components/editors/EffectsEditor'
import { GarrisonEditor } from './components/editors/GarrisonEditor'
import { RewardsEditor } from './components/editors/RewardsEditor'
import { DiffViewer } from './components/editors/DiffViewer'

const moduleTitles: Record<string, string> = {
  overview: '数据概览',
  modes: '游戏模式编辑',
  bonds: '盟约（羁绊）编辑',
  chess: '棋子编辑',
  traps: '装备/法术编辑',
  shop: '商店配置',
  boss: 'BOSS 配置',
  effects: '效果信息',
  garrison: '干员特质',
  rewards: '回合奖励与倍率',
  diff: '赛季数据对比',
}

export default function App() {
  const store = useDataStore()
  const { activeModule, setActiveModule } = store

  function renderEditor() {
    switch (activeModule) {
      case 'overview': return <OverviewEditor store={store} />
      case 'modes': return <ModesEditor store={store} />
      case 'bonds': return <BondsEditor store={store} />
      case 'chess': return <ChessEditor store={store} />
      case 'traps': return <TrapsEditor store={store} />
      case 'shop': return <ShopEditor store={store} />
      case 'boss': return <BossEditor store={store} />
      case 'effects': return <EffectsEditor store={store} />
      case 'garrison': return <GarrisonEditor store={store} />
      case 'rewards': return <RewardsEditor store={store} />
      case 'diff': return <DiffViewer store={store} />
      default: return null
    }
  }

  return (
    <Box style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Group
        px="md"
        py="xs"
        gap="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-4)',
          background: 'var(--mantine-color-dark-8)',
          flexShrink: 0,
          height: 48,
        }}
      >
        <Title order={5} c="teal" style={{ letterSpacing: '-0.5px' }}>
          自走棋赛季编辑器
        </Title>
        <Text size="xs" c="dimmed">AutoChess Season Data Editor</Text>
      </Group>

      {/* Season Tabs */}
      <Box style={{ flexShrink: 0, background: 'var(--mantine-color-dark-7)' }}>
        <SeasonTabs store={store} />
      </Box>

      {/* Body */}
      <Box style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar active={activeModule} onChange={setActiveModule} />

        {/* Content */}
        <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Group
            px="lg"
            py="sm"
            style={{
              borderBottom: '1px solid var(--mantine-color-dark-5)',
              background: 'var(--mantine-color-dark-7)',
              flexShrink: 0,
            }}
          >
            <Title order={5}>{moduleTitles[activeModule] ?? activeModule}</Title>
            {store.activeSeason && (
              <Text size="xs" c="dimmed">当前：{store.activeSeason.label}</Text>
            )}
          </Group>
          <ScrollArea style={{ flex: 1 }} p="lg" offsetScrollbars>
            {renderEditor()}
          </ScrollArea>
        </Box>
      </Box>
    </Box>
  )
}
