import {
  Stack, Card, Group, Text, Badge, Grid, NumberInput,
  ActionIcon, Title, TextInput, Select, Divider,
  ScrollArea, Switch, SegmentedControl, Tooltip,
  Button, Modal, Textarea, Tabs,
} from '@mantine/core'
import { IconExternalLink, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react'
import { useState, useMemo } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import type { TrapChessDataDict, TrapShopChessData, ItemTypeEnum } from '../../autochess-season-data'
import { getCharName } from '../../store/utils'
import { RichTextPreview } from '../shared/RichTextPreview'
import type { DataStore } from '../../store/dataStore'

interface Props { store: DataStore }

const DEFAULT_TRAP: Omit<TrapChessDataDict, 'chessId' | 'identifier'> = {
  charId: '',
  isGolden: false,
  purchasePrice: 0,
  status: { evolvePhase: 'PHASE_0', trapLevel: 1, skillIndex: 0, skillLevel: 1 },
  upgradeChessId: null,
  upgradeNum: 3,
  trapDuration: -1,
  effectId: '',
  giveBondId: null,
  givePowerId: null,
  canGiveBond: false,
  itemType: 'EQUIP',
}

function makeDefaultShopTrap(itemId: string, type: ItemTypeEnum): TrapShopChessData {
  return {
    itemId,
    goldenItemId: null,
    hideInShop: false,
    itemLevel: 1,
    iconLevel: 1,
    shopLevelSortId: 999,
    itemType: type,
    trapId: itemId,
  }
}

export function TrapsEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason, navigateTo } = store
  // editingId 始终是普通版（_a）的 chessId
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false)
  const [newChessId, setNewChessId] = useState('')
  const [newItemType, setNewItemType] = useState<ItemTypeEnum>('EQUIP')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [importShopOpened, { open: openImportShop, close: closeImportShop }] = useDisclosure(false)
  const [importShopJson, setImportShopJson] = useState('')

  if (!activeSeason) return <Text c="dimmed">请先加载赛季数据</Text>

  const {
    trapChessDataDict,
    trapShopChessDatas = {},
    effectInfoDataDict,
    bondInfoDict,
    chessNormalIdLookupDict = {},
  } = activeSeason.data

  // 构建反向 lookup：normalId -> goldenId
  // trapChessDataDict 里普通版有 upgradeChessId 指向进阶版
  // 同时 chessNormalIdLookupDict[goldenId] = normalId
  // 列表只展示普通版（isGolden=false），或者没有被任何 normalId 映射到的孤立条目
  const { normalTraps, goldenIdOf } = useMemo(() => {
    // goldenIdOf: normalChessId -> goldenChessId
    const goldenIdOf: Record<string, string> = {}
    // goldenIds: set of all golden chessIds
    const goldenIds = new Set<string>()

    for (const [id, trap] of Object.entries(trapChessDataDict)) {
      if (trap.upgradeChessId) {
        goldenIdOf[id] = trap.upgradeChessId
        goldenIds.add(trap.upgradeChessId)
      }
    }
    // 也通过 chessNormalIdLookupDict 补充：如果 lookup[x] = y 且 x !== y，则 x 是 y 的进阶版
    for (const [id, normalId] of Object.entries(chessNormalIdLookupDict)) {
      if (id !== normalId && trapChessDataDict[id]) {
        goldenIds.add(id)
        if (!goldenIdOf[normalId]) goldenIdOf[normalId] = id
      }
    }

    // 普通版 = 不在 goldenIds 中的 trapChessDataDict 条目
    const normalTraps = Object.values(trapChessDataDict)
      .filter(t => !goldenIds.has(t.chessId))
      .sort((a, b) => a.identifier - b.identifier)

    return { normalTraps, goldenIdOf }
  }, [trapChessDataDict, chessNormalIdLookupDict])

  const filtered = useMemo(() => {
    return normalTraps.filter(t => {
      const name = getCharName(t.charId)
      const typeOk = typeFilter === 'all' || t.itemType === typeFilter
      const searchOk = !search || name.includes(search) || t.chessId.includes(search) || t.charId.includes(search)
      return typeOk && searchOk
    })
  }, [normalTraps, search, typeFilter])

  const editingNormal = editingId ? trapChessDataDict[editingId] : null
  const goldenChessId = editingId ? goldenIdOf[editingId] : undefined
  const editingGolden = goldenChessId ? trapChessDataDict[goldenChessId] : null

  // 商店数据始终挂在普通版 id 上
  const editingShop = editingId ? trapShopChessDatas[editingId] : null

  const editingEffect = editingNormal ? effectInfoDataDict[editingNormal.effectId] : null
  const editingBond = editingNormal?.giveBondId ? bondInfoDict[editingNormal.giveBondId] : null

  function patchTrap(id: string, patch: Partial<TrapChessDataDict>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      trapChessDataDict: { ...data.trapChessDataDict, [id]: { ...data.trapChessDataDict[id], ...patch } },
    }))
  }

  function patchShop(normalId: string, patch: Partial<TrapShopChessData>) {
    updateSeason(activeSeasonId!, data => ({
      ...data,
      trapShopChessDatas: {
        ...(data.trapShopChessDatas ?? {}),
        [normalId]: { ...(data.trapShopChessDatas ?? {})[normalId], ...patch },
      },
    }))
  }

  function addTrap() {
    const id = newChessId.trim()
    if (!id) return
    if (trapChessDataDict[id]) {
      notifications.show({ title: '已存在', message: `chessId "${id}" 已存在`, color: 'red' })
      return
    }
    const goldenId = id.replace(/_a$/, '_b')
    const maxId = Math.max(...Object.values(trapChessDataDict).map(t => t.identifier), -1)
    updateSeason(activeSeasonId!, data => ({
      ...data,
      trapChessDataDict: {
        ...data.trapChessDataDict,
        [id]: { ...DEFAULT_TRAP, chessId: id, identifier: maxId + 1, itemType: newItemType, upgradeChessId: goldenId },
        [goldenId]: { ...DEFAULT_TRAP, chessId: goldenId, identifier: maxId + 2, itemType: newItemType, isGolden: true, upgradeChessId: null },
      },
      trapShopChessDatas: {
        ...(data.trapShopChessDatas ?? {}),
        [id]: makeDefaultShopTrap(id, newItemType),
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
    setNewItemType('EQUIP')
    notifications.show({ title: '已新增', message: `${newItemType === 'EQUIP' ? '装备' : '法术'} ${id} 及进阶版 ${goldenId} 已创建`, color: 'teal' })
  }

  function deleteTrap(id: string) {
    const golden = goldenIdOf[id]
    updateSeason(activeSeasonId!, data => {
      const nextTrap = { ...data.trapChessDataDict }
      delete nextTrap[id]
      if (golden) delete nextTrap[golden]
      const nextShop = { ...(data.trapShopChessDatas ?? {}) }
      delete nextShop[id]
      const nextLookup = { ...data.chessNormalIdLookupDict }
      delete nextLookup[id]
      if (golden) delete nextLookup[golden]
      return { ...data, trapChessDataDict: nextTrap, trapShopChessDatas: nextShop, chessNormalIdLookupDict: nextLookup }
    })
    if (editingId === id) setEditingId(null)
    setDeleteConfirm(null)
    notifications.show({ title: '已删除', message: `${id}${golden ? ` 及进阶版 ${golden}` : ''} 已删除`, color: 'orange' })
  }

  function importShopData() {
    try {
      const parsed = JSON.parse(importShopJson)
      let dict: Record<string, TrapShopChessData>
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const firstVal = Object.values(parsed)[0]
        if (firstVal && typeof firstVal === 'object' && 'itemId' in (firstVal as object)) {
          dict = parsed as Record<string, TrapShopChessData>
        } else if (parsed.trapShopChessDatas) {
          dict = parsed.trapShopChessDatas as Record<string, TrapShopChessData>
        } else {
          throw new Error('无法识别的格式，请粘贴 trapShopChessDatas 字段的值（{ [itemId]: {...} }）')
        }
      } else {
        throw new Error('顶层必须是 JSON 对象')
      }
      const count = Object.keys(dict).length
      updateSeason(activeSeasonId!, data => ({
        ...data,
        trapShopChessDatas: { ...(data.trapShopChessDatas ?? {}), ...dict },
      }))
      closeImportShop()
      setImportShopJson('')
      notifications.show({ title: '导入成功', message: `已合并 ${count} 条商店数据`, color: 'teal' })
    } catch (e) {
      notifications.show({ title: '导入失败', message: e instanceof Error ? e.message : 'JSON 格式错误', color: 'red' })
    }
  }

  const bondOptions = [
    { value: '', label: '（无）' },
    ...Object.entries(bondInfoDict).map(([id, b]) => ({ value: id, label: b.name })),
  ]
  const effectOptions = Object.entries(effectInfoDataDict).map(([id, e]) => ({
    value: id,
    label: `${e.effectName || id}`,
  }))

  // 单个装备的战斗数据表单（普通版/进阶版共用）
  function TrapDataForm({ trap }: { trap: TrapChessDataDict }) {
    const effect = effectInfoDataDict[trap.effectId]
    const bond = trap.giveBondId ? bondInfoDict[trap.giveBondId] : null
    return (
      <Stack gap="sm">
        <Grid gutter="sm">
          <Grid.Col span={4}>
            <Select
              label="物品类型"
              value={trap.itemType}
              data={[
                { value: 'EQUIP', label: '装备 (EQUIP)' },
                { value: 'MAGIC', label: '法术 (MAGIC)' },
              ]}
              onChange={v => patchTrap(trap.chessId, { itemType: v as ItemTypeEnum })}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <NumberInput
              label="购买价格（金）"
              value={trap.purchasePrice}
              min={0}
              onChange={v => patchTrap(trap.chessId, { purchasePrice: Number(v) })}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <NumberInput
              label="持续时间（秒，-1=永久）"
              value={trap.trapDuration}
              min={-1}
              onChange={v => patchTrap(trap.chessId, { trapDuration: Number(v) })}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <NumberInput
              label="升级所需数量"
              value={trap.upgradeNum}
              min={1}
              onChange={v => patchTrap(trap.chessId, { upgradeNum: Number(v) })}
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <Switch
              label="是否进阶"
              checked={trap.isGolden}
              onChange={e => patchTrap(trap.chessId, { isGolden: e.target.checked })}
              mt="xl"
            />
          </Grid.Col>
          <Grid.Col span={4}>
            <Switch
              label="可提供盟约"
              checked={trap.canGiveBond}
              onChange={e => patchTrap(trap.chessId, { canGiveBond: e.target.checked })}
              mt="xl"
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <Select
              label="所属盟约"
              value={trap.giveBondId ?? ''}
              data={bondOptions}
              searchable
              onChange={v => patchTrap(trap.chessId, { giveBondId: v || null })}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <Group gap="xs" align="flex-end">
              <div style={{ flex: 1 }}>
                <Select
                  label="效果 ID"
                  value={trap.effectId}
                  data={effectOptions}
                  searchable
                  onChange={v => patchTrap(trap.chessId, { effectId: v! })}
                />
              </div>
              {trap.effectId && (
                <Tooltip label="跳转到效果编辑">
                  <ActionIcon mb={2} variant="light" color="teal" onClick={() => navigateTo('effects', trap.effectId)}>
                    <IconExternalLink size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Grid.Col>
        </Grid>
        {effect && (
          <>
            <Divider label="关联效果" labelPosition="left" />
            <Card withBorder padding="sm">
              <Group gap="xs" mb={4}>
                <Text fw={500} size="sm">{effect.effectName || effect.effectId}</Text>
                <Badge size="xs" color="teal">{effect.effectType}</Badge>
                <Badge size="xs" color="gray">持续 {effect.continuedRound === -1 ? '永久' : `${effect.continuedRound}回合`}</Badge>
              </Group>
              <RichTextPreview text={effect.effectDesc} maxLen={120} />
            </Card>
          </>
        )}
        {bond && (
          <>
            <Divider label="所属盟约" labelPosition="left" />
            <Card withBorder padding="sm">
              <Text fw={500} size="sm">{bond.name}</Text>
              <RichTextPreview text={bond.desc} maxLen={100} />
            </Card>
          </>
        )}
      </Stack>
    )
  }

  return (
    <>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Title order={5}>装备/法术列表</Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">{filtered.length}/{normalTraps.length}</Text>
                <Tooltip label="粘贴 trapShopChessDatas JSON 补全商店数据" openDelay={400}>
                  <Button size="xs" leftSection={<IconUpload size={12} />} variant="light" color="orange" onClick={openImportShop}>
                    导入商店数据
                  </Button>
                </Tooltip>
                <Button size="xs" leftSection={<IconPlus size={12} />} variant="light" onClick={openAdd}>
                  新增
                </Button>
              </Group>
            </Group>
            <TextInput
              placeholder="搜索名称或 ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              size="xs"
            />
            <SegmentedControl
              size="xs"
              value={typeFilter}
              onChange={setTypeFilter}
              data={[
                { value: 'all', label: '全部' },
                { value: 'EQUIP', label: '装备' },
                { value: 'MAGIC', label: '法术' },
              ]}
            />
            <ScrollArea h={500}>
              <Stack gap="xs">
                {filtered.map(trap => {
                  const name = getCharName(trap.charId)
                  const golden = goldenIdOf[trap.chessId]
                  const hasShop = !!trapShopChessDatas[trap.chessId]
                  return (
                    <Card
                      key={trap.chessId}
                      padding="sm"
                      radius="md"
                      withBorder
                      style={{
                        cursor: 'pointer',
                        borderColor: editingId === trap.chessId ? 'var(--mantine-color-teal-6)' : undefined,
                      }}
                      onClick={() => setEditingId(trap.chessId)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <div style={{ minWidth: 0 }}>
                          <Group gap="xs">
                            <Text fw={500} size="sm" truncate>{name || trap.chessId}</Text>
                            <Badge size="xs" color={trap.itemType === 'EQUIP' ? 'blue' : 'violet'} variant="light">
                              {trap.itemType === 'EQUIP' ? '装备' : '法术'}
                            </Badge>
                            {golden && <Badge size="xs" color="yellow" variant="light">有进阶</Badge>}
                            {!hasShop && <Badge size="xs" color="red" variant="outline">无商店数据</Badge>}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {trap.purchasePrice} 金 · 持续{trap.trapDuration === -1 ? '永久' : `${trap.trapDuration}s`}
                          </Text>
                        </div>
                        <ActionIcon
                          size="sm" variant="subtle" color="red"
                          onClick={e => { e.stopPropagation(); setDeleteConfirm(trap.chessId) }}
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Group>
                    </Card>
                  )
                })}
              </Stack>
            </ScrollArea>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          {editingNormal ? (
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={5}>编辑：{getCharName(editingNormal.charId) || editingNormal.chessId}</Title>
                <Text size="xs" c="dimmed" ff="monospace">{editingNormal.chessId}</Text>
              </Group>

              {/* 战斗数据 Tabs：普通版 / 进阶版 */}
              <Tabs defaultValue="normal">
                <Tabs.List>
                  <Tabs.Tab value="normal">普通版</Tabs.Tab>
                  {editingGolden && (
                    <Tabs.Tab value="golden">
                      进阶版 <Text span size="xs" c="dimmed" ff="monospace">({goldenChessId})</Text>
                    </Tabs.Tab>
                  )}
                </Tabs.List>
                <Tabs.Panel value="normal" pt="md">
                  <TrapDataForm trap={editingNormal} />
                </Tabs.Panel>
                {editingGolden && (
                  <Tabs.Panel value="golden" pt="md">
                    <TrapDataForm trap={editingGolden} />
                  </Tabs.Panel>
                )}
              </Tabs>

              {/* 商店配置（只挂在普通版 id 上） */}
              <Divider label="商店配置（trapShopChessDatas）" labelPosition="left" />
              {editingShop ? (
                <Grid gutter="sm">
                  <Grid.Col span={4}>
                    <Select
                      label="商店物品类型"
                      value={editingShop.itemType}
                      data={[
                        { value: 'EQUIP', label: '装备 (EQUIP)' },
                        { value: 'MAGIC', label: '法术 (MAGIC)' },
                      ]}
                      onChange={v => patchShop(editingNormal.chessId, { itemType: v as ItemTypeEnum })}
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <NumberInput
                      label="物品等级（itemLevel）"
                      value={editingShop.itemLevel}
                      min={1}
                      onChange={v => patchShop(editingNormal.chessId, { itemLevel: Number(v) })}
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <NumberInput
                      label="图标等级（iconLevel）"
                      value={editingShop.iconLevel}
                      min={1}
                      onChange={v => patchShop(editingNormal.chessId, { iconLevel: Number(v) })}
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <NumberInput
                      label="商店排序（shopLevelSortId）"
                      value={editingShop.shopLevelSortId}
                      onChange={v => patchShop(editingNormal.chessId, { shopLevelSortId: Number(v) })}
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <TextInput
                      label="关联 trapId"
                      value={editingShop.trapId}
                      onChange={e => patchShop(editingNormal.chessId, { trapId: e.target.value })}
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <TextInput
                      label="进阶物品 ID（goldenItemId）"
                      value={editingShop.goldenItemId ?? ''}
                      placeholder="（无）"
                      onChange={e => patchShop(editingNormal.chessId, { goldenItemId: e.target.value || null })}
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Switch
                      label="隐藏商店（hideInShop）"
                      checked={editingShop.hideInShop}
                      onChange={e => patchShop(editingNormal.chessId, { hideInShop: e.target.checked })}
                      mt="xl"
                    />
                  </Grid.Col>
                </Grid>
              ) : (
                <Group>
                  <Text size="sm" c="dimmed">该条目在 trapShopChessDatas 中不存在</Text>
                  <Button
                    size="xs"
                    variant="light"
                    color="teal"
                    leftSection={<IconPlus size={12} />}
                    onClick={() => updateSeason(activeSeasonId!, data => ({
                      ...data,
                      trapShopChessDatas: {
                        ...(data.trapShopChessDatas ?? {}),
                        [editingNormal.chessId]: makeDefaultShopTrap(editingNormal.chessId, editingNormal.itemType),
                      },
                    }))}
                  >
                    创建商店数据
                  </Button>
                </Group>
              )}
            </Stack>
          ) : (
            <Card withBorder padding="xl" ta="center">
              <Text c="dimmed">← 选择左侧装备进行编辑</Text>
            </Card>
          )}
        </Grid.Col>
      </Grid>

      {/* 新增 Modal */}
      <Modal opened={addOpened} onClose={closeAdd} title="新增装备/法术" size="sm">
        <Stack gap="md">
          <TextInput
            label="Chess ID（普通版，建议 _a 结尾）"
            placeholder="如 trap_equip_001_a"
            value={newChessId}
            onChange={e => setNewChessId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTrap()}
          />
          <Select
            label="物品类型"
            value={newItemType}
            data={[
              { value: 'EQUIP', label: '装备 (EQUIP)' },
              { value: 'MAGIC', label: '法术 (MAGIC)' },
            ]}
            onChange={v => setNewItemType(v as ItemTypeEnum)}
          />
          <Text size="xs" c="dimmed">
            将同时创建普通版（{newChessId || 'xxx_a'}）和进阶版（{newChessId.replace(/_a$/, '_b') || 'xxx_b'}），
            以及 trapShopChessDatas 和 chessNormalIdLookupDict 条目。
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeAdd}>取消</Button>
            <Button onClick={addTrap} disabled={!newChessId.trim()}>创建</Button>
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
          <Text>确定要删除 <Text span fw={700} c="red">{deleteConfirm}</Text> 吗？</Text>
          <Text size="sm" c="dimmed">
            同时删除对应的进阶版条目、trapShopChessDatas 和 chessNormalIdLookupDict 中的记录，不可撤销。
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button color="red" onClick={() => deleteConfirm && deleteTrap(deleteConfirm)}>删除</Button>
          </Group>
        </Stack>
      </Modal>

      {/* 导入商店数据 Modal */}
      <Modal
        opened={importShopOpened}
        onClose={closeImportShop}
        title="导入 trapShopChessDatas"
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            粘贴原始数据中 <Text span ff="monospace" c="orange">trapShopChessDatas</Text> 字段的值（JSON 对象），或整个包含该字段的 JSON。
            已有条目会被覆盖，新条目会被追加。
          </Text>
          <Textarea
            placeholder={'{\n  "trap_item_001": { "itemId": "trap_item_001", ... },\n  ...\n}'}
            minRows={10}
            maxRows={20}
            autosize
            ff="monospace"
            fz="xs"
            value={importShopJson}
            onChange={e => setImportShopJson(e.target.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeImportShop}>取消</Button>
            <Button color="orange" leftSection={<IconUpload size={14} />} onClick={importShopData} disabled={!importShopJson.trim()}>
              合并导入
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
