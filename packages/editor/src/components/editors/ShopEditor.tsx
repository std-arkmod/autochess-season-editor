import {
  Stack, Card, Group, Text, Grid,
  Title, Table, Divider, ColorSwatch, Tooltip, Badge,
} from '@mantine/core'
import { CNumberInput, CollabEditingProvider } from '../collab/CollabInputs'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

export function ShopEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const { shopLevelDataDict, shopLevelDisplayDataDict, constData } = activeSeason.data

  function patchConst(patch: Partial<typeof constData>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      constData: { ...data.constData, ...patch },
    }))
  }

  function patchShopLevel(mode: string, level: string, patch: Record<string, unknown>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      shopLevelDataDict: {
        ...data.shopLevelDataDict,
        [mode]: {
          ...data.shopLevelDataDict[mode],
          [level]: { ...data.shopLevelDataDict[mode][level], ...patch },
        },
      },
    }))
  }

  return (
    <CollabEditingProvider itemId="shop">
    <Stack gap="lg">
      <Title order={5}>常量配置</Title>
      <Grid gutter="sm">
        <Grid.Col span={3}>
          <CNumberInput
            label="刷新商店价格（金）"
            value={constData.shopRefreshPrice}
            min={0}
            onChange={v => patchConst({ shopRefreshPrice: Number(v) })}
          />
        </Grid.Col>
        <Grid.Col span={3}>
          <CNumberInput
            label="商店格子数"
            value={constData.storeCntMax}
            min={1}
            onChange={v => patchConst({ storeCntMax: Number(v) })}
          />
        </Grid.Col>
        <Grid.Col span={3}>
          <CNumberInput
            label="最大整备区棋子数"
            value={constData.maxDeckChessCnt}
            min={1}
            onChange={v => patchConst({ maxDeckChessCnt: Number(v) })}
          />
        </Grid.Col>
        <Grid.Col span={3}>
          <CNumberInput
            label="最大部署棋子数"
            value={constData.maxBattleChessCnt}
            min={1}
            onChange={v => patchConst({ maxBattleChessCnt: Number(v) })}
          />
        </Grid.Col>
        <Grid.Col span={3}>
          <CNumberInput
            label="每回合最大扣血上限"
            value={constData.costPlayerHpLimit}
            min={0}
            onChange={v => patchConst({ costPlayerHpLimit: Number(v) })}
          />
        </Grid.Col>
        <Grid.Col span={3}>
          <CNumberInput
            label="可借用干员次数"
            value={constData.borrowCount}
            min={0}
            onChange={v => patchConst({ borrowCount: Number(v) })}
          />
        </Grid.Col>
      </Grid>

      <Divider label="各模式商店等级配置" labelPosition="left" />

      {Object.entries(shopLevelDataDict).map(([mode, levels]) => (
        <Stack key={mode} gap="xs">
          <Group gap="xs">
            <Badge color="teal" variant="light">{mode}</Badge>
          </Group>
          <Table striped withTableBorder fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>等级</Table.Th>
                <Table.Th>升级价格</Table.Th>
                <Table.Th>刷新棋子数</Table.Th>
                <Table.Th>刷新装备数</Table.Th>
                <Table.Th>标签颜色</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Object.entries(levels)
                .sort(([, a], [, b]) => a.shopLevel - b.shopLevel)
                .map(([levelKey, level]) => (
                  <Table.Tr key={levelKey}>
                    <Table.Td>Lv.{level.shopLevel}</Table.Td>
                    <Table.Td>
                      <CNumberInput
                        size="xs"
                        value={level.initialUpgradePrice}
                        min={0}
                        w={90}
                        onChange={v => patchShopLevel(mode, levelKey, { initialUpgradePrice: Number(v) })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <CNumberInput
                        size="xs"
                        value={level.charChessCount}
                        min={0}
                        w={70}
                        onChange={v => patchShopLevel(mode, levelKey, { charChessCount: Number(v) })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <CNumberInput
                        size="xs"
                        value={level.itemCount}
                        min={0}
                        w={70}
                        onChange={v => patchShopLevel(mode, levelKey, { itemCount: Number(v) })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label={level.levelTagBgColor}>
                        <ColorSwatch color={level.levelTagBgColor} size={22} />
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}
    </Stack>
    </CollabEditingProvider>
  )
}
