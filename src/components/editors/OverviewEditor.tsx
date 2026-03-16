import {
  Stack, Card, Group, Text, Badge, Grid, NumberInput,
  Title, Table, Divider, SimpleGrid,
} from '@mantine/core'
import type { DataStore } from '../../store/dataStore'
import { getCharName, difficultyLabel } from '../../store/utils'
import { RichTextPreview } from '../shared/RichTextPreview'

interface Props { store: DataStore }

export function OverviewEditor({ store }: Props) {
  const { activeSeason } = store

  if (!activeSeason) {
    return (
      <Card withBorder padding="xl" ta="center">
        <Stack align="center" gap="md">
          <Text size="xl" fw={300} c="dimmed">暂无赛季数据</Text>
          <Text size="sm" c="dimmed">请在顶部导入 JSON 文件或粘贴数据</Text>
        </Stack>
      </Card>
    )
  }

  const { data } = activeSeason
  const modeCount = Object.keys(data.modeDataDict).length
  const bondCount = Object.keys(data.bondInfoDict).length
  const chessCount = Object.values(data.charShopChessDatas).filter(c => !c.isHidden).length
  const trapCount = Object.keys(data.trapChessDataDict).length
  const bossCount = Object.keys(data.bossInfoDict).length
  const effectCount = Object.keys(data.effectInfoDataDict).length

  const statCards = [
    { label: '游戏模式', value: modeCount, color: 'blue' },
    { label: '盟约数量', value: bondCount, color: 'teal' },
    { label: '棋子数量', value: chessCount, color: 'green' },
    { label: '装备数量', value: trapCount, color: 'orange' },
    { label: 'BOSS 数量', value: bossCount, color: 'red' },
    { label: '效果数量', value: effectCount, color: 'violet' },
  ]

  const modes = Object.values(data.modeDataDict).sort((a, b) => a.sortId - b.sortId)
  const bonds = Object.values(data.bondInfoDict).sort((a, b) => a.identifier - b.identifier)

  // 按阶数统计棋子
  const chessPerLevel: Record<number, number> = {}
  for (const c of Object.values(data.charShopChessDatas)) {
    if (!c.isHidden) chessPerLevel[c.chessLevel] = (chessPerLevel[c.chessLevel] ?? 0) + 1
  }

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="md">
        {statCards.map(s => (
          <Card key={s.label} withBorder padding="md" ta="center">
            <Text size="xl" fw={700} c={s.color}>{s.value}</Text>
            <Text size="sm" c="dimmed">{s.label}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder padding="md">
            <Title order={6} mb="sm">游戏模式一览</Title>
            <Table fz="sm" withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>代号</Table.Th>
                  <Table.Th>名称</Table.Th>
                  <Table.Th>类型</Table.Th>
                  <Table.Th>难度</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {modes.map(m => (
                  <Table.Tr key={m.modeId}>
                    <Table.Td ff="monospace" fz="xs">{m.code}</Table.Td>
                    <Table.Td>{m.name}</Table.Td>
                    <Table.Td>
                      <Badge size="xs" color={m.modeType === 'MULTI' ? 'blue' : m.modeType === 'SINGLE' ? 'teal' : 'gray'}>
                        {m.modeType}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge size="xs" color="orange" variant="light">
                        {difficultyLabel[m.modeDifficulty] ?? m.modeDifficulty}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder padding="md">
            <Title order={6} mb="sm">棋子阶数分布</Title>
            <Table fz="sm" withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>阶数</Table.Th>
                  <Table.Th>棋子数</Table.Th>
                  <Table.Th>占比</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {[1, 2, 3, 4, 5, 6].map(lv => {
                  const count = chessPerLevel[lv] ?? 0
                  const pct = chessCount > 0 ? ((count / chessCount) * 100).toFixed(1) : '0.0'
                  return (
                    <Table.Tr key={lv}>
                      <Table.Td>{lv} 阶</Table.Td>
                      <Table.Td>{count}</Table.Td>
                      <Table.Td c="dimmed">{pct}%</Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Card>

          <Card withBorder padding="md" mt="md">
            <Title order={6} mb="sm">盟约概览</Title>
            <Stack gap="xs">
              {bonds.slice(0, 10).map(b => (
                <Group key={b.bondId} justify="space-between">
                  <Group gap="xs">
                    <Text size="sm">{b.name}</Text>
                    <Badge size="xs" color="teal" variant="light">{b.chessIdList.length} 棋子</Badge>
                  </Group>
                  <RichTextPreview text={b.desc} maxLen={30} />
                </Group>
              ))}
              {bonds.length > 10 && <Text size="xs" c="dimmed">…以及 {bonds.length - 10} 个盟约</Text>}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder padding="md">
        <Title order={6} mb="sm">常量一览</Title>
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          {[
            { label: '刷新价格', value: `${data.constData.shopRefreshPrice} 金` },
            { label: '商店格子数', value: data.constData.storeCntMax },
            { label: '最大部署数', value: data.constData.maxBattleChessCnt },
            { label: '最大整备区', value: data.constData.maxDeckChessCnt },
            { label: '每轮扣血上限', value: data.constData.costPlayerHpLimit },
            { label: '借用次数', value: data.constData.borrowCount },
          ].map(item => (
            <Group key={item.label} justify="space-between">
              <Text size="sm" c="dimmed">{item.label}</Text>
              <Text size="sm" fw={500}>{item.value}</Text>
            </Group>
          ))}
        </SimpleGrid>
      </Card>
    </Stack>
  )
}
