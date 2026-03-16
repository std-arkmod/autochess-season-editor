import {
  Stack, Card, Group, Text, Badge, Grid, Title,
  NumberInput, Select, Divider, Table, Button, ActionIcon,
} from '@mantine/core'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

export function RewardsEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const { baseRewardDataList, difficultyFactorInfo, modeFactorInfo } = activeSeason.data

  function updateReward(index: number, patch: Record<string, unknown>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      baseRewardDataList: data.baseRewardDataList.map((r, i) =>
        i === index ? { ...r, ...patch } : r
      ),
    }))
  }

  function updateRewardItem(index: number, patch: Record<string, unknown>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      baseRewardDataList: data.baseRewardDataList.map((r, i) =>
        i === index ? { ...r, item: { ...r.item, ...patch } } : r
      ),
    }))
  }

  function addReward() {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      baseRewardDataList: [
        ...data.baseRewardDataList,
        { round: 0, item: { id: '', count: 1, type: 'GOLD' }, dailyMissionPoint: 0 },
      ],
    }))
  }

  function removeReward(index: number) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      baseRewardDataList: data.baseRewardDataList.filter((_, i) => i !== index),
    }))
  }

  function patchDifficulty(patch: Partial<typeof difficultyFactorInfo>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      difficultyFactorInfo: { ...data.difficultyFactorInfo, ...patch },
    }))
  }

  function patchMode(patch: Partial<typeof modeFactorInfo>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      modeFactorInfo: { ...data.modeFactorInfo, ...patch },
    }))
  }

  const itemTypeOptions = [
    { value: 'GOLD', label: '金币' },
    { value: 'MATERIAL', label: '材料' },
    { value: 'ACTIVITY_ITEM', label: '活动道具' },
    { value: 'CARD_EXP', label: '卡牌经验' },
    { value: 'CHAR_SKIN', label: '干员外观' },
    { value: 'PLAYER_AVATAR', label: '玩家头像' },
  ]

  return (
    <Stack gap="lg">
      <Title order={5}>难度倍率</Title>
      <Grid gutter="sm">
        {(['FUNNY', 'NORMAL', 'HARD', 'ABYSS'] as const).map(diff => (
          difficultyFactorInfo[diff] !== undefined && (
            <Grid.Col key={diff} span={3}>
              <NumberInput
                label={`${diff === 'FUNNY' ? '标准' : diff === 'NORMAL' ? '普通' : diff === 'HARD' ? '困难' : '深渊'} (${diff})`}
                value={difficultyFactorInfo[diff]}
                step={0.1}
                decimalScale={2}
                onChange={v => patchDifficulty({ [diff]: Number(v) })}
              />
            </Grid.Col>
          )
        ))}
      </Grid>

      <Title order={5}>模式倍率</Title>
      <Grid gutter="sm">
        <Grid.Col span={3}>
          <NumberInput
            label="单人 (SINGLE)"
            value={modeFactorInfo.SINGLE}
            step={0.1}
            decimalScale={2}
            onChange={v => patchMode({ SINGLE: Number(v) })}
          />
        </Grid.Col>
        <Grid.Col span={3}>
          <NumberInput
            label="多人 (MULTI)"
            value={modeFactorInfo.MULTI}
            step={0.1}
            decimalScale={2}
            onChange={v => patchMode({ MULTI: Number(v) })}
          />
        </Grid.Col>
      </Grid>

      <Divider label={`基础回合奖励（${baseRewardDataList.length} 条）`} labelPosition="left" />
      <Table striped withTableBorder fz="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>回合</Table.Th>
            <Table.Th>奖励类型</Table.Th>
            <Table.Th>奖励 ID</Table.Th>
            <Table.Th>数量</Table.Th>
            <Table.Th>日常任务点</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {baseRewardDataList.map((r, i) => (
            <Table.Tr key={i}>
              <Table.Td>
                <NumberInput
                  size="xs"
                  value={r.round}
                  min={0}
                  w={70}
                  onChange={v => updateReward(i, { round: Number(v) })}
                />
              </Table.Td>
              <Table.Td>
                <Select
                  size="xs"
                  value={r.item.type}
                  data={itemTypeOptions}
                  w={120}
                  onChange={v => updateRewardItem(i, { type: v })}
                />
              </Table.Td>
              <Table.Td>
                <input
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--mantine-color-dark-4)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    color: 'inherit',
                    fontSize: '12px',
                    width: 150,
                  }}
                  value={r.item.id}
                  onChange={e => updateRewardItem(i, { id: e.target.value })}
                />
              </Table.Td>
              <Table.Td>
                <NumberInput
                  size="xs"
                  value={r.item.count}
                  min={1}
                  w={70}
                  onChange={v => updateRewardItem(i, { count: Number(v) })}
                />
              </Table.Td>
              <Table.Td>
                <NumberInput
                  size="xs"
                  value={r.dailyMissionPoint}
                  min={0}
                  w={70}
                  onChange={v => updateReward(i, { dailyMissionPoint: Number(v) })}
                />
              </Table.Td>
              <Table.Td>
                <ActionIcon size="sm" color="red" variant="subtle" onClick={() => removeReward(i)}>
                  <IconTrash size={12} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Button
        size="xs"
        variant="subtle"
        leftSection={<IconPlus size={14} />}
        onClick={addReward}
        w="fit-content"
      >
        添加回合奖励
      </Button>
    </Stack>
  )
}
