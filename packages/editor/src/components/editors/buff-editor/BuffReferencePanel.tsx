import { useState, useEffect } from 'react'
import {
  Accordion, Text, Stack, Group, Badge, Paper, UnstyledButton,
  Loader, ActionIcon, Tooltip, Modal, ScrollArea, Table, Tabs, TextInput, Code,
} from '@mantine/core'
import { IconArrowRight, IconSearch, IconMaximize, IconExternalLink } from '@tabler/icons-react'
import { useBuffEditor } from './BuffEditorContext'
import { buildEntityOwnerIndex, type EntityOwner, type UsageExample } from './buffReferenceIndex'
import { nodeNames, eventLabels, propLabels } from './buffEditorI18n'

// ─── Main Panel (sidebar) ───

export function BuffReferencePanel() {
  const { refIndex, activeKey } = useBuffEditor()
  const [entityLoading, setEntityLoading] = useState(false)
  const [entityLoaded, setEntityLoaded] = useState(false)
  const [modalTab, setModalTab] = useState<string | null>(null)

  useEffect(() => {
    if (!refIndex || entityLoaded || entityLoading) return
    setEntityLoading(true)
    buildEntityOwnerIndex(refIndex).then(() => {
      setEntityLoaded(true)
      setEntityLoading(false)
    })
  }, [refIndex, entityLoaded, entityLoading])

  if (!refIndex || !activeKey) {
    return (
      <Stack align="center" justify="center" style={{ height: '100%' }}>
        <Text size="xs" c="dimmed">选择模板后查看引用</Text>
      </Stack>
    )
  }

  const refsCount = (refIndex.referencedBy.get(activeKey)?.size ?? 0) + (refIndex.entityOwners.get(activeKey)?.length ?? 0)
  const depsCount = refIndex.dependsOn.get(activeKey)?.size ?? 0

  return (
    <>
      <Stack gap="xs" style={{ height: '100%', overflow: 'hidden' }}>
        <Group gap={4} justify="space-between">
          <Text size="xs" fw={600}>引用分析</Text>
          <Tooltip label="展开完整视图">
            <ActionIcon size={20} variant="subtle" onClick={() => setModalTab('refs')}>
              <IconMaximize size={12} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Accordion variant="separated" multiple defaultValue={['refs', 'deps']}>
            <Accordion.Item value="refs">
              <Accordion.Control>
                <Group gap={6}>
                  <Text size="10px">查找引用</Text>
                  <Badge size="xs" variant="light">{refsCount}</Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <ReferencedBySection activeKey={activeKey} entityLoading={entityLoading} compact />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="deps">
              <Accordion.Control>
                <Group gap={6}>
                  <Text size="10px">依赖</Text>
                  <Badge size="xs" variant="light">{depsCount}</Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <DependsOnSection activeKey={activeKey} compact />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="usage">
              <Accordion.Control>
                <Group gap={6}>
                  <Text size="10px">使用示例</Text>
                  <SelectedNodeBadge />
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <UsageExamplesSection compact />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="graph">
              <Accordion.Control>
                <Group gap={6}>
                  <Text size="10px">关系图</Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <DependencyGraphSection activeKey={activeKey} />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </div>
      </Stack>

      {/* ── Full Modal ── */}
      <ReferenceModal
        opened={modalTab !== null}
        onClose={() => setModalTab(null)}
        activeTab={modalTab}
        onTabChange={setModalTab}
        activeKey={activeKey}
        entityLoading={entityLoading}
      />
    </>
  )
}

// ─── Modal ───

function ReferenceModal({
  opened, onClose, activeTab, onTabChange, activeKey, entityLoading,
}: {
  opened: boolean
  onClose: () => void
  activeTab: string | null
  onTabChange: (v: string | null) => void
  activeKey: string
  entityLoading: boolean
}) {
  const { refIndex } = useBuffEditor()
  if (!refIndex) return null

  const refsCount = (refIndex.referencedBy.get(activeKey)?.size ?? 0) + (refIndex.entityOwners.get(activeKey)?.length ?? 0)
  const depsCount = refIndex.dependsOn.get(activeKey)?.size ?? 0

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Group gap={8}><Text fw={600}>引用分析</Text><Code>{activeKey}</Code></Group>}
      size="xl"
      styles={{ body: { padding: 0 } }}
    >
      <Tabs value={activeTab} onChange={onTabChange}>
        <Tabs.List>
          <Tabs.Tab value="refs">查找引用 <Badge size="xs" variant="light" ml={4}>{refsCount}</Badge></Tabs.Tab>
          <Tabs.Tab value="deps">依赖 <Badge size="xs" variant="light" ml={4}>{depsCount}</Badge></Tabs.Tab>
          <Tabs.Tab value="usage">使用示例</Tabs.Tab>
          <Tabs.Tab value="graph">关系图</Tabs.Tab>
          <Tabs.Tab value="raw">原始数据</Tabs.Tab>
        </Tabs.List>

        <ScrollArea h={480} p="md">
          <Tabs.Panel value="refs">
            <ReferencedBySection activeKey={activeKey} entityLoading={entityLoading} compact={false} />
          </Tabs.Panel>
          <Tabs.Panel value="deps">
            <DependsOnSection activeKey={activeKey} compact={false} />
          </Tabs.Panel>
          <Tabs.Panel value="usage">
            <UsageExamplesSection compact={false} />
          </Tabs.Panel>
          <Tabs.Panel value="graph">
            <DependencyGraphSection activeKey={activeKey} full />
          </Tabs.Panel>
          <Tabs.Panel value="raw">
            <RawDataSection activeKey={activeKey} />
          </Tabs.Panel>
        </ScrollArea>
      </Tabs>
    </Modal>
  )
}

// ─── Shared Components ───

function SelectedNodeBadge() {
  const { selectedNodeType } = useBuffEditor()
  if (!selectedNodeType) return null
  return <Badge size="xs" variant="light" color="teal">{nodeNames[selectedNodeType] ?? selectedNodeType}</Badge>
}

function RefLink({ templateKey, showDetail }: { templateKey: string; showDetail?: boolean }) {
  const { goToDefinition, refTemplates } = useBuffEditor()
  const template = refTemplates?.[templateKey]
  return (
    <UnstyledButton onClick={() => goToDefinition(templateKey)} style={{ width: '100%' }}>
      <Paper p={showDetail ? 8 : 4} style={{ fontSize: showDetail ? 12 : 10 }}>
        <Group gap={4} wrap="nowrap">
          <IconArrowRight size={showDetail ? 12 : 10} style={{ flexShrink: 0 }} />
          <Text size={showDetail ? 'xs' : '10px'} fw={500} truncate style={{ flex: 1 }} title={templateKey}>{templateKey}</Text>
          {showDetail && template && (
            <>
              {template.effectKey && <Badge size="xs" variant="outline" color="gray">{template.effectKey}</Badge>}
              <Badge size="xs" variant="dot" color="gray">{Object.keys(template.eventToActions ?? {}).length} 事件</Badge>
            </>
          )}
        </Group>
        {showDetail && template && (
          <Group gap={4} mt={4} ml={16}>
            {Object.keys(template.eventToActions ?? {}).map(ev => (
              <Badge key={ev} size="xs" variant="light" color="blue">{eventLabels[ev] ?? ev}</Badge>
            ))}
          </Group>
        )}
      </Paper>
    </UnstyledButton>
  )
}

function EntityItem({ owner, showDetail }: { owner: EntityOwner; showDetail?: boolean }) {
  const colorMap: Record<string, string> = { skill: 'blue', talent: 'grape', equip: 'teal', enemy: 'red', token: 'orange', other: 'gray' }
  const labelMap: Record<string, string> = { skill: '技能', talent: '天赋', equip: '模组', enemy: '敌人', token: '召唤物', other: '其他' }
  return (
    <Paper p={showDetail ? 8 : 4} style={{ fontSize: showDetail ? 12 : 10 }}>
      <Group gap={showDetail ? 8 : 4} wrap="nowrap">
        <Badge size={showDetail ? 'sm' : 'xs'} variant="light" color={colorMap[owner.type] ?? 'gray'}>{labelMap[owner.type] ?? owner.type}</Badge>
        <Text size={showDetail ? 'sm' : '10px'} fw={500}>{owner.entityName}</Text>
        <Text size={showDetail ? 'xs' : '9px'} c="dimmed" truncate style={{ flex: 1 }}>{owner.detail}</Text>
        {showDetail && <Text size="xs" c="dimmed" ff="monospace">{owner.entityId}</Text>}
      </Group>
    </Paper>
  )
}

// ─── Sections (compact vs full) ───

function ReferencedBySection({ activeKey, entityLoading, compact }: { activeKey: string; entityLoading: boolean; compact: boolean }) {
  const { refIndex } = useBuffEditor()
  const [filter, setFilter] = useState('')
  if (!refIndex) return null

  const buffRefs = refIndex.referencedBy.get(activeKey)
  const entities = refIndex.entityOwners.get(activeKey)

  if (!buffRefs?.size && !entities?.length && !entityLoading) {
    return <Text size={compact ? '10px' : 'sm'} c="dimmed">无引用</Text>
  }

  const allRefs = buffRefs ? [...buffRefs] : []
  const filteredRefs = filter ? allRefs.filter(k => k.toLowerCase().includes(filter.toLowerCase())) : allRefs
  const filteredEntities = entities && filter
    ? entities.filter(e => e.entityName.toLowerCase().includes(filter.toLowerCase()) || e.detail.toLowerCase().includes(filter.toLowerCase()) || e.entityId.toLowerCase().includes(filter.toLowerCase()))
    : entities
  const limit = compact ? 30 : Infinity

  return (
    <Stack gap={compact ? 4 : 8}>
      {!compact && (allRefs.length > 10 || (entities?.length ?? 0) > 5) && (
        <TextInput
          size="xs"
          placeholder="搜索引用..."
          leftSection={<IconSearch size={12} />}
          value={filter}
          onChange={e => setFilter(e.currentTarget.value)}
        />
      )}
      {filteredRefs.length > 0 && (
        <>
          <Text size={compact ? '9px' : 'xs'} c="dimmed" fw={600}>被其他Buff引用 ({filteredRefs.length})</Text>
          {filteredRefs.slice(0, limit).map(k => <RefLink key={k} templateKey={k} showDetail={!compact} />)}
          {compact && filteredRefs.length > limit && <Text size="9px" c="dimmed">还有 {filteredRefs.length - limit} 个...</Text>}
        </>
      )}
      {filteredEntities && filteredEntities.length > 0 && (
        <>
          <Text size={compact ? '9px' : 'xs'} c="dimmed" fw={600} mt={4}>归属游戏实体 ({filteredEntities.length})</Text>
          {filteredEntities.map((e, i) => <EntityItem key={i} owner={e} showDetail={!compact} />)}
        </>
      )}
      {entityLoading && (
        <Group gap={4}>
          <Loader size={compact ? 10 : 14} />
          <Text size={compact ? '9px' : 'xs'} c="dimmed">加载角色/敌人数据...</Text>
        </Group>
      )}
    </Stack>
  )
}

function DependsOnSection({ activeKey, compact }: { activeKey: string; compact: boolean }) {
  const { refIndex } = useBuffEditor()
  if (!refIndex) return null

  const deps = refIndex.dependsOn.get(activeKey)
  if (!deps?.size) return <Text size={compact ? '10px' : 'sm'} c="dimmed">无依赖</Text>

  const allDeps = [...deps]
  return (
    <Stack gap={compact ? 4 : 8}>
      <Text size={compact ? '9px' : 'xs'} c="dimmed" fw={600}>依赖 {allDeps.length} 个Buff模板</Text>
      {allDeps.map(k => <RefLink key={k} templateKey={k} showDetail={!compact} />)}
    </Stack>
  )
}

function UsageExamplesSection({ compact }: { compact: boolean }) {
  const { refIndex, selectedNodeType, goToDefinition } = useBuffEditor()
  if (!refIndex) return null

  if (!selectedNodeType) {
    return <Text size={compact ? '10px' : 'sm'} c="dimmed">点击画布上的节点查看同类用法</Text>
  }

  const examples = refIndex.nodeTypeUsage.get(selectedNodeType)
  if (!examples?.length) {
    return <Text size={compact ? '10px' : 'sm'} c="dimmed">无示例</Text>
  }

  const displayName = nodeNames[selectedNodeType] ?? selectedNodeType

  if (compact) {
    return (
      <Stack gap={4}>
        <Text size="9px" c="dimmed">{displayName} 在游戏数据中的用法:</Text>
        {examples.map((ex, i) => (
          <UnstyledButton key={i} onClick={() => goToDefinition(ex.templateKey)} style={{ width: '100%' }}>
            <Paper p={4} style={{ fontSize: 10 }}>
              <Group gap={4} mb={2}>
                <IconSearch size={9} />
                <Text size="9px" fw={500} truncate title={ex.templateKey}>{ex.templateKey}</Text>
                <Text size="8px" c="dimmed">{eventLabels[ex.eventType] ?? ex.eventType}</Text>
              </Group>
              <div style={{ paddingLeft: 12 }}>
                {Object.entries(ex.props).slice(0, 5).map(([k, v]) => (
                  <Text key={k} size="9px" c="dimmed" truncate>
                    {k}: {String(v)}
                  </Text>
                ))}
              </div>
            </Paper>
          </UnstyledButton>
        ))}
      </Stack>
    )
  }

  // Full modal view — table with all props
  return (
    <Stack gap={8}>
      <Text size="sm" fw={500}>{displayName} <Text span c="dimmed" size="xs">({selectedNodeType})</Text></Text>
      <Text size="xs" c="dimmed">{examples.length} 个使用示例</Text>
      {examples.map((ex, i) => <UsageExampleCard key={i} example={ex} index={i} />)}
    </Stack>
  )
}

function UsageExampleCard({ example, index }: { example: UsageExample; index: number }) {
  const { goToDefinition } = useBuffEditor()
  const propEntries = Object.entries(example.props)
  return (
    <Paper p="sm" withBorder>
      <Group gap={8} mb={8}>
        <Badge size="sm" variant="light" circle>{index + 1}</Badge>
        <UnstyledButton onClick={() => goToDefinition(example.templateKey)}>
          <Group gap={4}>
            <IconExternalLink size={12} />
            <Text size="sm" fw={500} td="underline">{example.templateKey}</Text>
          </Group>
        </UnstyledButton>
        <Badge size="sm" variant="light" color="blue">{eventLabels[example.eventType] ?? example.eventType}</Badge>
      </Group>
      {propEntries.length > 0 && (
        <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 180 }}>属性</Table.Th>
              <Table.Th>翻译</Table.Th>
              <Table.Th>值</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {propEntries.map(([k, v]) => (
              <Table.Tr key={k}>
                <Table.Td><Code>{k}</Code></Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{propLabels[k] ?? '-'}</Text></Table.Td>
                <Table.Td><Text size="xs" ff="monospace">{String(v)}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  )
}

// ─── Dependency Graph ───

function DependencyGraphSection({ activeKey, full }: { activeKey: string; full?: boolean }) {
  const { refIndex, goToDefinition } = useBuffEditor()
  if (!refIndex) return null

  const refs = refIndex.referencedBy.get(activeKey)
  const deps = refIndex.dependsOn.get(activeKey)
  const limit = full ? 50 : 10
  const inList = refs ? [...refs].slice(0, limit) : []
  const outList = deps ? [...deps].slice(0, limit) : []

  if (!inList.length && !outList.length) {
    return <Text size={full ? 'sm' : '10px'} c="dimmed">无引用关系</Text>
  }

  const fs = full ? 12 : 10
  const nodeFs = full ? '11px' : '9px'
  const pad = full ? 8 : 3

  return (
    <Stack gap={full ? 12 : 6}>
      <div style={{ display: 'flex', gap: full ? 16 : 8, alignItems: 'flex-start', fontSize: fs }}>
        {/* Incoming */}
        {inList.length > 0 && (
          <Stack gap={full ? 4 : 2} style={{ flex: 1, minWidth: 0 }}>
            <Text size={nodeFs} c="dimmed" ta="center" fw={600}>引用方 ({refs?.size ?? 0})</Text>
            {inList.map(k => (
              <UnstyledButton key={k} onClick={() => goToDefinition(k)} style={{ width: '100%' }}>
                <Paper p={pad} style={{ fontSize: fs, textAlign: 'center' }}>
                  <Text size={nodeFs} truncate title={k}>{k}</Text>
                </Paper>
              </UnstyledButton>
            ))}
          </Stack>
        )}

        {/* Center */}
        <Stack gap={2} align="center" style={{ flexShrink: 0 }}>
          {inList.length > 0 && <Text c="dimmed" size={full ? 'md' : '10px'}>→</Text>}
          <Paper p={full ? 12 : 6} style={{ border: '2px solid #3498db', textAlign: 'center', minWidth: full ? 120 : 60 }}>
            <Text size={full ? 'sm' : '9px'} fw={700} truncate>{activeKey}</Text>
          </Paper>
          {outList.length > 0 && <Text c="dimmed" size={full ? 'md' : '10px'}>→</Text>}
        </Stack>

        {/* Outgoing */}
        {outList.length > 0 && (
          <Stack gap={full ? 4 : 2} style={{ flex: 1, minWidth: 0 }}>
            <Text size={nodeFs} c="dimmed" ta="center" fw={600}>依赖 ({deps?.size ?? 0})</Text>
            {outList.map(k => (
              <UnstyledButton key={k} onClick={() => goToDefinition(k)} style={{ width: '100%' }}>
                <Paper p={pad} style={{ fontSize: fs, textAlign: 'center' }}>
                  <Text size={nodeFs} truncate title={k}>{k}</Text>
                </Paper>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </div>

      {((refs?.size ?? 0) > limit || (deps?.size ?? 0) > limit) && (
        <Text size={full ? 'xs' : '9px'} c="dimmed" ta="center">仅显示前 {limit} 项</Text>
      )}
    </Stack>
  )
}

// ─── Raw Data Section (modal only) ───

function RawDataSection({ activeKey }: { activeKey: string }) {
  const { refIndex, refTemplates } = useBuffEditor()
  if (!refIndex) return null

  const template = refTemplates?.[activeKey]

  return (
    <Stack gap="md">
      {/* Template metadata */}
      <div>
        <Text size="sm" fw={600} mb={4}>模板元数据</Text>
        {template ? (
          <Table striped withTableBorder fz="xs">
            <Table.Tbody>
              <Table.Tr><Table.Td fw={500}>templateKey</Table.Td><Table.Td><Code>{template.templateKey}</Code></Table.Td></Table.Tr>
              <Table.Tr><Table.Td fw={500}>effectKey</Table.Td><Table.Td><Code>{template.effectKey || '(空)'}</Code></Table.Td></Table.Tr>
              <Table.Tr><Table.Td fw={500}>onEventPriority</Table.Td><Table.Td><Code>{template.onEventPriority}</Code></Table.Td></Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>事件数量</Table.Td>
                <Table.Td>{Object.keys(template.eventToActions ?? {}).length}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="xs" c="dimmed">无法获取模板数据（可能来自用户赛季数据）</Text>
        )}
      </div>

      {/* Event breakdown */}
      {template && Object.keys(template.eventToActions ?? {}).length > 0 && (
        <div>
          <Text size="sm" fw={600} mb={4}>事件/动作分布</Text>
          <Table striped withTableBorder fz="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>事件</Table.Th>
                <Table.Th>翻译</Table.Th>
                <Table.Th style={{ width: 80 }}>动作数</Table.Th>
                <Table.Th>节点类型</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {Object.entries(template.eventToActions).map(([ev, actions]) => {
                const types = new Set<string>()
                if (Array.isArray(actions)) {
                  for (const a of actions) {
                    if (a?.$type) {
                      const short = String(a.$type).replace(/, Assembly-CSharp$/i, '').split(/[.+]/).pop() ?? a.$type
                      types.add(short)
                    }
                  }
                }
                return (
                  <Table.Tr key={ev}>
                    <Table.Td><Code>{ev}</Code></Table.Td>
                    <Table.Td><Text size="xs">{eventLabels[ev] ?? '-'}</Text></Table.Td>
                    <Table.Td>{Array.isArray(actions) ? actions.length : 0}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {[...types].map(t => (
                          <Badge key={t} size="xs" variant="light">{nodeNames[t] ?? t}</Badge>
                        ))}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {/* Cross-reference summary */}
      <div>
        <Text size="sm" fw={600} mb={4}>引用统计</Text>
        <Table striped withTableBorder fz="xs">
          <Table.Tbody>
            <Table.Tr><Table.Td fw={500}>被引用次数</Table.Td><Table.Td>{refIndex.referencedBy.get(activeKey)?.size ?? 0}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td fw={500}>依赖其他Buff数</Table.Td><Table.Td>{refIndex.dependsOn.get(activeKey)?.size ?? 0}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td fw={500}>归属游戏实体数</Table.Td><Table.Td>{refIndex.entityOwners.get(activeKey)?.length ?? 0}</Table.Td></Table.Tr>
          </Table.Tbody>
        </Table>
      </div>

      {/* Raw JSON */}
      {template && (
        <div>
          <Text size="sm" fw={600} mb={4}>原始 JSON</Text>
          <Code block style={{ maxHeight: 300, overflow: 'auto', fontSize: 11 }}>
            {JSON.stringify(template, null, 2)}
          </Code>
        </div>
      )}
    </Stack>
  )
}
