import {
  Stack, Card, Group, Text, Badge, Grid, NumberInput, Textarea,
  ActionIcon, Title, TextInput, MultiSelect, Divider,
  ScrollArea, Tooltip, Box, Button, Modal, Select,
} from '@mantine/core'
import { IconEdit, IconTrash, IconPlus, IconExternalLink } from '@tabler/icons-react'
import { useState, useMemo, useEffect } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { BondInfoDict, ActiveCondition, ActiveType } from '../../autochess-season-data'
import { activeConditionLabel, getCharName } from '../../store/utils'
import { RichTextPreview } from '../shared/RichTextPreview'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

const DEFAULT_BOND: Omit<BondInfoDict, 'bondId'> = {
  name: '新盟约',
  desc: '',
  iconId: '',
  activeCount: 1,
  effectId: '',
  activeType: 'BATTLE',
  activeCondition: 'BOARD',
  activeConditionTemplate: 'count_threshold_upward',
  activeParamList: ['2'],
  maxInactiveBondCount: 0,
  identifier: 0,
  weight: 100,
  isActiveInDeck: false,
  descParamBaseList: [],
  descParamPerStackList: [],
  noStack: false,
  chessIdList: [],
}

export function BondsEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason, focusId, setFocusId, navigateTo } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newBondId, setNewBondId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // 响应外部跳转聚焦
  useEffect(() => {
    if (focusId && activeSeason?.data.bondInfoDict && focusId in activeSeason.data.bondInfoDict) {
      setEditingId(focusId)
      setFocusId(null)
    }
  }, [focusId, activeSeason, setFocusId])

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const bonds = activeSeason.data.bondInfoDict
  const { charShopChessDatas, effectInfoDataDict } = activeSeason.data

  const chessNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [chessId, shopData] of Object.entries(charShopChessDatas)) {
      map[chessId] = getCharName(shopData.charId)
    }
    return map
  }, [charShopChessDatas])

  const bondList = Object.values(bonds).sort((a, b) => a.identifier - b.identifier)
  const filtered = search
    ? bondList.filter(b => b.name.includes(search) || b.bondId.includes(search))
    : bondList

  const editing = editingId ? bonds[editingId] : null

  function patchBond(id: string, patch: Partial<BondInfoDict>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      bondInfoDict: { ...data.bondInfoDict, [id]: { ...data.bondInfoDict[id], ...patch } },
    }))
  }

  /** 新增后自动重排 identifier */
  function addBond() {
    const id = newBondId.trim()
    if (!id) return
    if (bonds[id]) {
      notifications.show({ title: '已存在', message: `bondId "${id}" 已存在`, color: 'red' })
      return
    }
    const maxId = Math.max(...Object.values(bonds).map(b => b.identifier), -1)
    updateSeason(activeSeasonId!, data => ({
      ...data,
      bondInfoDict: {
        ...data.bondInfoDict,
        [id]: { ...DEFAULT_BOND, bondId: id, identifier: maxId + 1 },
      },
    }))
    setEditingId(id)
    closeAdd()
    setNewBondId('')
    notifications.show({ title: '已新增', message: `盟约 ${id} 已创建`, color: 'teal' })
  }

  function deleteBond(id: string) {
    updateSeason(activeSeasonId!, data => {
      const next = { ...data.bondInfoDict }
      delete next[id]
      // 重排 identifier
      let i = 0
      for (const k of Object.keys(next)) next[k] = { ...next[k], identifier: i++ }
      return { ...data, bondInfoDict: next }
    })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
    notifications.show({ title: '已删除', message: `盟约 ${id} 已删除`, color: 'orange' })
  }

  const allChessOptions = Object.entries(charShopChessDatas)
    .filter(([, v]) => !v.isHidden)
    .map(([chessId]) => ({
      value: chessId,
      label: `${chessNames[chessId] ?? chessId}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const effectOptions = [
    { value: '', label: '（无）' },
    ...Object.entries(effectInfoDataDict).map(([id, e]) => ({
      value: id,
      label: e.effectName ? `${e.effectName} (${id})` : id,
    })),
  ]

  const editingEffect = editing?.effectId ? effectInfoDataDict[editing.effectId] : null

  const activeConditionOptions = [
    { value: 'BOARD', label: '场上 (BOARD)' },
    { value: 'BOARD_AND_DECK', label: '场上+整备区 (BOARD_AND_DECK)' },
    { value: 'BOARD_ALL_CHESS', label: '全棋子 (BOARD_ALL_CHESS)' },
  ]

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>盟约列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{bondList.length} 个</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>
                  新增
                </Button>
              </Group>
            </Group>
            <TextInput
              placeholder="搜索盟约名或 ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              size="xs"
            />
            <ScrollArea h={600}>
              <Stack gap="xs">
                {filtered.map(bond => (
                  <Card
                    key={bond.bondId}
                    padding="sm"
                    radius="md"
                    withBorder
                    style={{ cursor: 'pointer', borderColor: editingId === bond.bondId ? 'var(--mantine-color-teal-6)' : undefined }}
                    onClick={() => setEditingId(bond.bondId)}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Group gap="xs">
                          <Text fw={500} size="sm">{bond.name}</Text>
                          <Badge size="xs" color="teal" variant="light">
                            {bond.chessIdList.length}人
                          </Badge>
                        </Group>
                        <RichTextPreview text={bond.desc} maxLen={40} />
                      </div>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          size="sm" variant="subtle" color="red"
                          onClick={e => { e.stopPropagation(); setDeleteConfirm(bond.bondId) }}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          {editing ? (
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={5}>编辑：{editing.name}</Title>
                <Text size="xs" c="dimmed" ff="monospace">{editing.bondId}</Text>
              </Group>

              <Grid gutter="sm">
                <Grid.Col span={6}>
                  <TextInput label="盟约名称" value={editing.name} onChange={e => patchBond(editing.bondId, { name: e.target.value })} />
                </Grid.Col>
                <Grid.Col span={3}>
                  <NumberInput label="权重" value={editing.weight} onChange={v => patchBond(editing.bondId, { weight: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={3}>
                  <NumberInput
                    label="激活所需人数"
                    value={editing.activeCount}
                    min={1}
                    onChange={v => patchBond(editing.bondId, { activeCount: Number(v) })}
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Textarea label="描述（富文本）" value={editing.desc} autosize minRows={3} onChange={e => patchBond(editing.bondId, { desc: e.target.value })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Select
                    label="激活条件"
                    value={editing.activeCondition}
                    data={activeConditionOptions}
                    onChange={v => patchBond(editing.bondId, { activeCondition: v as ActiveCondition })}
                  />
                </Grid.Col>
                <Grid.Col span={3}>
                  <NumberInput
                    label="最大未激活层数"
                    value={editing.maxInactiveBondCount}
                    min={0}
                    onChange={v => patchBond(editing.bondId, { maxInactiveBondCount: Number(v) })}
                  />
                </Grid.Col>
              </Grid>

              <Divider label="关联效果" labelPosition="left" />
              <Group gap="xs" align="flex-end">
                <Box style={{ flex: 1 }}>
                  <Select
                    label="效果 ID"
                    value={editing.effectId}
                    data={effectOptions}
                    searchable
                    onChange={v => patchBond(editing.bondId, { effectId: v ?? '' })}
                  />
                </Box>
                {editing.effectId && (
                  <Tooltip label="跳转到效果编辑">
                    <ActionIcon
                      mb={2}
                      variant="light"
                      color="teal"
                      onClick={() => navigateTo('effects', editing.effectId)}
                    >
                      <IconExternalLink size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>
              {editingEffect && (
                <Card withBorder padding="sm" bg="dark.7">
                  <Group gap="xs" mb={4}>
                    <Text fw={500} size="sm">{editingEffect.effectName || editingEffect.effectId}</Text>
                    <Badge size="xs" color="teal">{editingEffect.effectType}</Badge>
                    <Badge size="xs" color="gray">
                      持续 {editingEffect.continuedRound === -1 ? '永久' : `${editingEffect.continuedRound}回合`}
                    </Badge>
                  </Group>
                  <RichTextPreview text={editingEffect.effectDesc} maxLen={120} />
                </Card>
              )}

              <Divider label={`所属棋子（${editing.chessIdList.length} 个）`} labelPosition="left" />
              <MultiSelect
                placeholder="选择棋子..."
                searchable
                value={editing.chessIdList}
                data={allChessOptions}
                onChange={v => patchBond(editing.bondId, { chessIdList: v })}
                maxDropdownHeight={200}
              />
              <Group gap="xs" wrap="wrap">
                {editing.chessIdList.map(chessId => (
                  <Tooltip key={chessId} label={chessId}>
                    <Badge
                      variant="light" color="teal" size="sm"
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigateTo('chess', chessId)}
                    >
                      {chessNames[chessId] ?? chessId} ↗
                    </Badge>
                  </Tooltip>
                ))}
              </Group>

              <Divider label="激活参数" labelPosition="left" />
              <Group gap="xs">
                {editing.activeParamList.map((p, i) => (
                  <TextInput
                    key={i}
                    label={`参数 ${i + 1}`}
                    value={p}
                    w={100}
                    onChange={e => {
                      const next = [...editing.activeParamList]
                      next[i] = e.target.value
                      patchBond(editing.bondId, { activeParamList: next })
                    }}
                  />
                ))}
                <ActionIcon
                  mt="xl" variant="light" color="teal"
                  onClick={() => patchBond(editing.bondId, { activeParamList: [...editing.activeParamList, ''] })}
                >
                  <IconPlus size={14} />
                </ActionIcon>
                {editing.activeParamList.length > 0 && (
                  <ActionIcon
                    mt="xl" variant="light" color="red"
                    onClick={() => patchBond(editing.bondId, { activeParamList: editing.activeParamList.slice(0, -1) })}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                )}
              </Group>
            </Stack>
          ) : (
            <Card withBorder padding="xl" ta="center">
              <Text c="dimmed">← 选择左侧盟约进行编辑</Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>

      {/* 新增盟约 Modal */}
      <Modal opened={addOpened} onClose={closeAdd} title="新增盟约" size="sm">
        <Stack gap="md">
          <TextInput
            label="盟约 ID（bondId）"
            placeholder="如 newBondShip"
            value={newBondId}
            onChange={e => setNewBondId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addBond()}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAdd}>取消</Button>
            <Button onClick={addBond} disabled={!newBondId.trim()}>创建</Button>
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
          <Text>确定要删除盟约 <Text span fw={700} c="red">{deleteConfirm}</Text> 吗？</Text>
          <Text size="sm" c="dimmed">此操作不可撤销。盟约 ID 会从其他关联数据中移除。</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="red" onClick={() => deleteConfirm && deleteBond(deleteConfirm)}>删除</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
