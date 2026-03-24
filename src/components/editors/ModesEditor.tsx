import {
  Stack, Card, Group, Text, Badge, Grid, Textarea,
  Switch, Select, MultiSelect, ActionIcon, Button, Divider,
  TextInput, Title, Modal, NumberInput, ColorInput,
} from '@mantine/core'
import { IconPlus, IconTrash, IconArrowUp, IconArrowDown } from '@tabler/icons-react'
import { useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { ModeDataDictMode, ModeType } from '../../autochess-season-data'
import { difficultyLabel, modeTypeLabel } from '../../store/utils'
import type { DataStore } from '../../store/dataStore'

const DIFFICULTIES = ['TRAINING', 'FUNNY', 'NORMAL', 'HARD', 'ABYSS']

interface Props { store: DataStore }

function makeDefaultMode(modeId: string, sortId: number): ModeDataDictMode {
  return {
    modeId, name: '新模式', code: 'AC-NEW', sortId,
    backgroundId: '', desc: '', effectDescList: [],
    preposedMode: null, unlockText: null, loadingPicId: '',
    modeType: 'SINGLE', modeDifficulty: 'NORMAL',
    modeIconId: '', modeColor: 'ffffff', specialPhaseTime: 150,
    activeBondIdList: [], inactiveBondIdList: [], inactiveEnemyKey: [],
  }
}

export function ModesEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newModeId, setNewModeId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const modes = activeSeason.data.modeDataDict
  const modeList = Object.values(modes).sort((a, b) => a.sortId - b.sortId)
  const allBondIds = Object.keys(activeSeason.data.bondInfoDict)
  const allBondOptions = allBondIds.map(id => ({
    value: id, label: activeSeason.data.bondInfoDict[id]?.name ?? id,
  }))
  const editing = editingId ? modes[editingId] : null

  function patchMode(id: string, patch: Partial<ModeDataDictMode>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      modeDataDict: { ...data.modeDataDict, [id]: { ...data.modeDataDict[id], ...patch } },
    }))
  }

  function reassignSortIds(dict: Record<string, ModeDataDictMode>): Record<string, ModeDataDictMode> {
    const sorted = Object.values(dict).sort((a, b) => a.sortId - b.sortId)
    const result: Record<string, ModeDataDictMode> = {}
    sorted.forEach((m, i) => { result[m.modeId] = { ...m, sortId: i } })
    return result
  }

  function moveMode(id: string, dir: -1 | 1) {
    updateSeason(activeSeasonId!, data => {
      const list = Object.values(data.modeDataDict).sort((a, b) => a.sortId - b.sortId)
      const idx = list.findIndex(m => m.modeId === id)
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= list.length) return data
      const next = { ...data.modeDataDict }
      const tmp = next[list[idx].modeId].sortId
      next[list[idx].modeId] = { ...next[list[idx].modeId], sortId: next[list[swapIdx].modeId].sortId }
      next[list[swapIdx].modeId] = { ...next[list[swapIdx].modeId], sortId: tmp }
      return { ...data, modeDataDict: reassignSortIds(next) }
    })
  }

  function addMode() {
    const id = newModeId.trim()
    if (!id) return
    if (modes[id]) {
      notifications.show({ title: '已存在', message: `modeId "${id}" 已存在`, color: 'red' })
      return
    }
    const nextSortId = Math.max(...Object.values(modes).map(m => m.sortId), -1) + 1
    updateSeason(activeSeasonId!, data => ({
      ...data,
      modeDataDict: { ...data.modeDataDict, [id]: makeDefaultMode(id, nextSortId) },
    }))
    setEditingId(id)
    closeAdd()
    setNewModeId('')
    notifications.show({ title: '已新增', message: `模式 ${id} 已创建`, color: 'teal' })
  }

  function deleteMode(id: string) {
    updateSeason(activeSeasonId!, data => {
      const next = { ...data.modeDataDict }
      delete next[id]
      return { ...data, modeDataDict: reassignSortIds(next) }
    })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
    notifications.show({ title: '已删除', message: `模式 ${id} 已删除`, color: 'orange' })
  }

  return (
    <>
      <Grid gutter="md">
      {/* 左列：模式列表 */}
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>模式列表</Title>
            <Group gap="xs">
              <Text size="xs" c="dimmed">{modeList.length} 个</Text>
              <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>新增</Button>
            </Group>
          </Group>
          {modeList.map((mode, idx) => (
            <Card
              key={mode.modeId}
              padding="sm"
              radius="md"
              withBorder
              style={{
                cursor: 'pointer',
                borderColor: editingId === mode.modeId ? 'var(--mantine-color-teal-6)' : undefined,
              }}
              onClick={() => setEditingId(mode.modeId)}
            >
              <Group justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">{idx + 1}.</Text>
                    <Text fw={500} size="sm" truncate>{mode.name}</Text>
                    <Badge size="xs" color="gray" variant="outline">{mode.code}</Badge>
                  </Group>
                  <Group gap="xs" mt={4}>
                    <Badge size="xs" color={mode.modeType === 'MULTI' ? 'blue' : mode.modeType === 'SINGLE' ? 'teal' : 'gray'}>
                      {modeTypeLabel[mode.modeType]}
                    </Badge>
                    <Badge size="xs" color="orange" variant="light">
                      {difficultyLabel[mode.modeDifficulty] ?? mode.modeDifficulty}
                    </Badge>
                  </Group>
                </div>
                <Group gap={2} wrap="nowrap">
                  <ActionIcon size="xs" variant="subtle" disabled={idx === 0} onClick={e => { e.stopPropagation(); moveMode(mode.modeId, -1) }}>
                    <IconArrowUp size={12} />
                  </ActionIcon>
                  <ActionIcon size="xs" variant="subtle" disabled={idx === modeList.length - 1} onClick={e => { e.stopPropagation(); moveMode(mode.modeId, 1) }}>
                    <IconArrowDown size={12} />
                  </ActionIcon>
                  <ActionIcon size="xs" variant="subtle" color="red" onClick={e => { e.stopPropagation(); setDeleteConfirm(mode.modeId) }}>
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      </Grid.Col>

      {/* 右列：编辑面板 */}
      <Grid.Col span={{ base: 12, md: 8 }}>
        {editing ? (
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>编辑：{editing.name}</Title>
              <Text size="xs" c="dimmed" ff="monospace">{editing.modeId}</Text>
            </Group>

            <Grid gutter="sm">
              <Grid.Col span={6}>
                <TextInput
                  label="模式名称"
                  value={editing.name}
                  onChange={e => patchMode(editing.modeId, { name: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={3}>
                <TextInput
                  label="代号"
                  value={editing.code}
                  onChange={e => patchMode(editing.modeId, { code: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={3}>{/* sortId 自动按列表顺序维护，不手动编辑 */}</Grid.Col>
              <Grid.Col span={6}>
                <Select
                  label="模式类型"
                  value={editing.modeType}
                  data={[
                    { value: 'LOCAL', label: '本地 (LOCAL)' },
                    { value: 'SINGLE', label: '单人 (SINGLE)' },
                    { value: 'MULTI', label: '多人 (MULTI)' },
                  ]}
                  onChange={v => patchMode(editing.modeId, { modeType: v as ModeType })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <Select
                  label="难度"
                  value={editing.modeDifficulty}
                  data={DIFFICULTIES.map(d => ({ value: d, label: `${difficultyLabel[d] ?? d} (${d})` }))}
                  onChange={v => patchMode(editing.modeId, { modeDifficulty: v! })}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <Textarea
                  label="描述"
                  value={editing.desc}
                  autosize
                  minRows={2}
                  onChange={e => patchMode(editing.modeId, { desc: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label="特殊阶段时间（秒）"
                  value={editing.specialPhaseTime}
                  onChange={v => patchMode(editing.modeId, { specialPhaseTime: Number(v) })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="前置模式 ID"
                  value={editing.preposedMode ?? ''}
                  placeholder="（无）"
                  onChange={e => patchMode(editing.modeId, { preposedMode: e.target.value || null })}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <TextInput
                  label="解锁提示文本"
                  value={editing.unlockText ?? ''}
                  placeholder="（无）"
                  onChange={e => patchMode(editing.modeId, { unlockText: e.target.value || null })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="背景 ID（backgroundId）"
                  value={editing.backgroundId}
                  onChange={e => patchMode(editing.modeId, { backgroundId: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="加载图 ID（loadingPicId）"
                  value={editing.loadingPicId}
                  onChange={e => patchMode(editing.modeId, { loadingPicId: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="模式图标 ID（modeIconId）"
                  value={editing.modeIconId}
                  onChange={e => patchMode(editing.modeId, { modeIconId: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <ColorInput
                  label="模式颜色（modeColor）"
                  value={`#${editing.modeColor}`}
                  format="hex"
                  onChange={v => patchMode(editing.modeId, { modeColor: v.replace('#', '') })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <NumberInput
                  label="开始时间戳（startTime，可选）"
                  value={editing.startTime ?? ''}
                  placeholder="（无）"
                  onChange={v => patchMode(editing.modeId, { startTime: v === '' ? undefined : Number(v) })}
                />
              </Grid.Col>
            </Grid>

            <Divider label="效果描述列表" labelPosition="left" />
            <Stack gap="xs">
              {editing.effectDescList.map((desc, i) => (
                <Group key={i} gap="xs">
                  <TextInput
                    style={{ flex: 1 }}
                    value={desc}
                    onChange={e => {
                      const next = [...editing.effectDescList]
                      next[i] = e.target.value
                      patchMode(editing.modeId, { effectDescList: next })
                    }}
                  />
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => patchMode(editing.modeId, {
                      effectDescList: editing.effectDescList.filter((_, j) => j !== i)
                    })}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={() => patchMode(editing.modeId, { effectDescList: [...editing.effectDescList, ''] })}
              >
                添加描述
              </Button>
            </Stack>

            <Divider label="可用盟约" labelPosition="left" />
            <MultiSelect
              placeholder="选择可用的盟约..."
              searchable
              value={editing.activeBondIdList}
              data={allBondOptions}
              onChange={v => patchMode(editing.modeId, { activeBondIdList: v })}
              maxDropdownHeight={200}
            />

            <Divider label="禁用盟约" labelPosition="left" />
            <MultiSelect
              placeholder="选择禁用的盟约..."
              searchable
              value={editing.inactiveBondIdList}
              data={allBondOptions}
              onChange={v => patchMode(editing.modeId, { inactiveBondIdList: v })}
              maxDropdownHeight={200}
            />

            <Divider label="禁用敌人 Key（inactiveEnemyKey）" labelPosition="left" />
            <Stack gap="xs">
              {editing.inactiveEnemyKey.map((key, i) => (
                <Group key={i} gap="xs">
                  <TextInput
                    style={{ flex: 1 }}
                    value={key}
                    onChange={e => {
                      const next = [...editing.inactiveEnemyKey]
                      next[i] = e.target.value
                      patchMode(editing.modeId, { inactiveEnemyKey: next })
                    }}
                  />
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => patchMode(editing.modeId, {
                      inactiveEnemyKey: editing.inactiveEnemyKey.filter((_, j) => j !== i)
                    })}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={() => patchMode(editing.modeId, { inactiveEnemyKey: [...editing.inactiveEnemyKey, ''] })}
              >
                添加敌人 Key
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Card withBorder padding="xl" ta="center">
            <Text c="dimmed">← 选择左侧模式进行编辑</Text>
          </Card>
        )}
      </Grid.Col>
    </Grid>

      <Modal opened={addOpened} onClose={closeAdd} title="新增游戏模式" size="sm">
        <Stack gap="md">
          <TextInput
            label="模式 ID（modeId）"
            placeholder="如 mode_single_new"
            value={newModeId}
            onChange={e => setNewModeId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addMode()}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAdd}>取消</Button>
            <Button onClick={addMode} disabled={!newModeId.trim()}>创建</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除" size="sm">
        <Stack gap="md">
          <Text>确定要删除模式 <Text span fw={700} c="red">{deleteConfirm}</Text> 吗？</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="red" onClick={() => deleteConfirm && deleteMode(deleteConfirm)}>删除</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
