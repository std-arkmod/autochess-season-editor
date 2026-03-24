import { Group, ScrollArea, Text, Box, Title, ActionIcon, Tooltip, Loader, Center } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useHotkeys, useDisclosure } from '@mantine/hooks'
import { IconArrowLeft, IconArrowRight, IconHistory, IconLogout, IconClockEdit } from '@tabler/icons-react'
import { useEffect, useRef, useCallback, useState } from 'react'
import type { AutoChessSeasonData } from '@autochess-editor/shared'
import { useDataStore } from './store/dataStore'
import { useAuthStore } from './store/authStore'
import { useCollabStore } from './store/collabStore'
import { CollabProvider } from './context/CollabContext'
import { LoginPage } from './components/auth/LoginPage'
import { PresenceBar } from './components/collab/PresenceBar'
import { SeasonTabs } from './components/SeasonTabs'
import { Sidebar } from './components/Sidebar'
import { HistoryPanel } from './components/HistoryPanel'
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
import { MiscEditor } from './components/editors/MiscEditor'
import { BuffTemplateEditor } from './components/editors/BuffTemplateEditor'
import { UserManagement } from './components/admin/UserManagement'
import { EditHistoryPanel } from './components/EditHistoryPanel'

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
  misc: '其他数据',
  buffs: 'Buff 模板编辑',
  diff: '赛季数据对比',
  admin: '用户管理',
}

export default function App() {
  const auth = useAuthStore()
  const store = useDataStore()
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null
  const collab = useCollabStore(store.activeSeasonId, token)
  const { activeModule, setActiveModule, canGoBack, canGoForward, historyBack, historyForward } = store
  const [historyOpened, { open: openHistory, close: closeHistory }] = useDisclosure(false)
  const [editHistoryOpened, { open: openEditHistory, close: closeEditHistory }] = useDisclosure(false)
  const [followingUserId, setFollowingUserId] = useState<string | null>(null)
  const [followTargetField, setFollowTargetField] = useState<string | null>(null)

  // Load season & template lists on auth
  useEffect(() => {
    if (auth.isAuthenticated) {
      store.refreshSeasonList()
      store.refreshTemplateList()
    }
  }, [auth.isAuthenticated])

  // Register callback for remote Yjs updates → apply to local store
  const isRemoteUpdate = useRef(false)
  useEffect(() => {
    if (!store.activeSeasonId || !collab.synced) {
      collab.setOnRemoteUpdate(null)
      return
    }
    const seasonId = store.activeSeasonId
    collab.setOnRemoteUpdate((data) => {
      isRemoteUpdate.current = true
      store.setSeasonData(seasonId, data)
    })
    return () => collab.setOnRemoteUpdate(null)
  }, [store.activeSeasonId, collab.synced])

  // Handle season deleted by owner
  useEffect(() => {
    collab.setOnSeasonDeleted((seasonId) => {
      const season = store.seasons.find(s => s.id === seasonId)
      const label = season?.label ?? '未知赛季'
      store.unloadSeason(seasonId)
      store.refreshSeasonList()
      notifications.show({
        title: '赛季已被删除',
        message: `「${label}」已被持有人删除`,
        color: 'red',
      })
    })
    return () => collab.setOnSeasonDeleted(null)
  }, [store.seasons])

  // Push local edits to Yjs (debounced 300ms, flush on module change / window blur)
  const prevDataRef = useRef<unknown>(null)
  const pendingYjsSyncRef = useRef<AutoChessSeasonData | null>(null)
  const yjsSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushYjsSync = useCallback(() => {
    if (yjsSyncTimerRef.current) {
      clearTimeout(yjsSyncTimerRef.current)
      yjsSyncTimerRef.current = null
    }
    if (pendingYjsSyncRef.current && collab.synced) {
      collab.pushLocalEdit(pendingYjsSyncRef.current)
      pendingYjsSyncRef.current = null
    }
  }, [collab.synced, collab.pushLocalEdit])

  useEffect(() => {
    if (!store.activeSeason || !collab.synced) return
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false
      return
    }
    if (prevDataRef.current === store.activeSeason.data) return
    prevDataRef.current = store.activeSeason.data

    if (store.activeSeason.isDirty) {
      pendingYjsSyncRef.current = store.activeSeason.data
      if (yjsSyncTimerRef.current) clearTimeout(yjsSyncTimerRef.current)
      yjsSyncTimerRef.current = setTimeout(() => {
        if (pendingYjsSyncRef.current) {
          collab.pushLocalEdit(pendingYjsSyncRef.current)
          pendingYjsSyncRef.current = null
        }
        yjsSyncTimerRef.current = null
      }, 300)
    }

    return () => {
      if (yjsSyncTimerRef.current) {
        clearTimeout(yjsSyncTimerRef.current)
        yjsSyncTimerRef.current = null
      }
    }
  }, [store.activeSeason?.data, store.activeSeason?.isDirty, collab.synced, collab.pushLocalEdit])

  // Flush Yjs sync on module change
  useEffect(() => { flushYjsSync() }, [activeModule, flushYjsSync])

  // Flush Yjs sync on window blur
  useEffect(() => {
    window.addEventListener('blur', flushYjsSync)
    return () => window.removeEventListener('blur', flushYjsSync)
  }, [flushYjsSync])

  // Send module-level presence (editors handle their own focusId/focusField via CollabContext)
  useEffect(() => {
    if (collab.connected) {
      collab.updatePresence(activeModule, null)
    }
  }, [activeModule, collab.connected])

  // Follow mode: navigate to followed user's position
  const isFollowNav = useRef(false)
  useEffect(() => {
    if (!followingUserId) return
    const target = collab.users.find(u => u.userId === followingUserId)
    if (!target?.module) return

    isFollowNav.current = true
    if (target.module !== activeModule) {
      store.setActiveModule(target.module as typeof activeModule)
    }
    if (target.focusId) {
      store.setFocusId(target.focusId)
    }
    setFollowTargetField(target.focusField ?? null)
    // Reset flag after a tick so the manual nav detection doesn't fire
    requestAnimationFrame(() => { isFollowNav.current = false })
  }, [followingUserId, collab.users])

  // Alt+Left / Alt+Right 快捷键
  useHotkeys([
    ['alt+ArrowLeft', () => { if (canGoBack) historyBack() }],
    ['alt+ArrowRight', () => { if (canGoForward) historyForward() }],
  ])

  // Auth gate
  if (auth.loading) {
    return <Center h="100vh"><Loader size="lg" /></Center>
  }
  if (!auth.isAuthenticated) {
    return <LoginPage auth={auth} />
  }

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
      case 'misc': return <MiscEditor store={store} />
      case 'buffs': return <BuffTemplateEditor store={store} />
      case 'diff': return <DiffViewer store={store} />
      case 'admin': return <UserManagement />
      default: return null
    }
  }

  return (
    <CollabProvider
      users={collab.users}
      currentUserId={auth.user?.id}
      currentModule={activeModule}
      updatePresence={collab.updatePresence}
      followingUserId={followingUserId}
      setFollowingUserId={setFollowingUserId}
      followTargetField={followTargetField}
    >
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

        {/* Collaboration presence */}
        {store.activeSeasonId && (
          <PresenceBar
            users={collab.users}
            currentUserId={auth.user?.id}
            connected={collab.connected}
            reconnectFailed={collab.reconnectFailed}
            onReconnect={collab.manualReconnect}
          />
        )}

        {/* 用户信息 + 历史导航按钮 */}
        <Group gap={4} ml="auto">
          <Text size="xs" c="dimmed">{auth.user?.displayName}</Text>
          <Tooltip label="退出登录" openDelay={400}>
            <ActionIcon variant="subtle" size="sm" onClick={auth.logout}>
              <IconLogout size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group gap={4}>
          <Tooltip label="后退 (Alt+←)" openDelay={400}>
            <ActionIcon
              variant="subtle"
              size="sm"
              disabled={!canGoBack}
              onClick={historyBack}
            >
              <IconArrowLeft size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="前进 (Alt+→)" openDelay={400}>
            <ActionIcon
              variant="subtle"
              size="sm"
              disabled={!canGoForward}
              onClick={historyForward}
            >
              <IconArrowRight size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="导航历史" openDelay={400}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={openHistory}
            >
              <IconHistory size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="编辑历史" openDelay={400}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={openEditHistory}
            >
              <IconClockEdit size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Season Tabs */}
      <Box style={{ flexShrink: 0, background: 'var(--mantine-color-dark-7)' }}>
        <SeasonTabs store={store} currentUserId={auth.user?.id} currentUserDisplayName={auth.user?.displayName} />
      </Box>

      {/* Body */}
      <Box style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar active={activeModule} onChange={setActiveModule} isAdmin={auth.user?.role === 'admin'} />

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
          {store.loading ? (
            <Center py="xl" style={{ flex: 1 }}><Loader /></Center>
          ) : activeModule === 'buffs' ? (
            <Box style={{ flex: 1, overflow: 'hidden' }}>
              {renderEditor()}
            </Box>
          ) : (
            <ScrollArea style={{ flex: 1 }} p="lg" offsetScrollbars>
              {renderEditor()}
            </ScrollArea>
          )}
        </Box>
      </Box>

      {/* History Panel Drawer */}
      <HistoryPanel store={store} opened={historyOpened} onClose={closeHistory} />
      <EditHistoryPanel store={store} opened={editHistoryOpened} onClose={closeEditHistory} />
    </Box>
    </CollabProvider>
  )
}
