import {
  Stack, Card, Group, Text, Badge, Grid, NumberInput,
  ActionIcon, Title, TextInput, Select, Divider,
  ScrollArea, Switch, SegmentedControl, Tooltip,
  Button, Modal,
} from '@mantine/core'
import { IconEdit, IconExternalLink, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState, useMemo } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { TrapChessDataDict, ItemTypeEnum } from '../../autochess-season-data'
import { getCharName } from '../../store/utils'
import { RichTextPreview } from '../shared/RichTextPreview'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

const DEFAULT_TRAP: Omit<TrapChessDataDict, 'chessId' | 'identifier'> = {
  charId: '',
  isGolden: false,
  purchasePrice: 0,
  status: { evolvePhase: 'PHASE_0', trapLevel: 1, skillIndex: 0, skillLevel: 1 },
  upgradeChessId: null,
  upgradeNum: 3,
  trapDuration: -1,
  effectId: '',
  giveBondId: null,
  givePowerId: null,
  canGiveBond: false,
  itemType: 'EQUIP',
}

export function TrapsEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason, navigateTo } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newChessId, setNewChessId] = useState('')
  const [newItemType, setNewItemType] = useState<ItemTypeEnum>('EQUIP')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const { trapChessDataDict, effectInfoDataDict, bondInfoDict } = activeSeason.data

  const trapList = useMemo(() => {
    return Object.values(trapChessDataDict)
      .sort((a, b) => a.identifier - b.identifier)
  }, [trapChessDataDict])

  const filtered = useMemo(() => {
    return trapList.filter(t => {
      const name = getCharName(t.charId)
      const typeOk = typeFilter === 'all' || t.itemType === typeFilter
      const searchOk = !search || name.includes(search) || t.chessId.includes(search) || t.charId.includes(search)
      return typeOk && searchOk
    })
  }, [trapList, search, typeFilter])

  const editing = editingId ? trapChessDataDict[editingId] : null
  const editingEffect = editing ? effectInfoDataDict[editing.effectId] : null
  const editingBond = editing?.giveBondId ? bondInfoDict[editing.giveBondId] : null

  function patchTrap(id: string, patch: Partial<TrapChessDataDict>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      trapChessDataDict: { ...data.trapChessDataDict, [id]: { ...data.trapChessDataDict[id], ...patch } },
    }))
  }

  function addTrap() {
    const id = newChessId.trim()
    if (!id) return
    if (trapChessDataDict[id]) {
      notifications.show({ title: '已存在', message: `chessId "${id}" 已存在`, color: 'red' })
      return
    }
    const maxId = Math.max(...Object.values(trapChessDataDict).map(t => t.identifier), -1)
    updateSeason(activeSeasonId!, data => ({
      ...data,
      trapChessDataDict: {
        ...data.trapChessDataDict,
        [id]: { ...DEFAULT_TRAP, chessId: id, identifier: maxId + 1, itemType: newItemType },
      },
    }))
    setEditingId(id)
    closeAdd()
    setNewChessId('')
    setNewItemType('EQUIP')
    notifications.show({ title: '已新增', message: `${newItemType === 'EQUIP' ? '装备' : '法术'} ${id} 已创建`, color: 'teal' })
  }

  function deleteTrap(id: string) {
    updateSeason(activeSeasonId!, data => {
      const next = { ...data.trapChessDataDict }
      delete next[id]
      return { ...data, trapChessDataDict: next }
    })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
    notifications.show({ title: '已删除', message: `${id} 已删除`, color: 'orange' })
  }

  const bondOptions = [
    { value: '', label: '（无）' },
    ...Object.entries(bondInfoDict).map(([id, b]) => ({ value: id, label: b.name })),
  ]
  const effectOptions = Object.entries(effectInfoDataDict).map(([id, e]) => ({
    value: id,
    label: `${e.effectName || id}`,
  }))

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>装备/法术列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{filtered.length}/{trapList.length}</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>
                  新增
                </Button>
              </Group>
            </Group>
            <TextInput
              placeholder="搜索名称或 ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              size="xs"
            />
            <SegmentedControl
              size="xs"
              value={typeFilter}
              onChange={setTypeFilter}
              data={[
                { value: 'all', label: '全部' },
                { value: 'EQUIP', label: '装备' },
                { value: 'MAGIC', label: '法术' },
              ]}
            />
            <ScrollArea h={500}>
              <Stack gap="xs">
                {filtered.map(trap => {
                  const name = getCharName(trap.charId)
                  return (
                    <Card
                      key={trap.chessId}
                      padding="sm"
                      radius="md"
                      withBorder
                      style={{
                        cursor: 'pointer',
                        borderColor: editingId === trap.chessId ? 'var(--mantine-color-teal-6)' : undefined,
                      }}
                      onClick={() => setEditingId(trap.chessId)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <div style={{ minWidth: 0 }}>
                          <Group gap="xs">
                            <Text fw={500} size="sm" truncate>{name || trap.chessId}</Text>
                            <Badge size="xs" color={trap.itemType === 'EQUIP' ? 'blue' : 'violet'} variant="light">
                              {trap.itemType === 'EQUIP' ? '装备' : '法术'}
                            </Badge>
                            {trap.isGolden && <Badge size="xs" color="yellow">进阶</Badge>}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {trap.purchasePrice} 金 · 持续{trap.trapDuration === -1 ? '永久' : `${trap.trapDuration}s`}
                          </Text>
                        </div>
                        <Group gap={4} wrap="nowrap">
                          <ActionIcon
                            size="sm" variant="subtle" color="red"
                            onClick={e => { e.stopPropagation(); setDeleteConfirm(trap.chessId) }}
                          >
                            <IconTrash size={12} />
                          </ActionIcon>
                          <ActionIcon size="sm" variant="subtle" color="teal">
                            <IconEdit size={14} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </Card>
                  )
                })}
              </Stack>
            </ScrollArea>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          {editing ? (
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={5}>编辑：{getCharName(editing.charId) || editing.chessId}</Title>
                <Text size="xs" c="dimmed" ff="monospace">{editing.chessId}</Text>
              </Group>

              <Grid gutter="sm">
                <Grid.Col span={4}>
                  <Select
                    label="物品类型"
                    value={editing.itemType}
                    data={[
                      { value: 'EQUIP', label: '装备 (EQUIP)' },
                      { value: 'MAGIC', label: '法术 (MAGIC)' },
                    ]}
                    onChange={v => patchTrap(editing.chessId, { itemType: v as ItemTypeEnum })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <NumberInput
                    label="购买价格（金）"
                    value={editing.purchasePrice}
                    min={0}
                    onChange={v => patchTrap(editing.chessId, { purchasePrice: Number(v) })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <NumberInput
                    label="持续时间（秒，-1=永久）"
                    value={editing.trapDuration}
                    min={-1}
                    onChange={v => patchTrap(editing.chessId, { trapDuration: Number(v) })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <NumberInput
                    label="升级所需数量"
                    value={editing.upgradeNum}
                    min={1}
                    onChange={v => patchTrap(editing.chessId, { upgradeNum: Number(v) })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <Switch
                    label="是否进阶"
                    checked={editing.isGolden}
                    onChange={e => patchTrap(editing.chessId, { isGolden: e.target.checked })}
                    mt="xl"
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <Switch
                    label="可提供盟约"
                    checked={editing.canGiveBond}
                    onChange={e => patchTrap(editing.chessId, { canGiveBond: e.target.checked })}
                    mt="xl"
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Select
                    label="所属盟约"
                    value={editing.giveBondId ?? ''}
                    data={bondOptions}
                    searchable
                    onChange={v => patchTrap(editing.chessId, { giveBondId: v || null })}
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Group gap="xs" align="flex-end">
                    <div style={{ flex: 1 }}>
                      <Select
                        label="效果 ID"
                        value={editing.effectId}
                        data={effectOptions}
                        searchable
                        onChange={v => patchTrap(editing.chessId, { effectId: v! })}
                      />
                    </div>
                    {editing.effectId && (
                      <Tooltip label="跳转到效果编辑">
                        <ActionIcon mb={2} variant="light" color="teal" onClick={() => navigateTo('effects', editing.effectId)}>
                          <IconExternalLink size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Grid.Col>
              </Grid>

              {editingEffect && (
                <>
                  <Divider label="关联效果" labelPosition="left" />
                  <Card withBorder padding="sm">
                    <Group gap="xs" mb={4}>
                      <Text fw={500} size="sm">{editingEffect.effectName || editingEffect.effectId}</Text>
                      <Badge size="xs" color="teal">{editingEffect.effectType}</Badge>
                      <Badge size="xs" color="gray">持续 {editingEffect.continuedRound === -1 ? '永久' : `${editingEffect.continuedRound}回合`}</Badge>
                    </Group>
                    <RichTextPreview text={editingEffect.effectDesc} maxLen={120} />
                  </Card>
                </>
              )}

              {editingBond && (
                <>
                  <Divider label="所属盟约" labelPosition="left" />
                  <Card withBorder padding="sm">
                    <Text fw={500} size="sm">{editingBond.name}</Text>
                    <RichTextPreview text={editingBond.desc} maxLen={100} />
                  </Card>
                </>
              )}
            </Stack>
          ) : (
            <Card withBorder padding="xl" ta="center">
              <Text c="dimmed">← 选择左侧装备进行编辑</Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>

      {/* 新增 Modal */}
      <Modal opened={addOpened} onClose={closeAdd} title="新增装备/法术" size="sm">
        <Stack gap="md">
          <TextInput
            label="Chess ID（chessId）"
            placeholder="如 trap_equip_001"
            value={newChessId}
            onChange={e => setNewChessId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTrap()}
          />
          <Select
            label="物品类型"
            value={newItemType}
            data={[
              { value: 'EQUIP', label: '装备 (EQUIP)' },
              { value: 'MAGIC', label: '法术 (MAGIC)' },
            ]}
            onChange={v => setNewItemType(v as ItemTypeEnum)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAdd}>取消</Button>
            <Button onClick={addTrap} disabled={!newChessId.trim()}>创建</Button>
          </Group>
        </Stack>
      </Modal>

      {/* 删除确认 Modal */}
      <Modal
        opened={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="确认删除"
        size="sm"
      >
        <Stack gap="md">
          <Text>确定要删除 <Text span fw={700} c="red">{deleteConfirm}</Text> 吗？</Text>
          <Text size="sm" c="dimmed">此操作不可撤销。</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="red" onClick={() => deleteConfirm && deleteTrap(deleteConfirm)}>删除</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
