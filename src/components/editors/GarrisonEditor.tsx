import {
  Stack, Card, Group, Text, Badge, Grid, Title,
  TextInput, NumberInput, ScrollArea, ActionIcon, Textarea, Divider, Select,
} from '@mantine/core'
import { IconEdit } from '@tabler/icons-react'
import { useState, useMemo } from 'react'
import { eventTypeLabel, getCharName } from '../../store/utils'
import { RichTextPreview } from '../shared/RichTextPreview'
import type { DataStore } from '../../store/dataStore'
import type { GarrisonDataDict, EventType } from '../../autochess-season-data'

interface Props { store: DataStore }

export function GarrisonEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const { garrisonDataDict, charChessDataDict, charShopChessDatas } = activeSeason.data

  // Build reverse map: garrisonId -> list of chessIds that use it
  const garrisonToChess = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const [chessId, chess] of Object.entries(charChessDataDict)) {
      if (chess.garrisonIds) {
        for (const gid of chess.garrisonIds) {
          if (!m[gid]) m[gid] = []
          m[gid].push(chessId)
        }
      }
    }
    return m
  }, [charChessDataDict])

  const garrisonList = useMemo(() =>
    Object.entries(garrisonDataDict).sort(([a], [b]) => a.localeCompare(b)),
    [garrisonDataDict]
  )
  const filtered = search
    ? garrisonList.filter(([id, g]) => id.includes(search) || g.garrisonDesc.includes(search) || g.eventTypeDesc.includes(search))
    : garrisonList

  const [editingKey, editingGarrison] = editingId
    ? ([editingId, garrisonDataDict[editingId]] as [string, GarrisonDataDict])
    : [null, null]

  const linkedChess = editingKey ? (garrisonToChess[editingKey] ?? []) : []

  function patchGarrison(id: string, patch: Partial<GarrisonDataDict>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      garrisonDataDict: { ...data.garrisonDataDict, [id]: { ...data.garrisonDataDict[id], ...patch } },
    }))
  }

  const eventTypeOptions = [
    'IN_BATTLE', 'SERVER_PRICE', 'SERVER_CHESS_SOLD', 'SERVER_GAIN',
    'SERVER_PREP_FIN', 'SERVER_PREP_START', 'SERVER_REFRESH_SHOP',
  ].map(v => ({ value: v, label: `${eventTypeLabel[v] ?? v} (${v})` }))

  return (
    <Grid gutter="md">
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>干员特质列表</Title>
            <Text size="xs" c="dimmed">{filtered.length}/{garrisonList.length}</Text>
          </Group>
          <TextInput
            placeholder="搜索特质描述或 ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            size="xs"
          />
          <ScrollArea h={600}>
            <Stack gap="xs">
              {filtered.map(([id, g]) => (
                <Card
                  key={id}
                  padding="sm"
                  radius="md"
                  withBorder
                  style={{ cursor: 'pointer', borderColor: editingId === id ? 'var(--mantine-color-teal-6)' : undefined }}
                  onClick={() => setEditingId(id)}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Group gap="xs" mb={2}>
                        <Badge size="xs" color="blue" variant="light">{g.eventTypeDesc}</Badge>
                        <Badge size="xs" color="gray" variant="outline">Lv.{g.charLevel}</Badge>
                        {garrisonToChess[id]?.length > 0 && (
                          <Badge size="xs" color="teal">{garrisonToChess[id].length}人</Badge>
                        )}
                      </Group>
                      <RichTextPreview text={g.garrisonDesc} maxLen={50} />
                    </div>
                    <ActionIcon size="sm" variant="subtle" color="teal">
                      <IconEdit size={14} />
                    </ActionIcon>
                  </Group>
                </Card>
              ))}
            </Stack>
          </ScrollArea>
        </Stack>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 8 }}>
        {editingGarrison && editingKey ? (
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={5}>编辑干员特质</Title>
              <Text size="xs" c="dimmed" ff="monospace">{editingKey}</Text>
            </Group>

            <Grid gutter="sm">
              <Grid.Col span={6}>
                <Select
                  label="触发时机"
                  value={editingGarrison.eventType}
                  data={eventTypeOptions}
                  onChange={v => patchGarrison(editingKey, { eventType: v as EventType })}
                />
              </Grid.Col>
              <Grid.Col span={3}>
                <NumberInput
                  label="触发等级"
                  value={editingGarrison.charLevel}
                  min={0}
                  onChange={v => patchGarrison(editingKey, { charLevel: Number(v) })}
                />
              </Grid.Col>
              <Grid.Col span={3}>
                <TextInput
                  label="时机描述"
                  value={editingGarrison.eventTypeDesc}
                  onChange={e => patchGarrison(editingKey, { eventTypeDesc: e.target.value as any })}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <Textarea
                  label="特质描述（富文本）"
                  value={editingGarrison.garrisonDesc}
                  autosize
                  minRows={3}
                  onChange={e => patchGarrison(editingKey, { garrisonDesc: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <Textarea
                  label="普通描述"
                  value={editingGarrison.description}
                  autosize
                  minRows={2}
                  onChange={e => patchGarrison(editingKey, { description: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="效果类型"
                  value={editingGarrison.effectType}
                  onChange={e => patchGarrison(editingKey, { effectType: e.target.value })}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <TextInput
                  label="战斗符文 Key"
                  value={editingGarrison.battleRuneKey ?? ''}
                  placeholder="（无）"
                  onChange={e => patchGarrison(editingKey, { battleRuneKey: e.target.value as any || null })}
                />
              </Grid.Col>
            </Grid>

            <Divider label="描述预览" labelPosition="left" />
            <Card withBorder padding="sm">
              <RichTextPreview text={editingGarrison.garrisonDesc} maxLen={300} />
            </Card>

            {linkedChess.length > 0 && (
              <>
                <Divider label={`拥有此特质的干员（${linkedChess.length} 人）`} labelPosition="left" />
                <Group gap="xs" wrap="wrap">
                  {linkedChess.map(chessId => (
                    <Badge key={chessId} variant="light" color="teal" size="sm">
                      {getCharName(charShopChessDatas[chessId]?.charId)}
                    </Badge>
                  ))}
                </Group>
              </>
            )}
          </Stack>
        ) : (
          <Card withBorder padding="xl" ta="center">
            <Text c="dimmed">← 选择左侧特质进行编辑</Text>
          </Card>
        )}
      </Grid.Col>
    </Grid>
  )
}
