import {
  Stack, Card, Group, Text, Badge, Grid, Title,
  ScrollArea, Divider, Table, Tabs,
} from '@mantine/core'
import { CSelect } from '../collab/CollabInputs'
import { useMemo, useState } from 'react'
import { getCharName } from '@autochess-editor/shared'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

type DiffEntry = {
  path: string
  type: 'added' | 'removed' | 'changed'
  oldVal?: unknown
  newVal?: unknown
}

function flattenDiff(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  prefix = '',
  result: DiffEntry[] = [],
  depth = 0
): DiffEntry[] {
  if (depth > 4) return result

  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key
    const av = a[key]
    const bv = b[key]

    if (!(key in a)) {
      result.push({ path, type: 'added', newVal: bv })
    } else if (!(key in b)) {
      result.push({ path, type: 'removed', oldVal: av })
    } else if (JSON.stringify(av) !== JSON.stringify(bv)) {
      if (
        typeof av === 'object' && av !== null && !Array.isArray(av) &&
        typeof bv === 'object' && bv !== null && !Array.isArray(bv) &&
        depth < 3
      ) {
        flattenDiff(av as Record<string, unknown>, bv as Record<string, unknown>, path, result, depth + 1)
      } else {
        result.push({ path, type: 'changed', oldVal: av, newVal: bv })
      }
    }
  }
  return result
}

function formatVal(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return `"${v}"`
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `[…${v.length}项]`
  if (typeof v === 'object') return `{…${Object.keys(v as object).length}字段}`
  return String(v)
}

export function DiffViewer({ store }: Props) {
  const { seasons } = store
  const [aId, setAId] = useState<string | null>(null)
  const [bId, setBId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>('overview')

  const seasonOptions = seasons.map(s => ({ value: s.id, label: s.label }))
  const seaA = aId ? seasons.find(s => s.id === aId) : null
  const seaB = bId ? seasons.find(s => s.id === bId) : null

  const diffs = useMemo(() => {
    if (!seaA || !seaB) return []
    return flattenDiff(
      seaA.data as unknown as Record<string, unknown>,
      seaB.data as unknown as Record<string, unknown>
    )
  }, [seaA, seaB])

  // Group diffs by top-level section
  const diffsBySection = useMemo(() => {
    const m: Record<string, DiffEntry[]> = {}
    for (const d of diffs) {
      const section = d.path.split('.')[0]
      if (!m[section]) m[section] = []
      m[section].push(d)
    }
    return m
  }, [diffs])

  if (seasons.length < 2) {
    return (
      <Card withBorder padding="xl" ta="center">
        <Text c="dimmed">请至少导入两个赛季数据以进行对比</Text>
      </Card>
    )
  }

  return (
    <Stack gap="md">
      <Title order={5}>赛季数据对比</Title>
      <Grid gutter="md">
        <Grid.Col span={6}>
          <CSelect
            label="赛季 A（旧）"
            placeholder="选择赛季..."
            data={seasonOptions}
            value={aId}
            onChange={setAId}
          />
        </Grid.Col>
        <Grid.Col span={6}>
          <CSelect
            label="赛季 B（新）"
            placeholder="选择赛季..."
            data={seasonOptions}
            value={bId}
            onChange={setBId}
          />
        </Grid.Col>
      </Grid>

      {seaA && seaB && (
        <>
          <Group gap="xs">
            <Badge color="green">新增 {diffs.filter(d => d.type === 'added').length}</Badge>
            <Badge color="red">删除 {diffs.filter(d => d.type === 'removed').length}</Badge>
            <Badge color="yellow">修改 {diffs.filter(d => d.type === 'changed').length}</Badge>
            <Text size="sm" c="dimmed">共 {diffs.length} 处差异</Text>
          </Group>

          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="overview">按模块汇总</Tabs.Tab>
              <Tabs.Tab value="all">全部差异</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="overview" pt="md">
              <Grid gutter="sm">
                {Object.entries(diffsBySection).map(([section, entries]) => (
                  <Grid.Col key={section} span={{ base: 12, md: 6 }}>
                    <Card withBorder padding="sm">
                      <Group justify="space-between" mb="xs">
                        <Text fw={500} size="sm" ff="monospace">{section}</Text>
                        <Group gap="xs">
                          {entries.filter(e => e.type === 'added').length > 0 && (
                            <Badge size="xs" color="green">+{entries.filter(e => e.type === 'added').length}</Badge>
                          )}
                          {entries.filter(e => e.type === 'removed').length > 0 && (
                            <Badge size="xs" color="red">-{entries.filter(e => e.type === 'removed').length}</Badge>
                          )}
                          {entries.filter(e => e.type === 'changed').length > 0 && (
                            <Badge size="xs" color="yellow">~{entries.filter(e => e.type === 'changed').length}</Badge>
                          )}
                        </Group>
                      </Group>
                      {entries.slice(0, 5).map((e, i) => (
                        <Text key={i} size="xs" c={e.type === 'added' ? 'green' : e.type === 'removed' ? 'red' : 'yellow'} ff="monospace" truncate>
                          {e.type === 'added' ? '+' : e.type === 'removed' ? '-' : '~'} {e.path.split('.').slice(1).join('.')}
                        </Text>
                      ))}
                      {entries.length > 5 && <Text size="xs" c="dimmed">…还有 {entries.length - 5} 条</Text>}
                    </Card>
                  </Grid.Col>
                ))}
              </Grid>
            </Tabs.Panel>

            <Tabs.Panel value="all" pt="md">
              <ScrollArea h={500}>
                <Table fz="xs" withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>类型</Table.Th>
                      <Table.Th>路径</Table.Th>
                      <Table.Th>旧值</Table.Th>
                      <Table.Th>新值</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {diffs.map((d, i) => (
                      <Table.Tr key={i}>
                        <Table.Td>
                          <Badge size="xs" color={d.type === 'added' ? 'green' : d.type === 'removed' ? 'red' : 'yellow'} variant="light">
                            {d.type === 'added' ? '新增' : d.type === 'removed' ? '删除' : '修改'}
                          </Badge>
                        </Table.Td>
                        <Table.Td ff="monospace" style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.path}
                        </Table.Td>
                        <Table.Td c="red" ff="monospace">{d.oldVal !== undefined ? formatVal(d.oldVal) : '-'}</Table.Td>
                        <Table.Td c="green" ff="monospace">{d.newVal !== undefined ? formatVal(d.newVal) : '-'}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </Stack>
  )
}
