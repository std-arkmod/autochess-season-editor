import {
  Stack, Card, Group, Text, Badge, Grid,
  ActionIcon, Title, Divider,
  ScrollArea, Table, Tabs, Tooltip,
  Button, Modal,
} from '@mantine/core'
import { CTextInput, CNumberInput, CSelect, CMultiSelect, CSwitch, CSegmentedControl, CollabEditingProvider } from '../collab/CollabInputs'
import { IconChevronRight, IconTrash, IconPlus } from '@tabler/icons-react'
import { useState, useMemo, useEffect } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { CharChessDataDict, CharShopChessData, ShopCharChessInfoDatumEvolvePhase, ChessType } from '@autochess-editor/shared'
import { chessTypeLabel, evolvePhaseLabel, getCharName, normalizeSeasonDataForRuntime } from '@autochess-editor/shared'
import { ChessLevelBadge } from '../shared/ChessLevelBadge'
import { characterNameMap } from '@autochess-editor/shared'
import type { DataStore } from '../../store/dataStore'
import { PresenceIndicator } from '../collab/PresenceIndicator'
import { useCollab } from '../../context/CollabContext'

interface Props { store: DataStore }

// 生成新棋子的默认条目
function makeDefaultShopChess(chessId: string, goldenChessId: string): CharShopChessData {
  return {
    chessId,
    goldenChessId,
    chessLevel: 1,
    shopLevelSortId: 999,
    chessType: 'NORMAL',
    charId: null,
    tmplId: null,
    defaultSkillIndex: 1,
    defaultUniEquipId: null,
    backupCharId: null,
    backupTmplId: null,
    backupCharSkillIndex: 1,
    backupCharUniEquipId: null,
    backupCharPotRank: 0,
    isHidden: false,
  }
}

function makeDefaultChessData(chessId: string, identifier: number, isGolden: boolean): CharChessDataDict {
  return {
    chessId,
    identifier,
    isGolden,
    status: {
      evolvePhase: isGolden ? 'PHASE_2' : 'PHASE_1',
      charLevel: isGolden ? 70 : 40,
      skillLevel: isGolden ? 7 : 7,
      favorPoint: 0,
      equipLevel: isGolden ? 1 : 0,
    },
    upgradeChessId: isGolden ? null : null,
    upgradeNum: isGolden ? 0 : 3,
    bondIds: [],
    garrisonIds: null,
  }
}

// charId 候选列表
const charIdOptions = Object.entries(characterNameMap as Record<string, string>)
  .filter(([id]) => id.startsWith('char_'))
  .map(([id, name]) => ({ value: id, label: `${name} (${id})` }))
  .sort((a, b) => a.label.localeCompare(b.label))

export function ChessEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason, focusId, setFocusId, navigateTo } = store
  const { updatePresence, followTargetField } = useCollab()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [statusTab, setStatusTab] = useState<string | null>('normal')

  useEffect(() => { updatePresence('chess', editingId); return () => updatePresence('chess', null) }, [editingId])

  // Auto-switch tab when following someone editing golden/normal status
  useEffect(() => {
    if (followTargetField?.startsWith('g.')) setStatusTab('golden')
    else if (followTargetField?.startsWith('n.')) setStatusTab('normal')
  }, [followTargetField])

  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newChessId, setNewChessId] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { charShopChessDatas, charChessDataDict, trapChessDataDict, bondInfoDict, chessNormalIdLookupDict, garrisonDataDict } = activeSeason?.data ?? {}

  // 切换赛季时清空选中
  useEffect(() => {
    setEditingId(null)
  }, [activeSeasonId])

  useEffect(() => {
    if (!focusId) return
    let targetId: string | null = null
    // 直接是 _a
    if (charShopChessDatas && focusId in charShopChessDatas) {
      targetId = focusId
    } else {
      // 是 _b，找对应 _a
      const normalId = chessNormalIdLookupDict?.[focusId]
      if (normalId && charShopChessDatas && normalId in charShopChessDatas) {
        targetId = normalId
      }
    }
    if (targetId) {
      setEditingId(targetId)
      // Switch filter to target chess's level
      const chess = charShopChessDatas?.[targetId]
      if (chess) {
        setLevelFilter(String(chess.chessLevel))
      }
      setFocusId(null)
    }
  }, [focusId, charShopChessDatas, chessNormalIdLookupDict, setFocusId, levelFilter])

  if (!activeSeason || !charShopChessDatas || !charChessDataDict) {
    return <Text c="dimmed">请先加载赛季数据</Text>
  }

  // 只显示有 charShopChessDatas 的普通棋子（_a），金棋子(_b)在同一条目内编辑
  const shopList = useMemo(() => {
    return Object.values(charShopChessDatas)
      .sort((a, b) => a.chessLevel - b.chessLevel || a.shopLevelSortId - b.shopLevelSortId)
  }, [charShopChessDatas])

  const filtered = useMemo(() => {
    return shopList.filter(c => {
      const name = getCharName(c.charId)
      const levelOk = levelFilter === 'all' || c.chessLevel === Number(levelFilter)
      const searchOk = !search || name.includes(search) || c.chessId.includes(search) || (c.charId ?? '').includes(search)
      return levelOk && searchOk
    })
  }, [shopList, search, levelFilter])

  const editing = editingId ? charShopChessDatas[editingId] : null
  const editingChessNormal = editingId ? charChessDataDict[editingId] : null
  const goldenChessId = editing?.goldenChessId
  const editingChessGolden = goldenChessId ? charChessDataDict[goldenChessId] : null

  function patchShop(id: string, patch: Partial<CharShopChessData>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      charShopChessDatas: { ...data.charShopChessDatas, [id]: { ...data.charShopChessDatas[id], ...patch } },
    }))
  }

  function patchChess(id: string, patch: Partial<CharChessDataDict>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      charChessDataDict: { ...data.charChessDataDict, [id]: { ...data.charChessDataDict[id], ...patch } },
    }))
  }

  function patchChessStatus(id: string, patch: Partial<CharChessDataDict['status']>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      charChessDataDict: {
        ...data.charChessDataDict,
        [id]: { ...data.charChessDataDict[id], status: { ...data.charChessDataDict[id].status, ...patch } },
      },
    }))
  }

  function addChess() {
    const id = newChessId.trim()
    if (!id) return
    if (charShopChessDatas[id]) {
      notifications.show({ title: '已存在', message: `chessId "${id}" 已存在`, color: 'red' })
      return
    }
    const goldenId = id.replace(/_a$/, '_b')
    const maxIdentifier = Math.max(
      ...Object.values(charChessDataDict).map(c => c.identifier),
      ...Object.values(trapChessDataDict ?? {}).map(t => t.identifier),
      -1
    )
    updateSeason(activeSeasonId!, data => normalizeSeasonDataForRuntime({
      ...data,
      charShopChessDatas: {
        ...data.charShopChessDatas,
        [id]: makeDefaultShopChess(id, goldenId),
      },
      charChessDataDict: {
        ...data.charChessDataDict,
        [id]: makeDefaultChessData(id, maxIdentifier + 1, false),
        [goldenId]: makeDefaultChessData(goldenId, maxIdentifier + 2, true),
      },
      chessNormalIdLookupDict: {
        ...data.chessNormalIdLookupDict,
        [id]: id,
        [goldenId]: id,
      },
    }))
    setEditingId(id)
    closeAdd()
    setNewChessId('')
    notifications.show({ title: '已新增', message: `棋子 ${id} 及其精锐版 ${goldenId} 已创建`, color: 'teal' })
  }

  function deleteChess(id: string) {
    const shopData = charShopChessDatas[id]
    const goldenId = shopData?.goldenChessId
    updateSeason(activeSeasonId!, data => {
      const nextShop = { ...data.charShopChessDatas }
      delete nextShop[id]
      const nextChess = { ...data.charChessDataDict }
      delete nextChess[id]
      if (goldenId) delete nextChess[goldenId]
      const nextLookup = { ...data.chessNormalIdLookupDict }
      delete nextLookup[id]
      if (goldenId) delete nextLookup[goldenId]
      return normalizeSeasonDataForRuntime({
        ...data,
        charShopChessDatas: nextShop,
        charChessDataDict: nextChess,
        chessNormalIdLookupDict: nextLookup,
      })
    })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
    notifications.show({ title: '已删除', message: `棋子 ${id}${goldenId ? ` 及精锐 ${goldenId}` : ''} 已删除`, color: 'orange' })
  }

  const allBondOptions = Object.entries(bondInfoDict ?? {}).map(([id, b]) => ({ value: id, label: b.name }))
  const priceInfo = editingId ? activeSeason.data.shopCharChessInfoData[editingId] : null

  function ChessStatusForm({ chessId, isGolden }: { chessId: string; isGolden: boolean }) {
    const chess = charChessDataDict[chessId]
    const prefix = isGolden ? 'g.' : 'n.'
    if (!chess) return <Text c="dimmed" size="sm">无数据（chessId: {chessId}）</Text>
    return (
      <Stack gap="sm">
        <Text size="xs" c="dimmed" ff="monospace">{chessId}</Text>
        <Grid gutter="sm">
          <Grid.Col span={4}>
            <CSelect
              label="精英阶段"
              collabField={`${prefix}evolvePhase`}
              value={chess.status.evolvePhase}
              data={[{ value: 'PHASE_1', label: '精英一' }, { value: 'PHASE_2', label: '精英二' }]}
              onChange={v => patchChessStatus(chessId, { evolvePhase: v as ShopCharChessInfoDatumEvolvePhase })}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <CNumberInput label="干员等级" collabField={`${prefix}charLevel`} value={chess.status.charLevel} min={1} onChange={v => patchChessStatus(chessId, { charLevel: Number(v) })} />
          </Grid.Col>
          <Grid.Col span={4}>
            <CNumberInput label="技能等级" collabField={`${prefix}skillLevel`} value={chess.status.skillLevel} min={1} max={10} onChange={v => patchChessStatus(chessId, { skillLevel: Number(v) })} />
          </Grid.Col>
          <Grid.Col span={4}>
            <CNumberInput label="信赖值" collabField={`${prefix}favorPoint`} value={chess.status.favorPoint} min={0} onChange={v => patchChessStatus(chessId, { favorPoint: Number(v) })} />
          </Grid.Col>
          <Grid.Col span={4}>
            <CNumberInput label="模组等级" collabField={`${prefix}equipLevel`} value={chess.status.equipLevel} min={0} max={3} onChange={v => patchChessStatus(chessId, { equipLevel: Number(v) })} />
          </Grid.Col>
          <Grid.Col span={4}>
            <CNumberInput label="升级所需数量" collabField={`${prefix}upgradeNum`} value={chess.upgradeNum} min={0} onChange={v => patchChess(chessId, { upgradeNum: Number(v) })} />
          </Grid.Col>
        </Grid>
        <Divider label="所属盟约" labelPosition="left" />
        <Group gap="xs" wrap="wrap">
          {chess.bondIds.map(bid => (
            <Badge key={bid} variant="light" color="teal" size="sm" style={{ cursor: 'pointer' }}
              onClick={() => navigateTo('bonds', bid)}>
              {bondInfoDict?.[bid]?.name ?? bid} ↗
            </Badge>
          ))}
          {chess.bondIds.length === 0 && <Text size="xs" c="dimmed">无盟约</Text>}
        </Group>
        <Divider label="干员特质（garrisonIds）" labelPosition="left" />
        <CMultiSelect
          size="xs"
          collabField={`${prefix}garrisonIds`}
          placeholder="选择特质..."
          searchable
          value={chess.garrisonIds ?? []}
          data={Object.keys(garrisonDataDict ?? {}).map(id => ({
            value: id,
            label: `${garrisonDataDict![id].garrisonDesc.replace(/<[^>]+>/g, '').slice(0, 25)} (${id})`,
          }))}
          onChange={v => patchChess(chessId, { garrisonIds: v.length > 0 ? v : null })}
          maxDropdownHeight={200}
        />
        <Group gap="xs" wrap="wrap">
          {(chess.garrisonIds ?? []).map(gid => (
            <Badge key={gid} variant="light" color="blue" size="sm" style={{ cursor: 'pointer' }}
              onClick={() => navigateTo('garrison', gid)}>
              {garrisonDataDict?.[gid]?.garrisonDesc.replace(/<[^>]+>/g, '').slice(0, 20) ?? gid} ↗
            </Badge>
          ))}
          {(chess.garrisonIds ?? []).length === 0 && <Text size="xs" c="dimmed">无特质</Text>}
        </Group>
      </Stack>
    )
  }

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>棋子列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{filtered.length}/{shopList.length}</Text>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>新增</Button>
              </Group>
            </Group>
            <CTextInput placeholder="搜索干员名或 ID..." value={search} onChange={e => setSearch(e.target.value)} size="xs" />
            <CSegmentedControl
              size="xs" value={levelFilter} onChange={setLevelFilter}
              data={[
                { value: 'all', label: '全部' },
                { value: '1', label: '一阶' }, { value: '2', label: '二阶' },
                { value: '3', label: '三阶' }, { value: '4', label: '四阶' },
                { value: '5', label: '五阶' }, { value: '6', label: '六阶' },
              ]}
            />
            <ScrollArea h={520}>
              <Stack gap="xs">
                {filtered.map(chess => {
                  const name = getCharName(chess.charId)
                  const hasGolden = !!chess.goldenChessId && !!charChessDataDict[chess.goldenChessId]
                  return (
                    <Card key={chess.chessId} padding="sm" radius="md" withBorder
                      style={{ cursor: 'pointer', borderColor: editingId === chess.chessId ? 'var(--mantine-color-teal-6)' : undefined }}
                      onClick={() => setEditingId(chess.chessId)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <div>
                          <Group gap="xs">
                            <Text fw={500} size="sm">{name}</Text>
                            <PresenceIndicator itemId={chess.chessId} />
                            <ChessLevelBadge level={chess.chessLevel} />
                            {hasGolden && <Badge size="xs" color="yellow" variant="light">有精锐</Badge>}
                            {chess.chessType === 'DIY' && <Badge size="xs" color="violet">自选</Badge>}
                            {chess.chessType === 'PRESET' && <Badge size="xs" color="gray">预置</Badge>}
                            {chess.isHidden && <Badge size="xs" color="dark">隐藏</Badge>}
                          </Group>
                          <Text size="xs" c="dimmed" ff="monospace">{chess.chessId}</Text>
                        </div>
                        <Group gap={4} wrap="nowrap">
                          <ActionIcon size="sm" variant="subtle" color="red"
                            onClick={e => { e.stopPropagation(); setDeleteConfirm(chess.chessId) }}>
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Group>
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
            <CollabEditingProvider itemId={editingId}>
            <Stack gap="md">
              <Group justify="space-between">
                <Group gap="xs">
                  <Title order={5}>{getCharName(editing.charId)}</Title>
                  <ChessLevelBadge level={editing.chessLevel} />
                </Group>
                <Text size="xs" c="dimmed" ff="monospace">{editing.chessId}</Text>
              </Group>

              <Divider label="商店配置" labelPosition="left" />
              <Grid gutter="sm">
                <Grid.Col span={12}>
                  <CSelect
                    label="绑定干员（charId）"
                    description="决定棋子使用哪位干员及其名称显示"
                    value={editing.charId ?? ''}
                    data={charIdOptions}
                    searchable
                    clearable
                    placeholder="搜索干员名..."
                    onChange={v => patchShop(editing.chessId, { charId: v || null })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="棋子阶数" value={editing.chessLevel} min={1} max={6} onChange={v => patchShop(editing.chessId, { chessLevel: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="商店排序" value={editing.shopLevelSortId} onChange={v => patchShop(editing.chessId, { shopLevelSortId: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CSelect
                    label="棋子类型"
                    value={editing.chessType}
                    data={['PRESET', 'NORMAL', 'DIY'].map(t => ({ value: t, label: `${chessTypeLabel[t]} (${t})` }))}
                    onChange={v => patchShop(editing.chessId, { chessType: v as ChessType })}
                  />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="默认技能索引" value={editing.defaultSkillIndex} min={0} onChange={v => patchShop(editing.chessId, { defaultSkillIndex: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="备用干员技能索引" value={editing.backupCharSkillIndex} min={0} onChange={v => patchShop(editing.chessId, { backupCharSkillIndex: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CNumberInput label="备用干员潜能" value={editing.backupCharPotRank} min={0} onChange={v => patchShop(editing.chessId, { backupCharPotRank: Number(v) })} />
                </Grid.Col>
                <Grid.Col span={4}>
                  <CSwitch label="隐藏（不在商店显示）" checked={editing.isHidden}
                    onChange={e => patchShop(editing.chessId, { isHidden: e.target.checked })} mt="xl" />
                </Grid.Col>
              </Grid>

              {priceInfo && priceInfo.length > 0 && (
                <>
                  <Divider label="价格信息" labelPosition="left" />
                  <Table striped withTableBorder fz="xs">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>阶段</Table.Th><Table.Th>精锐</Table.Th><Table.Th>精英</Table.Th>
                        <Table.Th>等级</Table.Th><Table.Th>技能</Table.Th>
                        <Table.Th>购买价格</Table.Th><Table.Th>出售价格</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {priceInfo.map((info, i) => (
                        <Table.Tr key={i}>
                          <Table.Td>{info.chessLevel}</Table.Td>
                          <Table.Td>{info.isGolden ? <Badge size="xs" color="yellow">是</Badge> : '否'}</Table.Td>
                          <Table.Td>{evolvePhaseLabel[info.evolvePhase] ?? info.evolvePhase}</Table.Td>
                          <Table.Td>{info.charLevel}</Table.Td>
                          <Table.Td>{info.skillLevel}</Table.Td>
                          <Table.Td c="yellow">{info.purchasePrice} 金</Table.Td>
                          <Table.Td c="teal">{info.chessSoldPrice} 金</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </>
              )}

              <Divider label="棋子状态" labelPosition="left" />
              <Tabs value={statusTab} onChange={setStatusTab}>
                <Tabs.List>
                  <Tabs.Tab value="normal">普通</Tabs.Tab>
                  {editingChessGolden && goldenChessId && (
                    <Tabs.Tab value="golden">
                      精锐 <Text span size="xs" c="dimmed" ff="monospace">({goldenChessId})</Text>
                    </Tabs.Tab>
                  )}
                </Tabs.List>
                <Tabs.Panel value="normal" pt="md">
                  {editingChessNormal
                    ? <ChessStatusForm chessId={editing.chessId} isGolden={false} />
                    : <Text c="dimmed" size="sm">无 charChessDataDict 条目</Text>}
                </Tabs.Panel>
                {editingChessGolden && goldenChessId && (
                  <Tabs.Panel value="golden" pt="md">
                    <ChessStatusForm chessId={goldenChessId} isGolden={true} />
                  </Tabs.Panel>
                )}
              </Tabs>
            </Stack>
            </CollabEditingProvider>
          ) : (
            <Card withBorder padding="xl" ta="center">
              <Text c="dimmed">← 选择左侧棋子进行编辑</Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>

      <Modal opened={addOpened} onClose={closeAdd} title="新增棋子" size="sm">
        <Stack gap="md">
          <CTextInput
            label="棋子 ID（chessId，普通版，_a 结尾）"
            placeholder="如 chess_char_1_99_a"
            value={newChessId}
            onChange={e => setNewChessId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addChess()}
          />
          <Text size="xs" c="dimmed">
            将自动创建普通版（{newChessId || 'xxx_a'}）和精锐版（{newChessId.replace(/_a$/, '_b') || 'xxx_b'}）两个条目。
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAdd}>取消</Button>
            <Button onClick={addChess} disabled={!newChessId.trim()}>创建</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除" size="sm">
        <Stack gap="md">
          <Text>确定要删除棋子 <Text span fw={700} c="red">{deleteConfirm}</Text> 吗？</Text>
          <Text size="sm" c="dimmed">同时删除对应的精锐版条目，不可撤销。</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="red" onClick={() => deleteConfirm && deleteChess(deleteConfirm)}>删除</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
