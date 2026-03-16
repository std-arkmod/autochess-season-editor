import {
  Stack, Group, Text, Badge, Button, Modal,
  Textarea, FileButton, ActionIcon, Menu, TextInput, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  IconUpload, IconDownload, IconTrash, IconEdit, IconPlus,
  IconChevronDown, IconCheck, IconFolderOpen, IconFolderOff,
  IconFolderCheck, IconRefresh, IconAlertTriangle, IconFolderSearch,
} from '@tabler/icons-react'
import type { AutoChessSeasonData } from '../autochess-season-data'
import type { DataStore } from '../store/dataStore'
import { downloadJson } from '../store/utils'
import {
  openDirectory,
  loadFromDirectory,
  saveToDirectory,
  watchDirectory,
} from '../store/fsStore'

interface Props { store: DataStore }

function FsSyncBadge({ status }: { status: 'synced' | 'saving' | 'unsaved' | undefined }) {
  if (!status) return null
  const cfg = {
    synced: { color: 'teal', label: '已同步' },
    saving: { color: 'yellow', label: '保存中…' },
    unsaved: { color: 'orange', label: '未保存' },
  } as const
  const { color, label } = cfg[status]
  return <Badge size="xs" color={color} variant="light">{label}</Badge>
}

export function SeasonTabs({ store }: Props) {
  const {
    seasons, activeSeasonId, setActiveSeasonId,
    addSeason, removeSeason, renameSeason, markClean,
    updateSeason, setSeasonFsHandle, setSeasonFsState, setSeasonFsSyncStatus,
  } = store

  const [importOpened, { open: openImport, close: closeImport }] = useDisclosure(false)
  const [jsonText, setJsonText] = useState('')
  const [importLabel, setImportLabel] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // 外部变更提示 Modal
  const [externalChangeSeasonId, setExternalChangeSeasonId] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  // 重新绑定目录提示 Modal（刷新后 fsHandle 丢失）
  const [rebindSeasonId, setRebindSeasonId] = useState<string | null>(null)

  // ─── FS 自动保存（全部用 ref，不触发 React 重渲染循环）───────────────────
  const seasonsRef = useRef(seasons)
  const fsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const savingRef = useRef<Record<string, boolean>>({})
  // 记录每个 season 最近一次我们自己写入完成的时间（ms），供 watchDirectory 的 cooldown 判断
  const lastOwnWriteRef = useRef<Record<string, number>>({})

  // 每次渲染后同步 seasonsRef
  useEffect(() => { seasonsRef.current = seasons })

  // 监听 isDirty 变化，触发防抖自动保存
  useEffect(() => {
    seasons.forEach(s => {
      if (!s.fsHandle || !s.isDirty || savingRef.current[s.id]) return
      if (fsTimers.current[s.id]) clearTimeout(fsTimers.current[s.id])
      fsTimers.current[s.id] = setTimeout(async () => {
        delete fsTimers.current[s.id]
        const latest = seasonsRef.current.find(x => x.id === s.id)
        if (!latest?.fsHandle || !latest.isDirty) return
        savingRef.current[s.id] = true
        setSeasonFsSyncStatus(s.id, 'saving')
        try {
          const sid = s.id
          const savedAt = await saveToDirectory(latest.fsHandle, latest.data, latest.label, () => {
            lastOwnWriteRef.current[sid] = Date.now()  // 第一个文件写入前就更新，避免 watchDirectory 误判
          })
          lastOwnWriteRef.current[sid] = Date.now()  // 写完后再更新一次，保证 cooldown 从此时起算
          setSeasonFsState(s.id, savedAt, 'synced')
        } catch {
          setSeasonFsSyncStatus(s.id, 'unsaved')
        } finally {
          savingRef.current[s.id] = false
        }
      }, 600)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons.map(s => `${s.id}:${s.isDirty}:${!!s.fsHandle}`).join('|')])

  // ─── Watch（外部变更检测）────────────────────────────────────────────────
  const watchCancels = useRef<Record<string, () => void>>({})
  const watchedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    seasons.forEach(s => {
      if (s.fsHandle && s.fsSavedAt !== undefined && !watchedIds.current.has(s.id)) {
        watchedIds.current.add(s.id)
        watchCancels.current[s.id] = watchDirectory(
          s.fsHandle,
          () => lastOwnWriteRef.current[s.id] ?? 0,  // getLastOwnWrite
          () => setExternalChangeSeasonId(prev => prev ?? s.id),
        )
      }
    })
    const activeIds = new Set(seasons.filter(s => s.fsHandle).map(s => s.id))
    for (const id of watchedIds.current) {
      if (!activeIds.has(id)) {
        watchCancels.current[id]?.()
        delete watchCancels.current[id]
        watchedIds.current.delete(id)
      }
    }
  }, [seasons.map(s => `${s.id}:${!!s.fsHandle}`).join('|')])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    Object.values(watchCancels.current).forEach(c => c())
    Object.values(fsTimers.current).forEach(t => clearTimeout(t))
  }, [])

  // 刷新后检测需要重新绑定目录的 season（有 fsHandleName 但无 fsHandle）
  useEffect(() => {
    const needRebind = seasons.find(s => s.fsHandleName && !s.fsHandle)
    if (needRebind && !rebindSeasonId) setRebindSeasonId(needRebind.id)
  }, []) // 只在挂载时检查一次  // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 重载外部变更 ────────────────────────────────────────────────────────
  const handleReload = useCallback(async () => {
    if (!externalChangeSeasonId) return
    // 从 ref 读最新 season（避免 useCallback 闭包 stale）
    const season = seasonsRef.current.find(s => s.id === externalChangeSeasonId)
    if (!season?.fsHandle) { setExternalChangeSeasonId(null); return }
    setReloading(true)
    try {
      const { data, meta } = await loadFromDirectory(season.fsHandle)
      updateSeason(externalChangeSeasonId, () => data)
      setSeasonFsState(externalChangeSeasonId, meta.savedAt, 'synced')
      notifications.show({ title: '重载成功', message: `已重载「${season.label}」`, color: 'teal' })
      setExternalChangeSeasonId(null)
    } catch (e) {
      notifications.show({ title: '重载失败', message: String(e), color: 'red' })
    } finally {
      setReloading(false)
    }
  }, [externalChangeSeasonId, updateSeason, setSeasonFsState])

  // ─── 重新绑定目录 ────────────────────────────────────────────────────────
  const handleRebind = useCallback(async (id: string) => {
    try {
      const handle = await openDirectory()
      if (!handle) return
      // 尝试加载，验证目录是否匹配
      const { data, meta } = await loadFromDirectory(handle)
      updateSeason(id, () => data)
      setSeasonFsHandle(id, handle)
      setSeasonFsState(id, meta.savedAt, 'synced')
      markClean(id)
      setRebindSeasonId(null)
      notifications.show({ title: '重新绑定成功', message: `已重新绑定目录「${handle.name}」`, color: 'teal' })
    } catch (e) {
      notifications.show({ title: '绑定失败', message: String(e), color: 'red' })
    }
  }, [updateSeason, setSeasonFsHandle, setSeasonFsState, markClean])

  // ─── 常规操作 ────────────────────────────────────────────────────────────
  function handleFileLoad(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      setJsonText(e.target?.result as string ?? '')
      setImportLabel(file.name.replace(/\.json$/, ''))
    }
    reader.readAsText(file)
    openImport()
  }

  function handleImport() {
    try {
      const data = JSON.parse(jsonText) as AutoChessSeasonData
      if (!data.modeDataDict || !data.bondInfoDict || !data.charShopChessDatas) {
        throw new Error('数据结构不完整，请确认是 AutoChessSeasonData 格式')
      }
      addSeason(importLabel || `赛季 ${seasons.length + 1}`, data)
      closeImport()
      setJsonText('')
      notifications.show({
        title: '导入成功',
        message: `已加载赛季数据，包含 ${Object.keys(data.modeDataDict).length} 个模式`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      })
    } catch (e: unknown) {
      notifications.show({ title: '导入失败', message: e instanceof Error ? e.message : 'JSON 格式错误', color: 'red' })
    }
  }

  function handleExport(id: string) {
    const season = seasons.find(s => s.id === id)
    if (!season) return
    downloadJson(season.data, `${season.label}.json`)
    markClean(id)
    notifications.show({ title: '导出成功', message: `${season.label}.json 已下载`, color: 'teal' })
  }

  async function handleOpenDirectory() {
    try {
      const handle = await openDirectory()
      if (!handle) return
      try {
        const { data, meta } = await loadFromDirectory(handle)
        const id = addSeason(meta.label || handle.name, data)
        setSeasonFsHandle(id, handle)
        setSeasonFsState(id, meta.savedAt, 'synced')
        notifications.show({ title: '目录加载成功', message: `已从「${handle.name}」加载`, color: 'teal', icon: <IconFolderCheck size={16} /> })
      } catch {
        notifications.show({
          title: '空目录或未初始化',
          message: '目录中没有 project.json。请先导入 JSON 数据，然后用菜单「另存为目录」初始化',
          color: 'orange',
        })
      }
    } catch (e) {
      notifications.show({ title: '打开目录失败', message: String(e), color: 'red' })
    }
  }

  async function handleSaveAsDirectory(id: string) {
    const season = seasons.find(s => s.id === id)
    if (!season) return
    try {
      const handle = await openDirectory()
      if (!handle) return
      setSeasonFsSyncStatus(id, 'saving')
      const savedAt = await saveToDirectory(handle, season.data, season.label, () => {
        lastOwnWriteRef.current[id] = Date.now()
      })
      lastOwnWriteRef.current[id] = Date.now()
      setSeasonFsHandle(id, handle)
      setSeasonFsState(id, savedAt, 'synced')
      notifications.show({ title: '另存成功', message: `已保存到目录「${handle.name}」`, color: 'teal', icon: <IconFolderCheck size={16} /> })
    } catch (e) {
      notifications.show({ title: '保存失败', message: String(e), color: 'red' })
      setSeasonFsSyncStatus(id, 'unsaved')
    }
  }

  async function handleManualSave(id: string) {
    const season = seasonsRef.current.find(s => s.id === id)
    if (!season?.fsHandle) return
    setSeasonFsSyncStatus(id, 'saving')
    try {
      const savedAt = await saveToDirectory(season.fsHandle, season.data, season.label, () => {
        lastOwnWriteRef.current[id] = Date.now()
      })
      lastOwnWriteRef.current[id] = Date.now()
      setSeasonFsState(id, savedAt, 'synced')
      notifications.show({ title: '保存成功', message: '已同步到目录', color: 'teal' })
    } catch (e) {
      notifications.show({ title: '保存失败', message: String(e), color: 'red' })
      setSeasonFsSyncStatus(id, 'unsaved')
    }
  }

  function handleDisconnectFs(id: string) {
    watchCancels.current[id]?.()
    delete watchCancels.current[id]
    watchedIds.current.delete(id)
    delete fsTimers.current[id]
    delete savingRef.current[id]
    delete lastOwnWriteRef.current[id]
    setSeasonFsHandle(id, undefined)
  }

  function startRename(id: string, label: string) { setRenamingId(id); setRenameValue(label) }
  function commitRename() {
    if (renamingId && renameValue.trim()) renameSeason(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  const externalChangeSeason = externalChangeSeasonId ? seasons.find(s => s.id === externalChangeSeasonId) : null
  const rebindSeason = rebindSeasonId ? seasons.find(s => s.id === rebindSeasonId) : null

  return (
    <>
      <Group gap="xs" align="center" wrap="nowrap" px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="xs" style={{ flex: 1, overflowX: 'auto', flexWrap: 'nowrap' }}>
          {seasons.map(s => (
            <Group
              key={s.id} gap={4} px="sm" py={6}
              style={{
                borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                background: activeSeasonId === s.id ? 'var(--mantine-color-teal-9)' : 'var(--mantine-color-dark-6)',
                border: activeSeasonId === s.id ? '1px solid var(--mantine-color-teal-6)' : '1px solid transparent',
              }}
              onClick={() => setActiveSeasonId(s.id)}
            >
              {renamingId === s.id ? (
                <TextInput
                  size="xs" value={renameValue} autoFocus w={120}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  {s.fsHandle ? (
                    <Tooltip label={`已关联目录：${s.fsHandleName}`} openDelay={400}>
                      <IconFolderCheck size={12} style={{ color: 'var(--mantine-color-teal-4)', flexShrink: 0 }} />
                    </Tooltip>
                  ) : s.fsHandleName ? (
                    <Tooltip label={`目录「${s.fsHandleName}」需重新授权`} openDelay={400}>
                      <IconFolderSearch
                        size={12}
                        style={{ color: 'var(--mantine-color-orange-4)', flexShrink: 0, cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); setRebindSeasonId(s.id) }}
                      />
                    </Tooltip>
                  ) : null}
                  <Text size="sm" fw={activeSeasonId === s.id ? 600 : 400}>{s.label}</Text>
                  {s.isDirty && !s.fsHandle && <Badge size="xs" color="yellow" circle>●</Badge>}
                  {s.fsHandle && <FsSyncBadge status={s.fsSyncStatus} />}
                  <Menu withinPortal shadow="md" position="bottom-end">
                    <Menu.Target>
                      <ActionIcon size="xs" variant="transparent" onClick={e => e.stopPropagation()}>
                        <IconChevronDown size={12} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={14} />} onClick={e => { e.stopPropagation(); startRename(s.id, s.label) }}>重命名</Menu.Item>
                      <Menu.Item leftSection={<IconDownload size={14} />} onClick={e => { e.stopPropagation(); handleExport(s.id) }}>导出 JSON</Menu.Item>
                      <Menu.Divider />
                      {s.fsHandle ? (
                        <>
                          <Menu.Item leftSection={<IconRefresh size={14} />} onClick={e => { e.stopPropagation(); void handleManualSave(s.id) }}>立即保存到目录</Menu.Item>
                          <Menu.Item leftSection={<IconFolderOff size={14} />} onClick={e => { e.stopPropagation(); handleDisconnectFs(s.id) }}>断开目录</Menu.Item>
                        </>
                      ) : s.fsHandleName ? (
                        <Menu.Item leftSection={<IconFolderSearch size={14} />} color="orange" onClick={e => { e.stopPropagation(); setRebindSeasonId(s.id) }}>重新绑定目录...</Menu.Item>
                      ) : (
                        <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={e => { e.stopPropagation(); void handleSaveAsDirectory(s.id) }}>另存为目录...</Menu.Item>
                      )}
                      <Menu.Divider />
                      <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={e => { e.stopPropagation(); removeSeason(s.id) }}>关闭</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </>
              )}
            </Group>
          ))}
        </Group>

        <Group gap="xs" style={{ flexShrink: 0 }}>
          <Tooltip label="从目录打开（Web FS API）" openDelay={400}>
            <Button size="xs" leftSection={<IconFolderOpen size={14} />} variant="light" color="teal" onClick={() => void handleOpenDirectory()}>
              打开目录
            </Button>
          </Tooltip>
          <FileButton accept=".json" onChange={handleFileLoad}>
            {props => <Button size="xs" leftSection={<IconUpload size={14} />} variant="light" {...props}>导入 JSON</Button>}
          </FileButton>
          <Button size="xs" leftSection={<IconPlus size={14} />} variant="subtle" onClick={openImport}>粘贴数据</Button>
        </Group>
      </Group>

      {/* 导入 Modal */}
      <Modal opened={importOpened} onClose={closeImport} title="导入赛季数据" size="lg">
        <Stack gap="md">
          <TextInput label="赛季名称" placeholder="如：第一期、Act1..." value={importLabel} onChange={e => setImportLabel(e.target.value)} />
          <Textarea
            label="粘贴 JSON 数据（AutoChessSeasonData 格式）"
            placeholder='{"modeDataDict": {...}, "bondInfoDict": {...}, ...}'
            minRows={8} maxRows={16} autosize ff="monospace" fz="xs"
            value={jsonText} onChange={e => setJsonText(e.target.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeImport}>取消</Button>
            <Button onClick={handleImport} disabled={!jsonText.trim()}>导入</Button>
          </Group>
        </Stack>
      </Modal>

      {/* 外部变更提示 Modal */}
      <Modal
        opened={!!externalChangeSeasonId}
        onClose={() => !reloading && setExternalChangeSeasonId(null)}
        closeOnClickOutside={!reloading}
        closeOnEscape={!reloading}
        title={<Group gap="xs"><IconAlertTriangle size={18} color="var(--mantine-color-orange-5)" /><Text fw={600}>目录已被外部修改</Text></Group>}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">赛季「<Text span fw={600}>{externalChangeSeason?.label}</Text>」的文件目录已被外部程序修改。</Text>
          <Text size="sm" c="dimmed">重载将用磁盘上的最新数据覆盖当前内容，未保存的修改会丢失。</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setExternalChangeSeasonId(null)} disabled={reloading}>忽略</Button>
            <Button color="orange" leftSection={<IconRefresh size={14} />} onClick={() => void handleReload()} loading={reloading}>重载</Button>
          </Group>
        </Stack>
      </Modal>

      {/* 刷新后重新绑定目录 Modal */}
      <Modal
        opened={!!rebindSeasonId}
        onClose={() => setRebindSeasonId(null)}
        title={<Group gap="xs"><IconFolderSearch size={18} color="var(--mantine-color-orange-5)" /><Text fw={600}>需要重新授权目录</Text></Group>}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            赛季「<Text span fw={600}>{rebindSeason?.label}</Text>」曾关联目录
            「<Text span fw={600} ff="monospace">{rebindSeason?.fsHandleName}</Text>」，
            但页面刷新后浏览器不保留目录访问权限，需要重新选择该目录。
          </Text>
          <Text size="sm" c="dimmed">选择目录后会自动重载其中的最新数据。</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setRebindSeasonId(null)}>稍后再说</Button>
            <Button color="teal" leftSection={<IconFolderSearch size={14} />} onClick={() => rebindSeasonId && void handleRebind(rebindSeasonId)}>
              选择目录…
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
