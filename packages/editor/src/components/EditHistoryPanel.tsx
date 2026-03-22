import {
  Drawer, Stack, Group, Text, Button, Badge, Loader, Center,
  ScrollArea, Code, Modal,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowBackUp, IconArrowLeft } from '@tabler/icons-react'
import { useState, useEffect, useCallback } from 'react'
import { api, type SnapshotSummary } from '../api/client'
import { normalizeSeasonDataForRuntime } from '@autochess-editor/shared'
import type { AutoChessSeasonData } from '@autochess-editor/shared'
import type { DataStore } from '../store/dataStore'

interface EditHistoryPanelProps {
  store: DataStore
  opened: boolean
  onClose: () => void
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

// ---- Top-level field labels ----
const topLevelLabels: Record<string, string> = {
  modeDataDict: '游戏模式',
  baseRewardDataList: '基础奖励',
  bandDataListDict: '赛段',
  charChessDataDict: '棋子战斗数据',
  chessNormalIdLookupDict: '棋子ID映射',
  diyChessDict: '自选棋子',
  shopLevelDataDict: '商店等级',
  shopLevelDisplayDataDict: '商店等级显示',
  charShopChessDatas: '棋子商店数据',
  trapChessDataDict: '装备战斗数据',
  trapShopChessDatas: '装备商店数据',
  stageDatasDict: '关卡数据',
  battleDataDict: '战斗数据',
  bondInfoDict: '盟约',
  garrisonDataDict: '干员特质',
  effectInfoDataDict: '效果信息',
  effectBuffInfoDataDict: '效果Buff',
  effectChoiceInfoDict: '效果选择',
  bossInfoDict: 'BOSS',
  specialEnemyInfoDict: '特殊敌人',
  enemyInfoDict: '敌人信息',
  specialEnemyRandomTypeDict: '特殊敌人随机类型',
  trainingNpcList: '训练NPC',
  milestoneList: '里程碑',
  modeFactorInfo: '模式系数',
  difficultyFactorInfo: '难度系数',
  playerTitleDataDict: '玩家称号',
  shopCharChessInfoData: '棋子商店信息',
  constData: '常量数据',
}

// ---- Common sub-field labels ----
const subFieldLabels: Record<string, string> = {
  name: '名称', modeId: '模式ID', code: '代号', desc: '描述',
  modeType: '模式类型', modeDifficulty: '难度', specialPhaseTime: '特殊阶段时间',
  preposedMode: '前置模式', unlockText: '解锁提示', backgroundId: '背景ID',
  loadingPicId: '加载图ID', modeIconId: '图标ID', modeColor: '颜色',
  effectDescList: '效果描述列表', activeBondIdList: '可用盟约', inactiveBondIdList: '禁用盟约',
  inactiveEnemyKey: '禁用敌人',
  bondId: '盟约ID', weight: '权重', activeCount: '激活人数', effectId: '效果ID',
  activeCondition: '激活条件', chessIdList: '所属棋子', activeParamList: '激活参数',
  maxInactiveBondCount: '最大未激活层数', iconId: '图标ID', activeType: '激活类型',
  chessId: '棋子ID', charId: '绑定干员', chessLevel: '棋子阶数', chessType: '棋子类型',
  shopLevelSortId: '商店排序', isHidden: '隐藏', defaultSkillIndex: '默认技能索引',
  upgradeNum: '升级所需数量', bondIds: '盟约列表', garrisonIds: '特质列表',
  isGolden: '是否精锐/进阶', identifier: '标识符', status: '状态数据',
  evolvePhase: '精英阶段', charLevel: '干员等级', skillLevel: '技能等级',
  favorPoint: '信赖值', equipLevel: '模组等级',
  purchasePrice: '价格', trapDuration: '持续时间', itemType: '物品类型',
  canGiveBond: '可提供盟约', giveBondId: '赠与盟约',
  bossId: 'BOSS ID', bloodPoint: '基础血量', bloodPointNormal: '普通血量',
  bloodPointHard: '困难血量', bloodPointAbyss: '深渊血量', isHidingBoss: '隐藏BOSS',
  effectName: '效果名称', effectType: '效果类型', effectDesc: '效果描述',
  continuedRound: '持续回合', enemyPrice: '敌人价格',
  garrisonDesc: '特质描述', eventType: '触发时机', eventTypeDesc: '时机描述',
  sortId: '排序', bandDesc: '赛段描述', totalHp: '总血量',
  modeId_: '模式', stageId: '关卡ID', round: '回合',
}

function getLabel(key: string): string {
  return subFieldLabels[key] || key
}

function getTopLabel(key: string): string {
  return topLevelLabels[key] || key
}

// ---- Deep diff ----

interface DeepChange {
  path: string        // Human-readable path like "游戏模式 / mode_training / 模式名称"
  type: 'added' | 'removed' | 'changed'
  oldVal?: string
  newVal?: string
}

/** Get a display name for a dict entry */
function getEntryName(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return ''
  const obj = entry as Record<string, unknown>
  // Try common name fields
  for (const key of ['name', 'effectName', 'garrisonDesc', 'bandDesc', 'bossId', 'stageId', 'modeId', 'bondId', 'chessId']) {
    if (typeof obj[key] === 'string' && obj[key]) {
      const val = obj[key] as string
      return val.length > 20 ? val.slice(0, 20) + '…' : val
    }
  }
  return ''
}

function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(v => canonicalStringify(v)).join(',') + ']'
  }
  const sorted = Object.keys(value as Record<string, unknown>).sort()
  return '{' + sorted.map(k => JSON.stringify(k) + ':' + canonicalStringify((value as Record<string, unknown>)[k])).join(',') + '}'
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') return v.length > 100 ? v.slice(0, 100) + '…' : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    // Show compact array content
    const items = v.map(item => {
      if (typeof item === 'string') return item.length > 30 ? item.slice(0, 30) + '…' : item
      if (typeof item === 'number' || typeof item === 'boolean') return String(item)
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        // Try to find a name field for display
        for (const k of ['name', 'key', 'id', 'round']) {
          if (typeof obj[k] === 'string' || typeof obj[k] === 'number') return String(obj[k])
        }
      }
      return JSON.stringify(item).slice(0, 40)
    })
    if (items.length <= 5) return `[${items.join(', ')}]`
    return `[${items.slice(0, 5).join(', ')}, …共${v.length}项]`
  }
  const s = JSON.stringify(v)
  return s.length > 100 ? s.slice(0, 100) + '…' : s
}

/** Diff two arrays and produce per-item changes */
function diffArray(pathPrefix: string, oldArr: unknown[], newArr: unknown[], changes: DeepChange[]) {
  const maxLen = Math.max(oldArr.length, newArr.length)
  for (let i = 0; i < maxLen; i++) {
    const oldItem = i < oldArr.length ? oldArr[i] : undefined
    const newItem = i < newArr.length ? newArr[i] : undefined

    if (canonicalStringify(oldItem) === canonicalStringify(newItem)) continue

    const itemLabel = `[${i}]`
    const itemName = getEntryName(newItem ?? oldItem)
    const itemPath = `${pathPrefix} / ${itemLabel}${itemName ? ` (${itemName})` : ''}`

    if (oldItem === undefined) {
      changes.push({ path: itemPath, type: 'added', newVal: formatValue(newItem) })
    } else if (newItem === undefined) {
      changes.push({ path: itemPath, type: 'removed', oldVal: formatValue(oldItem) })
    } else if (oldItem && newItem && typeof oldItem === 'object' && typeof newItem === 'object' && !Array.isArray(oldItem) && !Array.isArray(newItem)) {
      // Both are objects — diff fields
      diffObjectFields(itemPath, oldItem as Record<string, unknown>, newItem as Record<string, unknown>, changes)
    } else {
      changes.push({ path: itemPath, type: 'changed', oldVal: formatValue(oldItem), newVal: formatValue(newItem) })
    }
  }
}

/** Diff fields of two objects */
function diffObjectFields(pathPrefix: string, oldObj: Record<string, unknown>, newObj: Record<string, unknown>, changes: DeepChange[]) {
  const allFields = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  for (const field of allFields) {
    if (canonicalStringify(oldObj[field]) === canonicalStringify(newObj[field])) continue
    const fieldLabel = getLabel(field)
    const fieldPath = `${pathPrefix} / ${fieldLabel}`

    if (!(field in oldObj)) {
      changes.push({ path: fieldPath, type: 'added', newVal: formatValue(newObj[field]) })
    } else if (!(field in newObj)) {
      changes.push({ path: fieldPath, type: 'removed', oldVal: formatValue(oldObj[field]) })
    } else if (Array.isArray(oldObj[field]) && Array.isArray(newObj[field])) {
      diffArray(fieldPath, oldObj[field] as unknown[], newObj[field] as unknown[], changes)
    } else if (
      oldObj[field] && newObj[field] &&
      typeof oldObj[field] === 'object' && typeof newObj[field] === 'object' &&
      !Array.isArray(oldObj[field]) && !Array.isArray(newObj[field])
    ) {
      diffObjectFields(fieldPath, oldObj[field] as Record<string, unknown>, newObj[field] as Record<string, unknown>, changes)
    } else {
      changes.push({ path: fieldPath, type: 'changed', oldVal: formatValue(oldObj[field]), newVal: formatValue(newObj[field]) })
    }
  }
}

function computeDeepDiff(oldData: Record<string, unknown>, newData: Record<string, unknown>): DeepChange[] {
  const changes: DeepChange[] = []

  const allTopKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)])
  for (const topKey of allTopKeys) {
    const topLabel = getTopLabel(topKey)
    const oldVal = oldData[topKey]
    const newVal = newData[topKey]

    if (canonicalStringify(oldVal) === canonicalStringify(newVal)) continue

    if (!(topKey in oldData)) {
      changes.push({ path: topLabel, type: 'added', newVal: formatValue(newVal) })
      continue
    }
    if (!(topKey in newData)) {
      changes.push({ path: topLabel, type: 'removed', oldVal: formatValue(oldVal) })
      continue
    }

    // Both are dicts — diff entry by entry
    if (oldVal && newVal && typeof oldVal === 'object' && typeof newVal === 'object' && !Array.isArray(oldVal) && !Array.isArray(newVal)) {
      const oldDict = oldVal as Record<string, unknown>
      const newDict = newVal as Record<string, unknown>
      const allEntryKeys = new Set([...Object.keys(oldDict), ...Object.keys(newDict)])

      for (const entryKey of allEntryKeys) {
        const oldEntry = oldDict[entryKey]
        const newEntry = newDict[entryKey]

        if (canonicalStringify(oldEntry) === canonicalStringify(newEntry)) continue

        const entryName = getEntryName(newEntry ?? oldEntry)
        const entryLabel = entryName ? `${entryKey} (${entryName})` : entryKey
        const entryPath = `${topLabel} / ${entryLabel}`

        if (!(entryKey in oldDict)) {
          changes.push({ path: entryPath, type: 'added', newVal: '新条目' })
          continue
        }
        if (!(entryKey in newDict)) {
          changes.push({ path: entryPath, type: 'removed', oldVal: '已删除' })
          continue
        }

        // Both exist — deep diff
        if (oldEntry && newEntry && typeof oldEntry === 'object' && typeof newEntry === 'object' && !Array.isArray(oldEntry) && !Array.isArray(newEntry)) {
          diffObjectFields(entryPath, oldEntry as Record<string, unknown>, newEntry as Record<string, unknown>, changes)
        } else if (Array.isArray(oldEntry) && Array.isArray(newEntry)) {
          diffArray(entryPath, oldEntry, newEntry, changes)
        } else {
          changes.push({ path: entryPath, type: 'changed', oldVal: formatValue(oldEntry), newVal: formatValue(newEntry) })
        }
      }
    } else if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      // Top-level array — diff per item
      diffArray(topLabel, oldVal as unknown[], newVal as unknown[], changes)
    } else {
      changes.push({ path: topLabel, type: 'changed', oldVal: formatValue(oldVal), newVal: formatValue(newVal) })
    }
  }

  return changes
}

// ---- Component ----

type ViewState =
  | { type: 'list' }
  | { type: 'detail'; snapshot: SnapshotSummary; changes: DeepChange[]; loading?: boolean; isRollbackPreview?: boolean }

export function EditHistoryPanel({ store, opened, onClose }: EditHistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [view, setView] = useState<ViewState>({ type: 'list' })
  const [rollbackConfirm, setRollbackConfirm] = useState<SnapshotSummary | null>(null)

  const seasonId = store.activeSeasonId

  const loadSnapshots = useCallback(async () => {
    if (!seasonId) return
    setLoading(true)
    try {
      const res = await api.listSnapshots(seasonId)
      setSnapshots(res.snapshots)
    } catch (err) {
      console.error('Failed to load snapshots:', err)
    } finally {
      setLoading(false)
    }
  }, [seasonId])

  useEffect(() => {
    if (opened && seasonId) {
      loadSnapshots()
      setHoverIdx(null)
      setView({ type: 'list' })
    }
  }, [opened, seasonId, loadSnapshots])

  // Click a snapshot → show what changed in this snapshot
  const openDetail = async (snapshot: SnapshotSummary) => {
    if (!seasonId) return
    setView({ type: 'detail', snapshot, changes: [], loading: true })
    try {
      const snapshotRes = await api.getSnapshot(seasonId, snapshot.id)
      const rawData = snapshotRes.snapshot.data as Record<string, unknown> | null
      let changes: DeepChange[]

      if (snapshot.snapshotType === 'full') {
        // Initial snapshot — no previous state
        changes = []
      } else {
        // Diff snapshot — data contains either:
        // { key: { old, new } } for simple fields (arrays, scalars)
        // { key: { subKey: { old, new }, ... } } for dict fields (only changed sub-entries)
        const diff = (rawData ?? {}) as Record<string, Record<string, unknown>>
        const oldData: Record<string, unknown> = {}
        const newData: Record<string, unknown> = {}
        for (const [key, entry] of Object.entries(diff)) {
          if ('old' in entry && 'new' in entry) {
            // Simple old/new pair
            oldData[key] = entry.old
            newData[key] = entry.new
          } else {
            // Sub-diff: reconstruct partial dicts for comparison
            const oldDict: Record<string, unknown> = {}
            const newDict: Record<string, unknown> = {}
            for (const [subKey, subEntry] of Object.entries(entry)) {
              const se = subEntry as { old: unknown; new: unknown }
              oldDict[subKey] = se.old
              newDict[subKey] = se.new
            }
            oldData[key] = oldDict
            newData[key] = newDict
          }
        }
        changes = computeDeepDiff(oldData, newData)
      }

      setView({ type: 'detail', snapshot, changes })
    } catch (err) {
      notifications.show({ title: '加载快照失败', message: String(err), color: 'red' })
      setView({ type: 'list' })
    }
  }

  // Preview what would change if rolling back to this snapshot
  const previewRollback = async (snapshot: SnapshotSummary) => {
    if (!seasonId) return
    setView({ type: 'detail', snapshot, changes: [], loading: true })
    try {
      const snapshotRes = await api.getSnapshot(seasonId, snapshot.id, true)
      const snapshotData = normalizeSeasonDataForRuntime(snapshotRes.snapshot.data as unknown as AutoChessSeasonData) as unknown as Record<string, unknown>
      const currentData = (store.activeSeason?.data ?? {}) as unknown as Record<string, unknown>
      const changes = computeDeepDiff(snapshotData, currentData)
      setView({ type: 'detail', snapshot, changes, isRollbackPreview: true })
    } catch (err) {
      notifications.show({ title: '加载失败', message: String(err), color: 'red' })
      setView({ type: 'list' })
    }
  }

  const handleRollback = async (snapshot: SnapshotSummary) => {
    if (!seasonId) return
    try {
      await api.rollbackToSnapshot(seasonId, snapshot.id)
      const seasonRes = await api.getSeason(seasonId)
      store.setSeasonData(seasonId, seasonRes.season.data as never)
      setRollbackConfirm(null)
      setView({ type: 'list' })
      notifications.show({ title: '回滚成功', message: `已回滚到 ${relativeTime(snapshot.createdAt)} 的版本`, color: 'teal' })
      loadSnapshots()
    } catch (err) {
      notifications.show({ title: '回滚失败', message: String(err), color: 'red' })
    }
  }

  return (
    <>
      <Drawer
        opened={opened}
        onClose={() => { setView({ type: 'list' }); onClose() }}
        title="编辑历史"
        position="right"
        size={420}
        padding={0}
        styles={{
          header: { padding: '12px 16px', borderBottom: '1px solid var(--mantine-color-dark-5)' },
          body: { display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', padding: 0 },
        }}
      >
        {loading ? (
          <Center py="xl"><Loader /></Center>
        ) : view.type === 'list' ? (
          /* ===== LIST VIEW ===== */
          snapshots.length === 0 ? (
            <Center py="xl">
              <Text c="dimmed" size="sm">暂无编辑历史</Text>
            </Center>
          ) : (
            <ScrollArea style={{ flex: 1 }} onMouseLeave={() => setHoverIdx(null)}>
              <div>
                {snapshots.map((snapshot, idx) => {
                  const isHovered = hoverIdx === idx
                  return (
                    <div
                      key={snapshot.id}
                      onMouseEnter={() => setHoverIdx(idx)}
                      onClick={() => openDetail(snapshot)}
                      style={{
                        padding: '6px 16px',
                        cursor: 'pointer',
                        background: isHovered ? 'var(--mantine-color-teal-light)' : 'transparent',
                        borderLeft: isHovered ? '3px solid var(--mantine-color-teal-5)' : '3px solid transparent',
                        transition: 'all 0.08s ease',
                      }}
                    >
                      <Group gap={8} wrap="nowrap">
                        <Text
                          size="xs"
                          ff="monospace"
                          c={isHovered ? 'teal.3' : 'dimmed'}
                          style={{ flexShrink: 0, width: 72 }}
                        >
                          {relativeTime(snapshot.createdAt)}
                        </Text>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap', overflow: 'hidden' }}>
                          {snapshot.changedFields?.map(f => (
                            <Badge key={f} size="xs" variant={isHovered ? 'filled' : 'light'} color={isHovered ? 'teal' : 'dark'} radius="sm">
                              {getTopLabel(f)}
                            </Badge>
                          ))}
                          {snapshot.snapshotType === 'full' && !snapshot.changedFields && (
                            <Badge size="xs" variant="outline" color="blue" radius="sm">初始</Badge>
                          )}
                          {snapshot.description && (
                            <Text size="xs" c={isHovered ? 'gray.4' : 'dimmed'} truncate style={{ flexShrink: 1 }}>{snapshot.description}</Text>
                          )}
                        </div>
                        {snapshot.changeCount != null && (
                          <Text size="xs" c={isHovered ? 'teal.3' : 'dark.3'} style={{ flexShrink: 0 }} ff="monospace">
                            {snapshot.changeCount}
                          </Text>
                        )}
                        {snapshot.userDisplayName && (
                          <Text size="xs" c={isHovered ? 'gray.5' : 'dark.3'} style={{ flexShrink: 0 }}>
                            {snapshot.userDisplayName}
                          </Text>
                        )}
                      </Group>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )
        ) : (
          /* ===== DETAIL VIEW ===== */
          <>
            {/* Detail header */}
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--mantine-color-dark-5)',
              background: 'var(--mantine-color-dark-7)',
              flexShrink: 0,
            }}>
              <Group justify="space-between" mb={4}>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  leftSection={<IconArrowLeft size={14} />}
                  onClick={() => setView({ type: 'list' })}
                  px={4}
                >
                  返回列表
                </Button>
                <Group gap={4}>
                  {view.isRollbackPreview ? (
                    <Button
                      size="compact-xs"
                      variant="filled"
                      color="orange"
                      leftSection={<IconArrowBackUp size={12} />}
                      onClick={() => setRollbackConfirm(view.snapshot)}
                    >
                      确认回滚
                    </Button>
                  ) : (
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="orange"
                      leftSection={<IconArrowBackUp size={12} />}
                      onClick={() => previewRollback(view.snapshot)}
                    >
                      回滚预览
                    </Button>
                  )}
                </Group>
              </Group>
              <Text size="sm" fw={600}>
                {view.isRollbackPreview
                  ? `${relativeTime(view.snapshot.createdAt)} 至今的变更`
                  : view.snapshot.snapshotType === 'full'
                    ? '初始快照'
                    : '此次保存的变更'}
              </Text>
              <Text size="xs" c="dimmed">
                {view.snapshot.userDisplayName && `${view.snapshot.userDisplayName} · `}
                {new Date(view.snapshot.createdAt).toLocaleString('zh-CN')}
                {!view.loading && view.changes.length > 0 && ` · ${view.changes.length} 处变更`}
              </Text>
            </div>

            {/* Changes */}
            {view.loading ? (
              <Center py="xl" style={{ flex: 1 }}><Loader size="sm" /></Center>
            ) : view.changes.length === 0 ? (
              <Center py="xl" style={{ flex: 1 }}>
                <Text c="dimmed" size="sm">
                  {view.isRollbackPreview
                    ? '无变更（与当前数据相同）'
                    : view.snapshot.snapshotType === 'full'
                      ? '初始快照，无历史对比'
                      : '无变更'}
                </Text>
              </Center>
            ) : (
              <ScrollArea style={{ flex: 1 }}>
                <div style={{ padding: '8px 12px' }}>
                  <Stack gap={3}>
                    {view.changes.map((change, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--mantine-color-dark-4)',
                          background: 'var(--mantine-color-dark-6)',
                        }}
                      >
                        <Group gap={6} wrap="nowrap" mb={change.type === 'changed' ? 3 : 0}>
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                            background: change.type === 'added'
                              ? 'var(--mantine-color-green-6)'
                              : change.type === 'removed'
                                ? 'var(--mantine-color-red-6)'
                                : 'var(--mantine-color-yellow-5)',
                          }} />
                          <Text size="xs" c="gray.3" style={{ wordBreak: 'break-word' }}>{change.path}</Text>
                        </Group>
                        {change.type === 'changed' && (
                          <div style={{ paddingLeft: 12 }}>
                            <Group gap={6} wrap="nowrap" align="flex-start">
                              <Code
                                style={{
                                  fontSize: 11, background: 'var(--mantine-color-red-light)',
                                  color: 'var(--mantine-color-red-4)', flex: 1, minWidth: 0,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}
                              >{change.oldVal}</Code>
                              <Text size="xs" c="dimmed" style={{ flexShrink: 0, lineHeight: '20px' }}>→</Text>
                              <Code
                                style={{
                                  fontSize: 11, background: 'var(--mantine-color-green-light)',
                                  color: 'var(--mantine-color-green-4)', flex: 1, minWidth: 0,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}
                              >{change.newVal}</Code>
                            </Group>
                          </div>
                        )}
                        {change.type === 'added' && change.newVal && (
                          <div style={{ paddingLeft: 12 }}>
                            <Code style={{ fontSize: 11, background: 'var(--mantine-color-green-light)', color: 'var(--mantine-color-green-4)' }}>
                              {change.newVal}
                            </Code>
                          </div>
                        )}
                        {change.type === 'removed' && change.oldVal && (
                          <div style={{ paddingLeft: 12 }}>
                            <Code style={{ fontSize: 11, background: 'var(--mantine-color-red-light)', color: 'var(--mantine-color-red-4)', textDecoration: 'line-through' }}>
                              {change.oldVal}
                            </Code>
                          </div>
                        )}
                      </div>
                    ))}
                  </Stack>
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </Drawer>

      {/* Rollback Confirmation */}
      <Modal
        opened={!!rollbackConfirm}
        onClose={() => setRollbackConfirm(null)}
        title="确认回滚"
        size="sm"
      >
        <Stack>
          <Text size="sm">
            确定要回滚到 <strong>{rollbackConfirm ? relativeTime(rollbackConfirm.createdAt) : ''}</strong> 的版本吗？
            将撤销此后的所有变更。
          </Text>
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setRollbackConfirm(null)}>取消</Button>
            <Button color="orange" size="sm" onClick={() => rollbackConfirm && handleRollback(rollbackConfirm)}>
              确认回滚
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
