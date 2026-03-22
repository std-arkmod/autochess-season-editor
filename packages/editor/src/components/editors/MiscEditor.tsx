import {
  Stack, Group, Text, Grid,
  ActionIcon, Title, Divider,
  Button, Modal, Table, Tabs, Badge,
} from '@mantine/core'
import {
  CNumberInput, CTextInput, CSelect, CTextarea, CMultiSelect, CSwitch,
  CollabEditingProvider,
} from '../collab/CollabInputs'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type {
  SpecialEnemyInfoDict, TrSpecialEnemyTypeElement,
  BandDataListDict, StageDatasDict, TrainingNpcList,
  MilestoneList, ItemType, ChoiceType, EffectType,
} from '@autochess-editor/shared'
import { getCharName } from '@autochess-editor/shared'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

const ENEMY_TYPES: TrSpecialEnemyTypeElement[] = ['FLY', 'TIMES', 'ELEMENT', 'DOT', 'INVISIBLE', 'REFLECTION', 'SPECIAL']

export function MiscEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const data = activeSeason.data

  return (
    <Tabs defaultValue="enemy">
      <Tabs.List mb="md">
        <Tabs.Tab value="enemy">敌人分类</Tabs.Tab>
        <Tabs.Tab value="specialEnemy">特殊敌人</Tabs.Tab>
        <Tabs.Tab value="specialRandomType">特殊敌人权重</Tabs.Tab>
        <Tabs.Tab value="band">策略组</Tabs.Tab>
        <Tabs.Tab value="stage">关卡</Tabs.Tab>
        <Tabs.Tab value="battle">战斗模板</Tabs.Tab>
        <Tabs.Tab value="trainingNpc">训练 NPC</Tabs.Tab>
        <Tabs.Tab value="milestone">里程碑</Tabs.Tab>
        <Tabs.Tab value="playerTitle">玩家称号</Tabs.Tab>
        <Tabs.Tab value="constData">常量</Tabs.Tab>
        <Tabs.Tab value="diy">DIY 棋子</Tabs.Tab>
        <Tabs.Tab value="effectChoice">效果选项</Tabs.Tab>
      </Tabs.List>

      {/* ── 敌人分类 enemyInfoDict ── */}
      <Tabs.Panel value="enemy">
        <EnemyInfoEditor store={store} />
      </Tabs.Panel>

      {/* ── 特殊敌人 specialEnemyInfoDict ── */}
      <Tabs.Panel value="specialEnemy">
        <SpecialEnemyEditor store={store} />
      </Tabs.Panel>

      {/* ── 特殊敌人随机权重 specialEnemyRandomTypeDict ── */}
      <Tabs.Panel value="specialRandomType">
        <Stack gap="md">
          <Title order={5}>特殊敌人随机权重（specialEnemyRandomTypeDict）</Title>
          <Text size="sm" c="dimmed">每种特殊敌人类型的出现次数上限和权重。</Text>
          <Grid gutter="sm">
            {ENEMY_TYPES.map(type => {
              const val = data.specialEnemyRandomTypeDict[type]
              if (!val) return null
              return (
                <Grid.Col key={type} span={4}>
                  <Stack gap="xs">
                    <Text fw={600} size="sm">{type}</Text>
                    <CNumberInput
                      label="count（上限）"
                      collabField={`enemyRandom.${type}.count`}
                      value={val.count}
                      min={0}
                      onChange={v => updateSeason(activeSeasonId!, d => ({
                        ...d,
                        specialEnemyRandomTypeDict: {
                          ...d.specialEnemyRandomTypeDict,
                          [type]: { ...d.specialEnemyRandomTypeDict[type], count: Number(v) },
                        },
                      }))}
                    />
                    <CNumberInput
                      label="weight（权重）"
                      collabField={`enemyRandom.${type}.weight`}
                      value={val.weight}
                      min={0}
                      onChange={v => updateSeason(activeSeasonId!, d => ({
                        ...d,
                        specialEnemyRandomTypeDict: {
                          ...d.specialEnemyRandomTypeDict,
                          [type]: { ...d.specialEnemyRandomTypeDict[type], weight: Number(v) },
                        },
                      }))}
                    />
                  </Stack>
                </Grid.Col>
              )
            })}
          </Grid>
        </Stack>
      </Tabs.Panel>

      {/* ── 策略组 bandDataListDict ── */}
      <Tabs.Panel value="band">
        <BandEditor store={store} />
      </Tabs.Panel>

      {/* ── 关卡 stageDatasDict ── */}
      <Tabs.Panel value="stage">
        <StageEditor store={store} />
      </Tabs.Panel>

      {/* ── 战斗模板 battleDataDict ── */}
      <Tabs.Panel value="battle">
        <BattleDataEditor store={store} />
      </Tabs.Panel>

      {/* ── 训练 NPC ── */}
      <Tabs.Panel value="trainingNpc">
        <TrainingNpcEditor store={store} />
      </Tabs.Panel>

      {/* ── 里程碑 ── */}
      <Tabs.Panel value="milestone">
        <MilestoneEditor store={store} />
      </Tabs.Panel>

      {/* ── 玩家称号 playerTitleDataDict ── */}
      <Tabs.Panel value="playerTitle">
        <PlayerTitleEditor store={store} />
      </Tabs.Panel>

      {/* ── 常量 constData ── */}
      <Tabs.Panel value="constData">
        <ConstDataEditor store={store} />
      </Tabs.Panel>

      {/* ── DIY 棋子 diyChessDict ── */}
      <Tabs.Panel value="diy">
        <DiyChessEditor store={store} />
      </Tabs.Panel>

      {/* ── 效果选项 effectChoiceInfoDict ── */}
      <Tabs.Panel value="effectChoice">
        <EffectChoiceEditor store={store} />
      </Tabs.Panel>
    </Tabs>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EnemyInfoEditor: enemyInfoDict
// ─────────────────────────────────────────────────────────────────────────────
function EnemyInfoEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  if (!activeSeason) return null
  const { enemyInfoDict } = activeSeason.data

  function updateKeys(type: TrSpecialEnemyTypeElement, keys: string[]) {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      enemyInfoDict: { ...d.enemyInfoDict, [type]: keys },
    }))
  }

  return (
    <Stack gap="md">
      <Title order={5}>敌人分类（enemyInfoDict）</Title>
      <Text size="sm" c="dimmed">每种类型下的敌人 key 列表。每行一个 key，可直接编辑。</Text>
      <Grid gutter="md">
        {ENEMY_TYPES.map(type => {
          const keys: string[] = enemyInfoDict[type] ?? []
          return (
            <Grid.Col key={type} span={6}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group gap="xs">
                    <Text fw={600} size="sm" component="span">{type}</Text>
                    <Badge size="xs" variant="outline">{keys.length}</Badge>
                  </Group>
                  <ActionIcon size="xs" variant="light" color="teal"
                    onClick={() => updateKeys(type, [...keys, ''])}>
                    <IconPlus size={10} />
                  </ActionIcon>
                </Group>
                {keys.map((k, i) => (
                  <Group key={i} gap="xs">
                    <CTextInput
                      size="xs" collabField={`enemy.${type}[${i}]`} value={k} style={{ flex: 1 }}
                      onChange={e => {
                        const next = [...keys]; next[i] = e.target.value
                        updateKeys(type, next)
                      }}
                    />
                    <ActionIcon size="xs" variant="subtle" color="red"
                      onClick={() => updateKeys(type, keys.filter((_, j) => j !== i))}>
                      <IconTrash size={10} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            </Grid.Col>
          )
        })}
      </Grid>
    </Stack>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SpecialEnemyEditor: specialEnemyInfoDict
// ─────────────────────────────────────────────────────────────────────────────
function SpecialEnemyEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newKey, setNewKey] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (!activeSeason) return null
  const { specialEnemyInfoDict } = activeSeason.data
  const list = Object.values(specialEnemyInfoDict).sort((a, b) => a.specialEnemyKey.localeCompare(b.specialEnemyKey))
  const editing = editingId ? specialEnemyInfoDict[editingId] : null

  function patch(id: string, p: Partial<SpecialEnemyInfoDict>) {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      specialEnemyInfoDict: { ...d.specialEnemyInfoDict, [id]: { ...d.specialEnemyInfoDict[id], ...p } },
    }))
  }

  function add() {
    const id = newKey.trim()
    if (!id) return
    if (specialEnemyInfoDict[id]) { notifications.show({ title: '已存在', message: `"${id}" 已存在`, color: 'red' }); return }
    updateSeason(activeSeasonId!, d => ({
      ...d,
      specialEnemyInfoDict: {
        ...d.specialEnemyInfoDict,
        [id]: { type: 'SPECIAL', specialEnemyKey: id, randomWeight: 100, isInFirstHalf: false, attachedNormalEnemyKeys: [], attachedEliteEnemyKeys: [] },
      },
    }))
    setEditingId(id); closeAdd(); setNewKey('')
    notifications.show({ title: '已新增', message: `特殊敌人 ${id} 已创建`, color: 'teal' })
  }

  function del(id: string) {
    updateSeason(activeSeasonId!, d => { const n = { ...d.specialEnemyInfoDict }; delete n[id]; return { ...d, specialEnemyInfoDict: n } })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
    notifications.show({ title: '已删除', message: `${id} 已删除`, color: 'orange' })
  }

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>特殊敌人列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{list.length}</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>新增</Button>
              </Group>
            </Group>
            <Stack gap="xs" style={{ maxHeight: 600, overflowY: 'auto' }}>
              {list.map(e => (
                <Group key={e.specialEnemyKey} justify="space-between" wrap="nowrap"
                  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, border: `1px solid ${editingId === e.specialEnemyKey ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-dark-4)'}` }}
                  onClick={() => setEditingId(e.specialEnemyKey)}>
                  <div>
                    <Group gap="xs">
                      <Text size="sm" ff="monospace">{e.specialEnemyKey}</Text>
                      <Badge size="xs" color="orange">{e.type}</Badge>
                    </Group>
                    <Text size="xs" c="dimmed">权重 {e.randomWeight} · {e.isInFirstHalf ? '前半场' : '后半场'}</Text>
                  </div>
                  <ActionIcon size="sm" variant="subtle" color="red"
                    onClick={ev => { ev.stopPropagation(); setDeleteConfirm(e.specialEnemyKey) }}>
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <CollabEditingProvider itemId={editingId}>
          {editing ? (
            <Stack gap="md">
              <Text ff="monospace" size="sm" c="dimmed">{editing.specialEnemyKey}</Text>
              <Grid gutter="sm">
                <Grid.Col span={4}>
                  <CSelect label="类型" value={editing.type}
                    data={ENEMY_TYPES.map(t => ({ value: t, label: t }))}
                    onChange={v => patch(editing.specialEnemyKey, { type: v as TrSpecialEnemyTypeElement })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="随机权重" value={editing.randomWeight} min={0}
                    onChange={v => patch(editing.specialEnemyKey, { randomWeight: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CSwitch label="出现在前半场" checked={editing.isInFirstHalf} mt="xl"
                    onChange={e => patch(editing.specialEnemyKey, { isInFirstHalf: e.target.checked })} />
                </Grid.Col>
              </Grid>
              <KeyListField label="附加普通敌人 Keys" keys={editing.attachedNormalEnemyKeys}
                collabPrefix="normalEnemy"
                onChange={v => patch(editing.specialEnemyKey, { attachedNormalEnemyKeys: v })} />
              <KeyListField label="附加精英敌人 Keys" keys={editing.attachedEliteEnemyKeys}
                collabPrefix="eliteEnemy"
                onChange={v => patch(editing.specialEnemyKey, { attachedEliteEnemyKeys: v })} />
            </Stack>
          ) : <Text c="dimmed" ta="center" mt="xl">← 选择左侧条目</Text>}
          </CollabEditingProvider>
        </Grid.Col>
      </Grid>
      <Modal opened={addOpened} onClose={closeAdd} title="新增特殊敌人" size="sm">
        <Stack gap="md">
          <CTextInput label="specialEnemyKey" value={newKey} onChange={e => setNewKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <Group justify="flex-end"><Button variant="subtle" onClick={closeAdd}>取消</Button><Button onClick={add} disabled={!newKey.trim()}>创建</Button></Group>
        </Stack>
      </Modal>
      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除" size="sm">
        <Stack gap="md">
          <Text>确定删除 <Text span fw={700} c="red">{deleteConfirm}</Text>？</Text>
          <Group justify="flex-end"><Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button><Button color="red" onClick={() => deleteConfirm && del(deleteConfirm)}>删除</Button></Group>
        </Stack>
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BandEditor: bandDataListDict
// ─────────────────────────────────────────────────────────────────────────────
function BandEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newId, setNewId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (!activeSeason) return null
  const { bandDataListDict, effectInfoDataDict } = activeSeason.data
  const list = Object.values(bandDataListDict).sort((a, b) => a.sortId - b.sortId)
  const editing = editingId ? bandDataListDict[editingId] : null

  function patch(id: string, p: Partial<BandDataListDict>) {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      bandDataListDict: { ...d.bandDataListDict, [id]: { ...d.bandDataListDict[id], ...p } },
    }))
  }

  function add() {
    const id = newId.trim()
    if (!id) return
    if (bandDataListDict[id]) { notifications.show({ title: '已存在', message: `"${id}" 已存在`, color: 'red' }); return }
    const nextSort = Math.max(...list.map(b => b.sortId), -1) + 1
    updateSeason(activeSeasonId!, d => ({
      ...d,
      bandDataListDict: {
        ...d.bandDataListDict,
        [id]: { bandId: id, sortId: nextSort, modeTypeList: ['SINGLE'], bandDesc: '', totalHp: 0, effectId: '', victorCount: 0, bandRewardModulus: 1 },
      },
    }))
    setEditingId(id); closeAdd(); setNewId('')
    notifications.show({ title: '已新增', message: `策略组 ${id} 已创建`, color: 'teal' })
  }

  function del(id: string) {
    updateSeason(activeSeasonId!, d => { const n = { ...d.bandDataListDict }; delete n[id]; return { ...d, bandDataListDict: n } })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
  }

  const effectOptions = [
    { value: '', label: '（无）' },
    ...Object.entries(effectInfoDataDict).map(([id, e]) => ({ value: id, label: e.effectName || id })),
  ]

  const modeTypeOptions = [
    { value: 'LOCAL', label: '本地 (LOCAL)' },
    { value: 'SINGLE', label: '单人 (SINGLE)' },
    { value: 'MULTI', label: '多人 (MULTI)' },
  ]

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>策略组列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{list.length}</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>新增</Button>
              </Group>
            </Group>
            <Stack gap="xs" style={{ maxHeight: 600, overflowY: 'auto' }}>
              {list.map(b => (
                <Group key={b.bandId} justify="space-between" wrap="nowrap"
                  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, border: `1px solid ${editingId === b.bandId ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-dark-4)'}` }}
                  onClick={() => setEditingId(b.bandId)}>
                  <div>
                    <Text size="sm" ff="monospace">{b.bandId}</Text>
                    <Text size="xs" c="dimmed">HP {b.totalHp} · 胜 {b.victorCount}</Text>
                  </div>
                  <ActionIcon size="sm" variant="subtle" color="red"
                    onClick={ev => { ev.stopPropagation(); setDeleteConfirm(b.bandId) }}>
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <CollabEditingProvider itemId={editingId}>
          {editing ? (
            <Stack gap="md">
              <Text ff="monospace" size="sm" c="dimmed">{editing.bandId}</Text>
              <Grid gutter="sm">
                <Grid.Col span={4}>
                  <CNumberInput label="总 HP" value={editing.totalHp} min={0}
                    onChange={v => patch(editing.bandId, { totalHp: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="胜利场数" value={editing.victorCount} min={0}
                    onChange={v => patch(editing.bandId, { victorCount: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="奖励倍率" value={editing.bandRewardModulus} step={0.1} decimalScale={2}
                    onChange={v => patch(editing.bandId, { bandRewardModulus: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="排序 ID" value={editing.sortId}
                    onChange={v => patch(editing.bandId, { sortId: Number(v) })} />
                </Grid.Col>
                {editing.updateTime !== undefined && (
                  <Grid.Col span={4}>
                    <CNumberInput label="更新时间戳" value={editing.updateTime}
                      onChange={v => patch(editing.bandId, { updateTime: Number(v) })} />
                  </Grid.Col>
                )}
                <Grid.Col span={12}>
                  <CTextarea label="策略描述" value={editing.bandDesc} autosize minRows={2}
                    onChange={e => patch(editing.bandId, { bandDesc: e.target.value })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <CSelect label="关联效果" value={editing.effectId || ''} data={effectOptions} searchable
                    onChange={v => patch(editing.bandId, { effectId: v || '' })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <CMultiSelect label="适用模式类型" value={editing.modeTypeList} data={modeTypeOptions}
                    onChange={v => patch(editing.bandId, { modeTypeList: v as any[] })} />
                </Grid.Col>
              </Grid>
            </Stack>
          ) : <Text c="dimmed" ta="center" mt="xl">← 选择左侧条目</Text>}
          </CollabEditingProvider>
        </Grid.Col>
      </Grid>
      <Modal opened={addOpened} onClose={closeAdd} title="新增策略组" size="sm">
        <Stack gap="md">
          <CTextInput label="bandId" value={newId} onChange={e => setNewId(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <Group justify="flex-end"><Button variant="subtle" onClick={closeAdd}>取消</Button><Button onClick={add} disabled={!newId.trim()}>创建</Button></Group>
        </Stack>
      </Modal>
      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除" size="sm">
        <Stack gap="md">
          <Text>确定删除 <Text span fw={700} c="red">{deleteConfirm}</Text>？</Text>
          <Group justify="flex-end"><Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button><Button color="red" onClick={() => deleteConfirm && del(deleteConfirm)}>删除</Button></Group>
        </Stack>
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StageEditor: stageDatasDict
// ─────────────────────────────────────────────────────────────────────────────
function StageEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newId, setNewId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (!activeSeason) return null
  const { stageDatasDict, modeDataDict } = activeSeason.data
  const list = Object.values(stageDatasDict).sort((a, b) => a.stageId.localeCompare(b.stageId))
  const editing = editingId ? stageDatasDict[editingId] : null

  function patch(id: string, p: Partial<StageDatasDict>) {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      stageDatasDict: { ...d.stageDatasDict, [id]: { ...d.stageDatasDict[id], ...p } },
    }))
  }

  function add() {
    const id = newId.trim()
    if (!id) return
    if (stageDatasDict[id]) { notifications.show({ title: '已存在', message: `"${id}" 已存在`, color: 'red' }); return }
    updateSeason(activeSeasonId!, d => ({
      ...d,
      stageDatasDict: { ...d.stageDatasDict, [id]: { stageId: id, mode: [], weight: 100 } },
    }))
    setEditingId(id); closeAdd(); setNewId('')
    notifications.show({ title: '已新增', message: `关卡 ${id} 已创建`, color: 'teal' })
  }

  function del(id: string) {
    updateSeason(activeSeasonId!, d => { const n = { ...d.stageDatasDict }; delete n[id]; return { ...d, stageDatasDict: n } })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
  }

  const modeOptions = Object.keys(modeDataDict).map(id => ({ value: id, label: id }))

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>关卡列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{list.length}</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>新增</Button>
              </Group>
            </Group>
            <Stack gap="xs" style={{ maxHeight: 600, overflowY: 'auto' }}>
              {list.map(s => (
                <Group key={s.stageId} justify="space-between" wrap="nowrap"
                  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, border: `1px solid ${editingId === s.stageId ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-dark-4)'}` }}
                  onClick={() => setEditingId(s.stageId)}>
                  <div>
                    <Text size="sm" ff="monospace">{s.stageId}</Text>
                    <Text size="xs" c="dimmed">权重 {s.weight} · 模式 {s.mode.join(', ') || '—'}</Text>
                  </div>
                  <ActionIcon size="sm" variant="subtle" color="red"
                    onClick={ev => { ev.stopPropagation(); setDeleteConfirm(s.stageId) }}>
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <CollabEditingProvider itemId={editingId}>
          {editing ? (
            <Stack gap="md">
              <Text ff="monospace" size="sm" c="dimmed">{editing.stageId}</Text>
              <Grid gutter="sm">
                <Grid.Col span={4}>
                  <CNumberInput label="权重" value={editing.weight} min={0}
                    onChange={v => patch(editing.stageId, { weight: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={12}>
                  <CMultiSelect label="适用模式" value={editing.mode} data={modeOptions} searchable
                    onChange={v => patch(editing.stageId, { mode: v })} />
                </Grid.Col>
              </Grid>
            </Stack>
          ) : <Text c="dimmed" ta="center" mt="xl">← 选择左侧条目</Text>}
          </CollabEditingProvider>
        </Grid.Col>
      </Grid>
      <Modal opened={addOpened} onClose={closeAdd} title="新增关卡" size="sm">
        <Stack gap="md">
          <CTextInput label="stageId" value={newId} onChange={e => setNewId(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <Group justify="flex-end"><Button variant="subtle" onClick={closeAdd}>取消</Button><Button onClick={add} disabled={!newId.trim()}>创建</Button></Group>
        </Stack>
      </Modal>
      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除" size="sm">
        <Stack gap="md">
          <Text>确定删除 <Text span fw={700} c="red">{deleteConfirm}</Text>？</Text>
          <Group justify="flex-end"><Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button><Button color="red" onClick={() => deleteConfirm && del(deleteConfirm)}>删除</Button></Group>
        </Stack>
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BattleDataEditor: battleDataDict
// 结构：{ [mode]: { [diffOrKey]: ModeMultiFunnyElement[] } }
// ─────────────────────────────────────────────────────────────────────────────
function BattleDataEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  if (!activeSeason) return null
  const { battleDataDict } = activeSeason.data
  const modes = Object.keys(battleDataDict)

  return (
    <Stack gap="md">
      <Title order={5}>战斗模板配置（battleDataDict）</Title>
      <Text size="sm" c="dimmed">结构：mode → difficulty → 关卡列表。点击条目可编辑 bossId 和 levelId。</Text>
      {modes.map(mode => (
        <Stack key={mode} gap="xs">
          <Divider label={<Text fw={600} size="sm">{mode}</Text>} labelPosition="left" />
          {Object.entries(battleDataDict[mode]).map(([diff, entries]) => (
            <Stack key={diff} gap="xs" ml="md">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{diff} ({entries.length} 条)</Text>
                <ActionIcon size="xs" variant="light" color="teal" onClick={() => {
                  updateSeason(activeSeasonId!, d => ({
                    ...d,
                    battleDataDict: {
                      ...d.battleDataDict,
                      [mode]: {
                        ...d.battleDataDict[mode],
                        [diff]: [...(d.battleDataDict[mode][diff] ?? []), { bossId: null, levelId: '', isSpPrepare: false }],
                      },
                    },
                  }))
                }}>
                  <IconPlus size={10} />
                </ActionIcon>
              </Group>
              <Table fz="xs" withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>levelId</Table.Th>
                    <Table.Th>bossId</Table.Th>
                    <Table.Th>isSpPrepare</Table.Th>
                    <Table.Th w={30}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {entries.map((entry, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{i + 1}</Table.Td>
                      <Table.Td>
                        <CTextInput size="xs" collabField={`battle.${mode}.${diff}[${i}].levelId`} value={entry.levelId} w={180}
                          onChange={e => {
                            updateSeason(activeSeasonId!, d => {
                              const arr = [...d.battleDataDict[mode][diff]]
                              arr[i] = { ...arr[i], levelId: e.target.value }
                              return { ...d, battleDataDict: { ...d.battleDataDict, [mode]: { ...d.battleDataDict[mode], [diff]: arr } } }
                            })
                          }} />
                      </Table.Td>
                      <Table.Td>
                        <CTextInput size="xs" collabField={`battle.${mode}.${diff}[${i}].bossId`} value={entry.bossId ?? ''} placeholder="null" w={140}
                          onChange={e => {
                            updateSeason(activeSeasonId!, d => {
                              const arr = [...d.battleDataDict[mode][diff]]
                              arr[i] = { ...arr[i], bossId: e.target.value || null }
                              return { ...d, battleDataDict: { ...d.battleDataDict, [mode]: { ...d.battleDataDict[mode], [diff]: arr } } }
                            })
                          }} />
                      </Table.Td>
                      <Table.Td>
                        <CSwitch checked={entry.isSpPrepare} onChange={ev => {
                          updateSeason(activeSeasonId!, d => {
                            const arr = [...d.battleDataDict[mode][diff]]
                            arr[i] = { ...arr[i], isSpPrepare: ev.target.checked }
                            return { ...d, battleDataDict: { ...d.battleDataDict, [mode]: { ...d.battleDataDict[mode], [diff]: arr } } }
                          })
                        }} />
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon size="xs" variant="subtle" color="red" onClick={() => {
                          updateSeason(activeSeasonId!, d => {
                            const arr = d.battleDataDict[mode][diff].filter((_, j) => j !== i)
                            return { ...d, battleDataDict: { ...d.battleDataDict, [mode]: { ...d.battleDataDict[mode], [diff]: arr } } }
                          })
                        }}>
                          <IconTrash size={10} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TrainingNpcEditor: trainingNpcList
// ─────────────────────────────────────────────────────────────────────────────
function TrainingNpcEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  if (!activeSeason) return null
  const { trainingNpcList, bandDataListDict } = activeSeason.data

  function patch(i: number, p: Partial<TrainingNpcList>) {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      trainingNpcList: d.trainingNpcList.map((n, idx) => idx === i ? { ...n, ...p } : n),
    }))
  }

  function add() {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      trainingNpcList: [...d.trainingNpcList, { npcId: '', charId: '', nameCardSkinId: '', medalCount: 0, bandId: '' }],
    }))
  }

  function del(i: number) {
    updateSeason(activeSeasonId!, d => ({ ...d, trainingNpcList: d.trainingNpcList.filter((_, idx) => idx !== i) }))
  }

  const bandOptions = Object.keys(bandDataListDict).map(id => ({ value: id, label: id }))

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={5}>训练 NPC 列表（trainingNpcList）</Title>
        <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={add}>新增</Button>
      </Group>
      <Table fz="sm" withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th>npcId</Table.Th>
            <Table.Th>charId（干员）</Table.Th>
            <Table.Th>nameCardSkinId</Table.Th>
            <Table.Th>medalCount</Table.Th>
            <Table.Th>bandId</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {trainingNpcList.map((npc, i) => (
            <Table.Tr key={i}>
              <Table.Td>{i + 1}</Table.Td>
              <Table.Td><CTextInput size="xs" collabField={`npc[${i}].npcId`} value={npc.npcId} w={160} onChange={e => patch(i, { npcId: e.target.value })} /></Table.Td>
              <Table.Td>
                <Stack gap={2}>
                  <CTextInput size="xs" collabField={`npc[${i}].charId`} value={npc.charId} w={160} onChange={e => patch(i, { charId: e.target.value })} />
                  <Text size="9px" c="dimmed">{getCharName(npc.charId)}</Text>
                </Stack>
              </Table.Td>
              <Table.Td><CTextInput size="xs" collabField={`npc[${i}].skinId`} value={npc.nameCardSkinId} w={160} onChange={e => patch(i, { nameCardSkinId: e.target.value })} /></Table.Td>
              <Table.Td><CNumberInput size="xs" collabField={`npc[${i}].medal`} value={npc.medalCount} min={0} w={70} onChange={v => patch(i, { medalCount: Number(v) })} /></Table.Td>
              <Table.Td><CSelect size="xs" collabField={`npc[${i}].band`} value={npc.bandId} data={bandOptions} searchable w={160} onChange={v => patch(i, { bandId: v || '' })} /></Table.Td>
              <Table.Td><ActionIcon size="sm" variant="subtle" color="red" onClick={() => del(i)}><IconTrash size={12} /></ActionIcon></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MilestoneEditor: milestoneList
// ─────────────────────────────────────────────────────────────────────────────
function MilestoneEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  if (!activeSeason) return null
  const { milestoneList } = activeSeason.data

  const itemTypeOptions: { value: ItemType; label: string }[] = [
    { value: 'GOLD', label: '金币' },
    { value: 'MATERIAL', label: '材料' },
    { value: 'ACTIVITY_ITEM', label: '活动道具' },
    { value: 'CARD_EXP', label: '卡牌经验' },
    { value: 'CHAR_SKIN', label: '干员外观' },
    { value: 'PLAYER_AVATAR', label: '玩家头像' },
  ]

  function patch(i: number, p: Partial<MilestoneList>) {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      milestoneList: d.milestoneList.map((m, idx) => idx === i ? { ...m, ...p } : m),
    }))
  }

  function patchItem(i: number, p: Partial<MilestoneList['rewardItem']>) {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      milestoneList: d.milestoneList.map((m, idx) => idx === i ? { ...m, rewardItem: { ...m.rewardItem, ...p } } : m),
    }))
  }

  function add() {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      milestoneList: [...d.milestoneList, { milestoneId: '', milestoneLvl: 0, tokenNum: 0, rewardItem: { id: '', count: 1, type: 'GOLD' }, availableTime: 0 }],
    }))
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={5}>里程碑列表（milestoneList）</Title>
        <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={add}>新增</Button>
      </Group>
      <Table fz="xs" withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>milestoneId</Table.Th>
            <Table.Th>等级</Table.Th>
            <Table.Th>代币数</Table.Th>
            <Table.Th>奖励类型</Table.Th>
            <Table.Th>奖励 ID</Table.Th>
            <Table.Th>数量</Table.Th>
            <Table.Th>可用时间</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {milestoneList.map((m, i) => (
            <Table.Tr key={i}>
              <Table.Td><CTextInput size="xs" collabField={`ms[${i}].id`} value={m.milestoneId} w={160} onChange={e => patch(i, { milestoneId: e.target.value })} /></Table.Td>
              <Table.Td><CNumberInput size="xs" collabField={`ms[${i}].lvl`} value={m.milestoneLvl} w={70} onChange={v => patch(i, { milestoneLvl: Number(v) })} /></Table.Td>
              <Table.Td><CNumberInput size="xs" collabField={`ms[${i}].token`} value={m.tokenNum} w={80} onChange={v => patch(i, { tokenNum: Number(v) })} /></Table.Td>
              <Table.Td><CSelect size="xs" collabField={`ms[${i}].type`} value={m.rewardItem.type} data={itemTypeOptions} w={110} onChange={v => patchItem(i, { type: v as ItemType })} /></Table.Td>
              <Table.Td><CTextInput size="xs" collabField={`ms[${i}].itemId`} value={m.rewardItem.id} w={140} onChange={e => patchItem(i, { id: e.target.value })} /></Table.Td>
              <Table.Td><CNumberInput size="xs" collabField={`ms[${i}].count`} value={m.rewardItem.count} w={70} min={1} onChange={v => patchItem(i, { count: Number(v) })} /></Table.Td>
              <Table.Td><CNumberInput size="xs" collabField={`ms[${i}].time`} value={m.availableTime} w={100} onChange={v => patch(i, { availableTime: Number(v) })} /></Table.Td>
              <Table.Td>
                <ActionIcon size="xs" variant="subtle" color="red"
                  onClick={() => updateSeason(activeSeasonId!, d => ({ ...d, milestoneList: d.milestoneList.filter((_, j) => j !== i) }))}>
                  <IconTrash size={10} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PlayerTitleEditor: playerTitleDataDict
// ─────────────────────────────────────────────────────────────────────────────
function PlayerTitleEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  if (!activeSeason) return null
  const { playerTitleDataDict } = activeSeason.data
  const keys = Object.keys(playerTitleDataDict) as (keyof typeof playerTitleDataDict)[]

  return (
    <Stack gap="md">
      <Title order={5}>玩家称号（playerTitleDataDict）</Title>
      <Table fz="sm" withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Key</Table.Th>
            <Table.Th>id</Table.Th>
            <Table.Th>picId</Table.Th>
            <Table.Th>txt（显示文本）</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {keys.map(k => {
            const c = playerTitleDataDict[k]
            return (
              <Table.Tr key={k}>
                <Table.Td><Text ff="monospace" size="xs">{k}</Text></Table.Td>
                <Table.Td>
                  <CTextInput size="xs" collabField={`title.${k}.id`} value={c.id} w={160}
                    onChange={e => updateSeason(activeSeasonId!, d => ({ ...d, playerTitleDataDict: { ...d.playerTitleDataDict, [k]: { ...d.playerTitleDataDict[k], id: e.target.value } } }))} />
                </Table.Td>
                <Table.Td>
                  <CTextInput size="xs" collabField={`title.${k}.picId`} value={c.picId} w={160}
                    onChange={e => updateSeason(activeSeasonId!, d => ({ ...d, playerTitleDataDict: { ...d.playerTitleDataDict, [k]: { ...d.playerTitleDataDict[k], picId: e.target.value } } }))} />
                </Table.Td>
                <Table.Td>
                  <CTextInput size="xs" collabField={`title.${k}.txt`} value={c.txt} w={200}
                    onChange={e => updateSeason(activeSeasonId!, d => ({ ...d, playerTitleDataDict: { ...d.playerTitleDataDict, [k]: { ...d.playerTitleDataDict[k], txt: e.target.value } } }))} />
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ConstDataEditor: constData
// ─────────────────────────────────────────────────────────────────────────────
function ConstDataEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  if (!activeSeason) return null
  const { constData } = activeSeason.data

  function patch(p: Partial<typeof constData>) {
    updateSeason(activeSeasonId!, d => ({ ...d, constData: { ...d.constData, ...p } }))
  }

  const enemyTypeOptions = ['INVISIBLE', 'FLY', 'ELEMENT', 'SPECIAL', 'REFLECTION', 'TIMES', 'DOT'].map(v => ({ value: v, label: v }))

  return (
    <Stack gap="md">
      <Title order={5}>常量配置（constData）</Title>
      <Grid gutter="sm">
        <Grid.Col span={3}><CNumberInput label="商店刷新价格" value={constData.shopRefreshPrice} onChange={v => patch({ shopRefreshPrice: Number(v) })} /></Grid.Col>
        <Grid.Col span={3}><CNumberInput label="整备区最大棋子数" value={constData.maxDeckChessCnt} onChange={v => patch({ maxDeckChessCnt: Number(v) })} /></Grid.Col>
        <Grid.Col span={3}><CNumberInput label="战场最大棋子数" value={constData.maxBattleChessCnt} onChange={v => patch({ maxBattleChessCnt: Number(v) })} /></Grid.Col>
        <Grid.Col span={3}><CNumberInput label="仓库上限" value={constData.storeCntMax} onChange={v => patch({ storeCntMax: Number(v) })} /></Grid.Col>
        <Grid.Col span={3}><CNumberInput label="借用次数" value={constData.borrowCount} onChange={v => patch({ borrowCount: Number(v) })} /></Grid.Col>
        <Grid.Col span={3}><CNumberInput label="HP 扣除上限" value={constData.costPlayerHpLimit} onChange={v => patch({ costPlayerHpLimit: Number(v) })} /></Grid.Col>
        <Grid.Col span={3}><CNumberInput label="日常任务参数" value={constData.dailyMissionParam} onChange={v => patch({ dailyMissionParam: Number(v) })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="fallback 盟约 ID" value={constData.fallbackBondId} onChange={e => patch({ fallbackBondId: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="里程碑 ID (milestoneId)" value={constData.milestoneId} onChange={e => patch({ milestoneId: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="里程碑追踪 ID" value={constData.milestoneTrackId} onChange={e => patch({ milestoneTrackId: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="日常任务名称" value={constData.dailyMissionName} onChange={e => patch({ dailyMissionName: e.target.value })} /></Grid.Col>
        <Grid.Col span={12}><CTextInput label="日常任务规则" value={constData.dailyMissionRule} onChange={e => patch({ dailyMissionRule: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="训练关卡盟约 ID (trstageBandId)" value={constData.trstageBandId} onChange={e => patch({ trstageBandId: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="训练关卡 BOSS ID (trstageBossId)" value={constData.trstageBossId} onChange={e => patch({ trstageBossId: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="训练关卡 ID (trStageId)" value={constData.trStageId} onChange={e => patch({ trStageId: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="训练模式 ID (trainingModeId)" value={constData.trainingModeId} onChange={e => patch({ trainingModeId: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="单人逃脱战斗模板 Map" value={constData.escapedBattleTemplateMapSinglePlayer} onChange={e => patch({ escapedBattleTemplateMapSinglePlayer: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="多人逃脱战斗模板 Map" value={constData.escapedBattleTemplateMapMultiPlayer} onChange={e => patch({ escapedBattleTemplateMapMultiPlayer: e.target.value })} /></Grid.Col>
        <Grid.Col span={6}><CTextInput label="WebBusType" value={constData.webBusType} onChange={e => patch({ webBusType: e.target.value })} /></Grid.Col>
      </Grid>
      <Divider label="训练特殊敌人类型 (trSpecialEnemyTypes)" labelPosition="left" />
      <CMultiSelect
        value={constData.trSpecialEnemyTypes}
        data={enemyTypeOptions}
        onChange={v => patch({ trSpecialEnemyTypes: v as any[] })}
      />
      <Divider label="训练盟约 IDs (trBondIds)" labelPosition="left" />
      <KeyListField label="" keys={constData.trBondIds} collabPrefix="trBondIds" onChange={v => patch({ trBondIds: v })} />
      <Divider label="训练禁用盟约 IDs (trBannedBondIds)" labelPosition="left" />
      <KeyListField label="" keys={constData.trBannedBondIds} collabPrefix="trBannedBondIds" onChange={v => patch({ trBannedBondIds: v })} />
    </Stack>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DiyChessEditor: diyChessDict
// ─────────────────────────────────────────────────────────────────────────────
function DiyChessEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  if (!activeSeason) return null
  const { diyChessDict } = activeSeason.data
  const keys = Object.keys(diyChessDict) as (keyof typeof diyChessDict)[]

  return (
    <Stack gap="md">
      <Title order={5}>DIY 棋子映射（diyChessDict）</Title>
      <Text size="sm" c="dimmed">key 为 DIY 棋子的 chessId，value 为对应的实际 charId。</Text>
      <Table fz="sm" withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>DIY chessId (key)</Table.Th>
            <Table.Th>charId (value)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {keys.map(k => (
            <Table.Tr key={k}>
              <Table.Td><Text ff="monospace" size="xs">{k}</Text></Table.Td>
              <Table.Td>
                <CTextInput size="xs" collabField={`diy.${k}`} value={diyChessDict[k]} w={240}
                  onChange={e => updateSeason(activeSeasonId!, d => ({ ...d, diyChessDict: { ...d.diyChessDict, [k]: e.target.value } }))} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EffectChoiceEditor: effectChoiceInfoDict
// ─────────────────────────────────────────────────────────────────────────────
function EffectChoiceEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newId, setNewId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (!activeSeason) return null
  const { effectChoiceInfoDict, effectInfoDataDict } = activeSeason.data
  const list = Object.values(effectChoiceInfoDict).sort((a, b) => a.choiceEventId.localeCompare(b.choiceEventId))
  const editing = editingId ? effectChoiceInfoDict[editingId] : null

  function patch(id: string, p: Partial<typeof editing>) {
    updateSeason(activeSeasonId!, d => ({
      ...d,
      effectChoiceInfoDict: { ...d.effectChoiceInfoDict, [id]: { ...d.effectChoiceInfoDict[id], ...p } },
    }))
  }

  function add() {
    const id = newId.trim()
    if (!id) return
    if (effectChoiceInfoDict[id]) { notifications.show({ title: '已存在', message: `"${id}" 已存在`, color: 'red' }); return }
    updateSeason(activeSeasonId!, d => ({
      ...d,
      effectChoiceInfoDict: {
        ...d.effectChoiceInfoDict,
        [id]: { choiceEventId: id, choiceType: 'BUFF_SELECT', effectType: 'BUFF_GAIN', name: '战术决策' as any, desc: '进行协同调整，做好迎战准备。' as any, typeTxtColor: '#35d8b4' as any },
      },
    }))
    setEditingId(id); closeAdd(); setNewId('')
    notifications.show({ title: '已新增', message: `效果选项 ${id} 已创建`, color: 'teal' })
  }

  function del(id: string) {
    updateSeason(activeSeasonId!, d => { const n = { ...d.effectChoiceInfoDict }; delete n[id]; return { ...d, effectChoiceInfoDict: n } })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
  }

  const choiceTypeOptions: { value: ChoiceType; label: string }[] = [
    { value: 'EQUIP_FREE', label: 'EQUIP_FREE（机密商店）' },
    { value: 'BOUNTY_HUNT', label: 'BOUNTY_HUNT（悬赏决策）' },
    { value: 'BUFF_SELECT', label: 'BUFF_SELECT（战术决策）' },
    { value: 'PERSONAL_CHOOSE', label: 'PERSONAL_CHOOSE（道具补给）' },
  ]

  const effectTypeOptions: { value: EffectType; label: string }[] = [
    { value: 'EQUIP', label: 'EQUIP' },
    { value: 'ENEMY_GAIN', label: 'ENEMY_GAIN' },
    { value: 'BUFF_GAIN', label: 'BUFF_GAIN' },
    { value: 'BAND_INITIAL', label: 'BAND_INITIAL' },
    { value: 'CHAR_MAP', label: 'CHAR_MAP' },
    { value: 'ENEMY', label: 'ENEMY' },
    { value: 'BOND', label: 'BOND' },
  ]

  const effectOptions = [
    { value: '', label: '（无）' },
    ...Object.keys(effectInfoDataDict).map(id => ({ value: id, label: id })),
  ]

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>效果选项列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{list.length}</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>新增</Button>
              </Group>
            </Group>
            <Stack gap="xs" style={{ maxHeight: 600, overflowY: 'auto' }}>
              {list.map(c => (
                <Group key={c.choiceEventId} justify="space-between" wrap="nowrap"
                  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, border: `1px solid ${editingId === c.choiceEventId ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-dark-4)'}` }}
                  onClick={() => setEditingId(c.choiceEventId)}>
                  <div>
                    <Text size="sm" ff="monospace">{c.choiceEventId}</Text>
                    <Group gap="xs">
                      <Badge size="xs" color="blue">{c.choiceType}</Badge>
                      <Badge size="xs" color="teal">{c.effectType}</Badge>
                    </Group>
                  </div>
                  <ActionIcon size="sm" variant="subtle" color="red"
                    onClick={ev => { ev.stopPropagation(); setDeleteConfirm(c.choiceEventId) }}>
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <CollabEditingProvider itemId={editingId}>
          {editing ? (
            <Stack gap="md">
              <Text ff="monospace" size="sm" c="dimmed">{editing.choiceEventId}</Text>
              <Grid gutter="sm">
                <Grid.Col span={6}>
                  <CSelect label="选项类型 (choiceType)" value={editing.choiceType} data={choiceTypeOptions}
                    onChange={v => patch(editing.choiceEventId, { choiceType: v as ChoiceType })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <CSelect label="效果类型 (effectType)" value={editing.effectType} data={effectTypeOptions}
                    onChange={v => patch(editing.choiceEventId, { effectType: v as EffectType })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <CTextInput label="名称 (name)" value={editing.name}
                    onChange={e => patch(editing.choiceEventId, { name: e.target.value as any })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <CTextInput label="颜色 (typeTxtColor)" value={editing.typeTxtColor}
                    onChange={e => patch(editing.choiceEventId, { typeTxtColor: e.target.value as any })} />
                </Grid.Col>
                <Grid.Col span={12}>
                  <CTextarea label="描述 (desc)" value={editing.desc} autosize minRows={2}
                    onChange={e => patch(editing.choiceEventId, { desc: e.target.value as any })} />
                </Grid.Col>
              </Grid>
            </Stack>
          ) : <Text c="dimmed" ta="center" mt="xl">← 选择左侧条目</Text>}
          </CollabEditingProvider>
        </Grid.Col>
      </Grid>
      <Modal opened={addOpened} onClose={closeAdd} title="新增效果选项" size="sm">
        <Stack gap="md">
          <CTextInput label="choiceEventId" value={newId} onChange={e => setNewId(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <Group justify="flex-end"><Button variant="subtle" onClick={closeAdd}>取消</Button><Button onClick={add} disabled={!newId.trim()}>创建</Button></Group>
        </Stack>
      </Modal>
      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除" size="sm">
        <Stack gap="md">
          <Text>确定删除 <Text span fw={700} c="red">{deleteConfirm}</Text>？</Text>
          <Group justify="flex-end"><Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button><Button color="red" onClick={() => deleteConfirm && del(deleteConfirm)}>删除</Button></Group>
        </Stack>
      </Modal>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 公共辅助组件：可增删 string[] 的列表
// ─────────────────────────────────────────────────────────────────────────────
function KeyListField({ label, keys, onChange, collabPrefix }: { label: string; keys: string[]; onChange: (v: string[]) => void; collabPrefix?: string }) {
  return (
    <Stack gap="xs">
      {label && <Text size="sm" fw={500}>{label}</Text>}
      {keys.map((k, i) => (
        <Group key={i} gap="xs">
          <CTextInput size="xs" collabField={collabPrefix ? `${collabPrefix}[${i}]` : undefined} value={k} style={{ flex: 1 }}
            onChange={e => { const n = [...keys]; n[i] = e.target.value; onChange(n) }} />
          <ActionIcon size="xs" variant="subtle" color="red" onClick={() => onChange(keys.filter((_, j) => j !== i))}>
            <IconTrash size={10} />
          </ActionIcon>
        </Group>
      ))}
      <Button size="xs" variant="subtle" leftSection={<IconPlus size={10} />} w="fit-content"
        onClick={() => onChange([...keys, ''])}>添加</Button>
    </Stack>
  )
}
