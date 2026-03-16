import {
  Stack, Card, Group, Text, Badge, Grid, NumberInput,
  ActionIcon, Title, TextInput, ScrollArea, Divider,
  Button, Modal, Select, Textarea, Table,
} from '@mantine/core'
import { IconTrash, IconPlus } from '@tabler/icons-react'
import { useState, useMemo, useEffect } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { effectTypeLabel } from '../../store/utils'
import { RichTextPreview } from '../shared/RichTextPreview'
import type { DataStore } from '../../store/dataStore'
import type { EffectInfoDataDict, EffectType } from '../../autochess-season-data'

interface Props { store: DataStore }

const EFFECT_TYPES: EffectType[] = ['EQUIP', 'ENEMY_GAIN', 'BUFF_GAIN', 'BAND_INITIAL', 'CHAR_MAP', 'ENEMY', 'BOND']

const DEFAULT_EFFECT: Omit<EffectInfoDataDict, 'effectId'> = {
  effectType: 'BUFF_GAIN',
  effectCounterType: 'NONE',
  continuedRound: -1,
  effectName: '新效果',
  effectDesc: '',
  effectDecoIconId: null,
  enemyPrice: 0,
}

export function EffectsEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason, focusId, setFocusId } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newEffectId, setNewEffectId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // 响应外部跳转聚焦
  useEffect(() => {
    if (focusId && activeSeason?.data.effectInfoDataDict && focusId in activeSeason.data.effectInfoDataDict) {
      setEditingId(focusId)
      setFocusId(null)
    }
  }, [focusId, activeSeason, setFocusId])

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const { effectInfoDataDict, effectBuffInfoDataDict } = activeSeason.data

  const effectList = useMemo(() =>
    Object.values(effectInfoDataDict).sort((a, b) => a.effectId.localeCompare(b.effectId)),
    [effectInfoDataDict]
  )
  const filtered = search
    ? effectList.filter(e => e.effectId.includes(search) || e.effectName.includes(search) || e.effectType.includes(search))
    : effectList

  const editing = editingId ? effectInfoDataDict[editingId] : null
  const editingBuffs = editingId ? (effectBuffInfoDataDict[editingId] ?? []) : []

  function patchEffect(id: string, patch: Partial<EffectInfoDataDict>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      effectInfoDataDict: { ...data.effectInfoDataDict, [id]: { ...data.effectInfoDataDict[id], ...patch } },
    }))
  }

  /** 更新某个 buff 条目整体 */
  function patchBuff(effectId: string, buffIdx: number, patch: Partial<(typeof editingBuffs)[0]>) {
    updateSeason(activeSeasonId!, data => {
      const buffs = [...(data.effectBuffInfoDataDict[effectId] ?? [])]
      buffs[buffIdx] = { ...buffs[buffIdx], ...patch }
      return { ...data, effectBuffInfoDataDict: { ...data.effectBuffInfoDataDict, [effectId]: buffs } }
    })
  }

  /** 更新某 buff 的某行 blackboard */
  function patchBlackboard(effectId: string, buffIdx: number, bbIdx: number, patch: Partial<{ key: string; value: number; valueStr: string | null }>) {
    updateSeason(activeSeasonId!, data => {
      const buffs = [...(data.effectBuffInfoDataDict[effectId] ?? [])]
      const bb = [...buffs[buffIdx].blackboard]
      bb[bbIdx] = { ...bb[bbIdx], ...patch }
      buffs[buffIdx] = { ...buffs[buffIdx], blackboard: bb }
      return { ...data, effectBuffInfoDataDict: { ...data.effectBuffInfoDataDict, [effectId]: buffs } }
    })
  }

  function addBlackboardRow(effectId: string, buffIdx: number) {
    updateSeason(activeSeasonId!, data => {
      const buffs = [...(data.effectBuffInfoDataDict[effectId] ?? [])]
      const bb = [...buffs[buffIdx].blackboard, { key: 'new_key', value: 0, valueStr: null }]
      buffs[buffIdx] = { ...buffs[buffIdx], blackboard: bb }
      return { ...data, effectBuffInfoDataDict: { ...data.effectBuffInfoDataDict, [effectId]: buffs } }
    })
  }

  function removeBlackboardRow(effectId: string, buffIdx: number, bbIdx: number) {
    updateSeason(activeSeasonId!, data => {
      const buffs = [...(data.effectBuffInfoDataDict[effectId] ?? [])]
      const bb = buffs[buffIdx].blackboard.filter((_, i) => i !== bbIdx)
      buffs[buffIdx] = { ...buffs[buffIdx], blackboard: bb }
      return { ...data, effectBuffInfoDataDict: { ...data.effectBuffInfoDataDict, [effectId]: buffs } }
    })
  }

  function addBuffEntry(effectId: string) {
    updateSeason(activeSeasonId!, data => {
      const buffs = [...(data.effectBuffInfoDataDict[effectId] ?? []), { key: effectId, blackboard: [], countType: 'NONE' as const }]
      return { ...data, effectBuffInfoDataDict: { ...data.effectBuffInfoDataDict, [effectId]: buffs } }
    })
  }

  function removeBuffEntry(effectId: string, buffIdx: number) {
    updateSeason(activeSeasonId!, data => {
      const buffs = (data.effectBuffInfoDataDict[effectId] ?? []).filter((_, i) => i !== buffIdx)
      return { ...data, effectBuffInfoDataDict: { ...data.effectBuffInfoDataDict, [effectId]: buffs } }
    })
  }

  function addEffect() {
    const id = newEffectId.trim()
    if (!id) return
    if (effectInfoDataDict[id]) {
      notifications.show({ title: '已存在', message: `effectId "${id}" 已存在`, color: 'red' })
      return
    }
    updateSeason(activeSeasonId!, data => ({
      ...data,
      effectInfoDataDict: {
        ...data.effectInfoDataDict,
        [id]: { ...DEFAULT_EFFECT, effectId: id },
      },
    }))
    setEditingId(id)
    closeAdd()
    setNewEffectId('')
    notifications.show({ title: '已新增', message: `效果 ${id} 已创建`, color: 'teal' })
  }

  function deleteEffect(id: string) {
    updateSeason(activeSeasonId!, data => {
      const nextEffects = { ...data.effectInfoDataDict }
      delete nextEffects[id]
      const nextBuffs = { ...data.effectBuffInfoDataDict }
      delete nextBuffs[id]
      return { ...data, effectInfoDataDict: nextEffects, effectBuffInfoDataDict: nextBuffs }
    })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
    notifications.show({ title: '已删除', message: `效果 ${id} 已删除`, color: 'orange' })
  }

  const effectTypeOptions = EFFECT_TYPES.map(t => ({
    value: t,
    label: `${effectTypeLabel[t] ?? t} (${t})`,
  }))

  const decoIconOptions = [
    { value: '', label: '（无）' },
    { value: 'icon_team_buff', label: 'icon_team_buff（队伍增益）' },
    { value: 'icon_player_buff', label: 'icon_player_buff（玩家增益）' },
    { value: 'icon_enemy_debuff', label: 'icon_enemy_debuff（敌人减益）' },
    { value: 'icon_boss_debuff', label: 'icon_boss_debuff（BOSS减益）' },
    { value: 'icon_stage_buff', label: 'icon_stage_buff（关卡增益）' },
  ]

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>效果列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{filtered.length}/{effectList.length}</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>
                  新增
                </Button>
              </Group>
            </Group>
            <TextInput
              placeholder="搜索效果名、ID 或类型..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              size="xs"
            />
            <ScrollArea h={600}>
              <Stack gap="xs">
                {filtered.map(effect => (
                  <Card
                    key={effect.effectId}
                    padding="sm"
                    radius="md"
                    withBorder
                    style={{ cursor: 'pointer', borderColor: editingId === effect.effectId ? 'var(--mantine-color-teal-6)' : undefined }}
                    onClick={() => setEditingId(effect.effectId)}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Group gap="xs">
                          <Text fw={500} size="sm" truncate>{effect.effectName || effect.effectId}</Text>
                          <Badge size="xs" color="teal" variant="light">
                            {effectTypeLabel[effect.effectType] ?? effect.effectType}
                          </Badge>
                        </Group>
                        <RichTextPreview text={effect.effectDesc} maxLen={40} />
                      </div>
                      <ActionIcon
                        size="sm" variant="subtle" color="red"
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(effect.effectId) }}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
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
                <Title order={5}>编辑效果</Title>
                <Text size="xs" c="dimmed" ff="monospace">{editing.effectId}</Text>
              </Group>

              <Grid gutter="sm">
                <Grid.Col span={6}>
                  <TextInput
                    label="效果名称"
                    value={editing.effectName}
                    onChange={e => patchEffect(editing.effectId, { effectName: e.target.value })}
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Select
                    label="效果类型"
                    value={editing.effectType}
                    data={effectTypeOptions}
                    onChange={v => patchEffect(editing.effectId, { effectType: v as EffectType })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <NumberInput
                    label="持续回合（-1=永久）"
                    value={editing.continuedRound}
                    min={-1}
                    onChange={v => patchEffect(editing.effectId, { continuedRound: Number(v) })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <NumberInput
                    label="敌人价格"
                    value={editing.enemyPrice}
                    min={0}
                    onChange={v => patchEffect(editing.effectId, { enemyPrice: Number(v) })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <Select
                    label="装饰图标"
                    value={editing.effectDecoIconId ?? ''}
                    data={decoIconOptions}
                    onChange={v => patchEffect(editing.effectId, { effectDecoIconId: (v || null) as any })}
                  />
                </Grid.Col>
                <Grid.Col span={12}>
                  <Textarea
                    label="效果描述（富文本）"
                    value={editing.effectDesc}
                    autosize
                    minRows={3}
                    onChange={e => patchEffect(editing.effectId, { effectDesc: e.target.value })}
                  />
                </Grid.Col>
              </Grid>

              <Divider label="描述预览" labelPosition="left" />
              <Card withBorder padding="sm" bg="dark.7">
                <RichTextPreview text={editing.effectDesc} maxLen={300} />
              </Card>

              <Divider
                label={
                  <Group gap="xs">
                    <Text size="xs">效果数值（{editingBuffs.length} 条）</Text>
                    <ActionIcon size="xs" variant="light" color="teal" onClick={() => editing && addBuffEntry(editing.effectId)}>
                      <IconPlus size={10} />
                    </ActionIcon>
                  </Group>
                }
                labelPosition="left"
              />
              {editingBuffs.map((buff, bi) => (
                <Card key={bi} withBorder padding="sm">
                  <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                      <TextInput
                        size="xs" label="Buff Key" value={buff.key} w={200}
                        onChange={e => editing && patchBuff(editing.effectId, bi, { key: e.target.value })}
                      />
                      <Select
                        size="xs" label="计数类型" value={buff.countType} w={120}
                        data={[{ value: 'NONE', label: 'NONE' }, { value: 'COUNTING', label: 'COUNTING' }]}
                        onChange={v => editing && patchBuff(editing.effectId, bi, { countType: v as any })}
                      />
                    </Group>
                    <ActionIcon size="sm" variant="subtle" color="red" mt="xl"
                      onClick={() => editing && removeBuffEntry(editing.effectId, bi)}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Group>
                  <Table fz="xs" withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Key</Table.Th>
                        <Table.Th>Value</Table.Th>
                        <Table.Th>ValueStr</Table.Th>
                        <Table.Th w={30}></Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {buff.blackboard.map((bb, i) => (
                        <Table.Tr key={i}>
                          <Table.Td>
                            <TextInput size="xs" value={bb.key} w={140}
                              onChange={e => editing && patchBlackboard(editing.effectId, bi, i, { key: e.target.value })} />
                          </Table.Td>
                          <Table.Td>
                            <NumberInput size="xs" value={bb.value} step={0.01} decimalScale={4} w={100}
                              onChange={v => editing && patchBlackboard(editing.effectId, bi, i, { value: Number(v) })} />
                          </Table.Td>
                          <Table.Td>
                            <TextInput size="xs" value={bb.valueStr ?? ''} placeholder="null" w={100}
                              onChange={e => editing && patchBlackboard(editing.effectId, bi, i, { valueStr: e.target.value || null })} />
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon size="xs" variant="subtle" color="red"
                              onClick={() => editing && removeBlackboardRow(editing.effectId, bi, i)}>
                              <IconTrash size={10} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Button size="xs" variant="subtle" leftSection={<IconPlus size={10} />}
                            onClick={() => editing && addBlackboardRow(editing.effectId, bi)}>
                            添加行
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    </Table.Tbody>
                  </Table>
                </Card>
              ))}
            </Stack>
          ) : (
            <Card withBorder padding="xl" ta="center">
              <Text c="dimmed">← 选择左侧效果进行查看/编辑</Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>

      {/* 新增效果 Modal */}
      <Modal opened={addOpened} onClose={closeAdd} title="新增效果" size="sm">
        <Stack gap="md">
          <TextInput
            label="效果 ID（effectId）"
            placeholder="如 effect_new_buff_001"
            value={newEffectId}
            onChange={e => setNewEffectId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEffect()}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAdd}>取消</Button>
            <Button onClick={addEffect} disabled={!newEffectId.trim()}>创建</Button>
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
          <Text>确定要删除效果 <Text span fw={700} c="red">{deleteConfirm}</Text> 吗？</Text>
          <Text size="sm" c="dimmed">此操作同时删除关联的 effectBuffInfoDataDict 数据，不可撤销。</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="red" onClick={() => deleteConfirm && deleteEffect(deleteConfirm)}>删除</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
