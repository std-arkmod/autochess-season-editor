import {
  Stack, Card, Group, Text, Badge, Grid, NumberInput,
  ActionIcon, Title, TextInput, Select, Divider,
  ScrollArea, Switch, Table, SegmentedControl, Tooltip,
} from '@mantine/core'
import { IconEdit, IconExternalLink } from '@tabler/icons-react'
import { useState, useMemo } from 'react'
import type { TrapChessDataDict, ItemTypeEnum } from '../../autochess-season-data'
import { getCharName } from '../../store/utils'
import { RichTextPreview } from '../shared/RichTextPreview'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

export function TrapsEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason, navigateTo } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const { trapChessDataDict, trapShopChessDatas, effectInfoDataDict, bondInfoDict } = activeSeason.data

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

  const bondOptions = [
    { value: '', label: '（无）' },
    ...Object.entries(bondInfoDict).map(([id, b]) => ({ value: id, label: b.name })),
  ]
  const effectOptions = Object.entries(effectInfoDataDict).map(([id, e]) => ({
    value: id,
    label: `${e.effectName || id}`,
  }))

  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>装备/法术列表</Title>
            <Text size="xs" c="dimmed">{filtered.length}/{trapList.length}</Text>
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
          <ScrollArea h={540}>
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
                          <Text fw={500} size="sm" truncate>{name}</Text>
                          <Badge size="xs" color={trap.itemType === 'EQUIP' ? 'blue' : 'violet'} variant="light">
                            {trap.itemType === 'EQUIP' ? '装备' : '法术'}
                          </Badge>
                          {trap.isGolden && <Badge size="xs" color="yellow">进阶</Badge>}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {trap.purchasePrice} 金 · 持续{trap.trapDuration === -1 ? '永久' : `${trap.trapDuration}s`}
                        </Text>
                      </div>
                      <ActionIcon size="sm" variant="subtle" color="teal">
                        <IconEdit size={14} />
                      </ActionIcon>
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
              <Title order={5}>编辑：{getCharName(editing.charId)}</Title>
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
  )
}
