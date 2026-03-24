import {
  Stack, Card, Group, Text, Badge, Grid, NumberInput,
  ActionIcon, Title, Divider, Switch, Table,
  ScrollArea, Button, Modal, TextInput,
} from '@mantine/core'
import { IconTrash, IconPlus, IconArrowUp, IconArrowDown } from '@tabler/icons-react'
import { useState, useEffect } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { Boss } from '../../autochess-season-data'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

const DEFAULT_BOSS: Omit<Boss, 'bossId' | 'sortId'> = {
  weight: 100,
  bloodPoint: 10000,
  bloodPointNormal: 10000,
  bloodPointHard: 15000,
  bloodPointAbyss: 20000,
  isHidingBoss: false,
}

export function BossEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newBossId, setNewBossId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const { bossInfoDict } = activeSeason.data
  // sortId 仅用于排序，不对外显示；显示顺序 = 当前列表顺序
  const bossList = Object.values(bossInfoDict).sort((a, b) => a.sortId - b.sortId)
  const editing = editingId ? bossInfoDict[editingId] : null

  function patchBoss(id: string, patch: Partial<Boss>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      bossInfoDict: { ...data.bossInfoDict, [id]: { ...data.bossInfoDict[id], ...patch } },
    }))
  }

  /** 重排所有 sortId，使其连续 */
  function reassignSortIds(dict: Record<string, Boss>): Record<string, Boss> {
    const sorted = Object.values(dict).sort((a, b) => a.sortId - b.sortId)
    const result: Record<string, Boss> = {}
    sorted.forEach((b, i) => { result[b.bossId] = { ...b, sortId: i } })
    return result
  }

  function moveBoss(id: string, dir: -1 | 1) {
    updateSeason(activeSeasonId!, data => {
      const list = Object.values(data.bossInfoDict).sort((a, b) => a.sortId - b.sortId)
      const idx = list.findIndex(b => b.bossId === id)
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= list.length) return data
      // swap sortIds
      const next = { ...data.bossInfoDict }
      const tmp = next[list[idx].bossId].sortId
      next[list[idx].bossId] = { ...next[list[idx].bossId], sortId: next[list[swapIdx].bossId].sortId }
      next[list[swapIdx].bossId] = { ...next[list[swapIdx].bossId], sortId: tmp }
      return { ...data, bossInfoDict: reassignSortIds(next) }
    })
  }

  function addBoss() {
    const id = newBossId.trim()
    if (!id) return
    if (bossInfoDict[id]) {
      notifications.show({ title: '已存在', message: `bossId "${id}" 已存在`, color: 'red' })
      return
    }
    const nextSortId = Math.max(...Object.values(bossInfoDict).map(b => b.sortId), -1) + 1
    updateSeason(activeSeasonId!, data => ({
      ...data,
      bossInfoDict: {
        ...data.bossInfoDict,
        [id]: { ...DEFAULT_BOSS, bossId: id, sortId: nextSortId },
      },
    }))
    setEditingId(id)
    closeAdd()
    setNewBossId('')
    notifications.show({ title: '已新增', message: `BOSS ${id} 已创建`, color: 'teal' })
  }

  function deleteBoss(id: string) {
    updateSeason(activeSeasonId!, data => {
      const next = { ...data.bossInfoDict }
      delete next[id]
      return { ...data, bossInfoDict: reassignSortIds(next) }
    })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
    notifications.show({ title: '已删除', message: `BOSS ${id} 已删除`, color: 'orange' })
  }

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>BOSS 列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{bossList.length} 个</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>新增</Button>
              </Group>
            </Group>
            <ScrollArea h={600}>
              <Stack gap="xs">
                {bossList.map((boss, idx) => (
                  <Card
                    key={boss.bossId}
                    padding="sm"
                    radius="md"
                    withBorder
                    style={{ cursor: 'pointer', borderColor: editingId === boss.bossId ? 'var(--mantine-color-teal-6)' : undefined }}
                    onClick={() => setEditingId(boss.bossId)}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <div>
                        <Group gap="xs">
                          <Text size="xs" c="dimmed" w={18} ta="right">{idx + 1}.</Text>
                          <Text fw={500} size="sm" ff="monospace">{boss.bossId}</Text>
                          {boss.isHidingBoss && <Badge size="xs" color="gray">隐藏</Badge>}
                        </Group>
                        <Text size="xs" c="dimmed" ml={26}>
                          权重 {boss.weight} · 普通 {boss.bloodPointNormal.toLocaleString()} HP
                        </Text>
                      </div>
                      <Group gap={2} wrap="nowrap">
                        <ActionIcon size="xs" variant="subtle" disabled={idx === 0} onClick={e => { e.stopPropagation(); moveBoss(boss.bossId, -1) }}>
                          <IconArrowUp size={12} />
                        </ActionIcon>
                        <ActionIcon size="xs" variant="subtle" disabled={idx === bossList.length - 1} onClick={e => { e.stopPropagation(); moveBoss(boss.bossId, 1) }}>
                          <IconArrowDown size={12} />
                        </ActionIcon>
                        <ActionIcon size="xs" variant="subtle" color="red" onClick={e => { e.stopPropagation(); setDeleteConfirm(boss.bossId) }}>
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
                <Title order={5}>编辑 BOSS</Title>
                <Text size="xs" c="dimmed" ff="monospace">{editing.bossId}</Text>
              </Group>

              <Grid gutter="sm">
                <Grid.Col span={4}>
                  <NumberInput label="权重" value={editing.weight} min={0} onChange={v => patchBoss(editing.bossId, { weight: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <Switch
                    label="隐藏 BOSS"
                    checked={editing.isHidingBoss}
                    onChange={e => patchBoss(editing.bossId, { isHidingBoss: e.target.checked })}
                    mt="xl"
                  />
                </Grid.Col>
              </Grid>

              <Divider label="血量配置（各难度）" labelPosition="left" />
              <Grid gutter="sm">
                <Grid.Col span={6}>
                  <NumberInput label="基础血量" value={editing.bloodPoint} min={0} onChange={v => patchBoss(editing.bossId, { bloodPoint: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput label="普通难度血量" value={editing.bloodPointNormal} min={0} onChange={v => patchBoss(editing.bossId, { bloodPointNormal: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput label="困难难度血量" value={editing.bloodPointHard} min={0} onChange={v => patchBoss(editing.bossId, { bloodPointHard: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput label="深渊难度血量" value={editing.bloodPointAbyss} min={0} onChange={v => patchBoss(editing.bossId, { bloodPointAbyss: Number(v) })} />
                </Grid.Col>
              </Grid>

              <Divider label="血量对比" labelPosition="left" />
              <Table withTableBorder fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>难度</Table.Th>
                    <Table.Th>血量</Table.Th>
                    <Table.Th>相比普通</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {[
                    { label: '基础', val: editing.bloodPoint },
                    { label: '普通', val: editing.bloodPointNormal },
                    { label: '困难', val: editing.bloodPointHard },
                    { label: '深渊', val: editing.bloodPointAbyss },
                  ].map(row => (
                    <Table.Tr key={row.label}>
                      <Table.Td>{row.label}</Table.Td>
                      <Table.Td>{row.val.toLocaleString()}</Table.Td>
                      <Table.Td>
                        {editing.bloodPointNormal > 0
                          ? `${((row.val / editing.bloodPointNormal) * 100).toFixed(0)}%`
                          : '-'}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          ) : (
            <Card withBorder padding="xl" ta="center">
              <Text c="dimmed">← 选择左侧 BOSS 进行编辑</Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>

      <Modal opened={addOpened} onClose={closeAdd} title="新增 BOSS" size="sm">
        <Stack gap="md">
          <TextInput
            label="BOSS ID（bossId）"
            placeholder="如 boss_10"
            value={newBossId}
            onChange={e => setNewBossId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addBoss()}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAdd}>取消</Button>
            <Button onClick={addBoss} disabled={!newBossId.trim()}>创建</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除" size="sm">
        <Stack gap="md">
          <Text>确定要删除 BOSS <Text span fw={700} c="red">{deleteConfirm}</Text> 吗？</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="red" onClick={() => deleteConfirm && deleteBoss(deleteConfirm)}>删除</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
