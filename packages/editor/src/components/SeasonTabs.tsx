import {
  Stack, Group, Text, Badge, Button, Modal,
  Textarea, FileButton, ActionIcon, Menu, TextInput, Tooltip, Loader,
  Select, Progress,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  IconUpload, IconDownload, IconTrash, IconEdit, IconPlus,
  IconChevronDown, IconCheck, IconFolderOpen, IconFolderOff,
  IconFolderCheck, IconRefresh, IconAlertTriangle, IconFolderSearch,
  IconServer, IconCopy, IconTemplate, IconShare,
  IconLock, IconEye,
} from '@tabler/icons-react'
import type { AutoChessSeasonData } from '@autochess-editor/shared'
import type { DataStore } from '../store/dataStore'
import {
  downloadJson,
  normalizeSeasonDataForJson,
  normalizeSeasonDataForRuntime,
  deepSortValue,
} from '@autochess-editor/shared'
import {
  openDirectory,
  loadFromDirectory,
  saveToDirectory,
  watchDirectory,
  type SaveProgress,
  type LoadProgress,
} from '../store/fsStore'
import { api, type SeasonPermission, type AuthUser } from '../api/client'

interface Props {
  store: DataStore
  currentUserId?: string
  currentUserDisplayName?: string
}

const fieldLabelMap: Record<string, string> = {
  'project.json': '常量数据',
  modeDataDict: '游戏模式', bondInfoDict: '盟约', charChessDataDict: '棋子战斗数据',
  charShopChessDatas: '棋子商店', trapChessDataDict: '装备战斗数据', trapShopChessDatas: '装备商店',
  effectInfoDataDict: '效果信息', effectBuffInfoDataDict: '效果Buff', effectChoiceInfoDict: '效果选择',
  bossInfoDict: 'BOSS', garrisonDataDict: '干员特质', bandDataListDict: '赛段',
  stageDatasDict: '关卡数据', shopLevelDisplayDataDict: '商店等级显示',
  specialEnemyInfoDict: '特殊敌人', shopCharChessInfoData: '棋子商店信息',
}

function FsSyncBadge({ status, progress }: { status: 'synced' | 'saving' | 'unsaved' | undefined; progress?: SaveProgress | null }) {
  if (!status) return null
  if (status === 'saving' && progress && progress.total > 0) {
    const pct = Math.round((progress.current / progress.total) * 100)
    const fieldsLabel = progress.changedFields
      .map(f => fieldLabelMap[f] || f)
      .join('、')
    return (
      <Tooltip label={`${progress.current}/${progress.total} 文件 | 变动: ${fieldsLabel}`} withArrow>
        <Group gap={4} wrap="nowrap" style={{ minWidth: 80 }}>
          <Progress value={pct} size="xs" color="yellow" style={{ flex: 1 }} />
          <Text size="xs" c="yellow" style={{ whiteSpace: 'nowrap' }}>{pct}%</Text>
        </Group>
      </Tooltip>
    )
  }
  const cfg = {
    synced: { color: 'teal', label: '已同步' },
    saving: { color: 'yellow', label: '保存中…' },
    unsaved: { color: 'orange', label: '未保存' },
  } as const
  const { color, label } = cfg[status]
  return <Badge size="xs" color={color} variant="light">{label}</Badge>
}

function PermissionBadge({ role }: { role: string | null }) {
  if (!role) return null
  const cfg: Record<string, { color: string; label: string }> = {
    owner: { color: 'var(--mantine-color-teal-6)', label: '拥有者' },
    admin: { color: 'var(--mantine-color-violet-6)', label: '管理员' },
    editor: { color: 'var(--mantine-color-blue-6)', label: '可编辑' },
    viewer: { color: 'var(--mantine-color-gray-6)', label: '只读' },
  }
  const { color, label } = cfg[role] ?? { color: 'var(--mantine-color-gray-6)', label: role }
  return (
    <Text
      component="span"
      size="xs"
      fw={500}
      c={color}
      style={{
        flexShrink: 0,
        padding: '0 6px',
        borderRadius: 4,
        backgroundColor: 'var(--mantine-color-dark-5)',
        lineHeight: '20px',
      }}
    >
      {label}
    </Text>
  )
}

export function SeasonTabs({ store, currentUserId, currentUserDisplayName }: Props) {
  const {
    seasons, serverSeasons, serverTemplates, activeSeasonId, setActiveSeasonId,
    addLocalSeason, uploadSeason, removeSeason, renameSeason, markClean,
    updateSeason, setSeasonFsHandle, setSeasonFsState, setSeasonFsSyncStatus,
    loadSeason, unloadSeason, refreshSeasonList, refreshTemplateList, loading,
    forkTemplate,
  } = store

  const [importOpened, { open: openImport, close: closeImport }] = useDisclosure(false)
  const [jsonText, setJsonText] = useState('')
  const [importLabel, setImportLabel] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [loadProgress, setLoadProgress] = useState<LoadProgress | null>(null)

  // Directory conflict modal
  const [dirConflict, setDirConflict] = useState<{
    seasonId: string
    handle: FileSystemDirectoryHandle
    diffFields: string[]  // top-level fields that differ
    dirHasData: boolean
  } | null>(null)

  // Share modal
  const [shareSeasonId, setShareSeasonId] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<SeasonPermission[]>([])
  const [allUsers, setAllUsers] = useState<Pick<AuthUser, 'id' | 'username' | 'displayName'>[]>([])
  const [shareUserId, setShareUserId] = useState<string | null>(null)
  const [shareRole, setShareRole] = useState<'editor' | 'viewer'>('editor')

  // Fork template rename modal
  const [forkModal, setForkModal] = useState<{ templateId: string; label: string } | null>(null)

  // 外部变更提示 Modal
  const [externalChangeSeasonId, setExternalChangeSeasonId] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  // 重新绑定目录提示 Modal（刷新后 fsHandle 丢失）
  const [rebindSeasonId, setRebindSeasonId] = useState<string | null>(null)

  // ─── FS 自动保存（全部用 ref，不触发 React 重渲染循环）───────────────────
  const seasonsRef = useRef(seasons)
  const fsTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const savingRef = useRef<Record<string, boolean>>({})
  const lastOwnWriteRef = useRef<Record<string, number>>({})
  const [fsProgress, setFsProgress] = useState<Record<string, SaveProgress | null>>({})

  useEffect(() => { seasonsRef.current = seasons })

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
        setFsProgress(prev => ({ ...prev, [s.id]: { current: 0, total: 0, changedFields: [] } }))
        try {
          const sid = s.id
          const savedAt = await saveToDirectory(latest.fsHandle, latest.data, latest.label, () => {
            lastOwnWriteRef.current[sid] = Date.now()
          }, (p) => {
            setFsProgress(prev => ({ ...prev, [sid]: p }))
          }, latest.lastSavedData)
          lastOwnWriteRef.current[sid] = Date.now()
          setSeasonFsState(s.id, savedAt, 'synced')
        } catch {
          setSeasonFsSyncStatus(s.id, 'unsaved')
        } finally {
          savingRef.current[s.id] = false
          setFsProgress(prev => ({ ...prev, [s.id]: null }))
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
          () => lastOwnWriteRef.current[s.id] ?? 0,
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

  useEffect(() => {
    const needRebind = seasons.find(s => s.fsHandleName && !s.fsHandle)
    if (needRebind && !rebindSeasonId) setRebindSeasonId(needRebind.id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Share modal helpers ──────────────────────────────────────────────
  const openShareModal = useCallback(async (seasonId: string) => {
    setShareSeasonId(seasonId)
    try {
      const [permRes, usersRes] = await Promise.all([
        api.listPermissions(seasonId),
        api.listUsersForSharing(),
      ])
      setPermissions(permRes.permissions)
      setAllUsers(usersRes.users)
    } catch (err) {
      console.error('Failed to load permissions:', err)
    }
  }, [])

  const handleAddPermission = useCallback(async () => {
    if (!shareSeasonId || !shareUserId) return
    try {
      await api.addPermission(shareSeasonId, shareUserId, shareRole)
      const res = await api.listPermissions(shareSeasonId)
      setPermissions(res.permissions)
      setShareUserId(null)
      notifications.show({ title: '已添加', message: '权限已更新', color: 'teal' })
    } catch (err) {
      notifications.show({ title: '失败', message: String(err), color: 'red' })
    }
  }, [shareSeasonId, shareUserId, shareRole])

  const handleUpdatePermission = useCallback(async (userId: string, role: 'editor' | 'viewer') => {
    if (!shareSeasonId) return
    try {
      await api.addPermission(shareSeasonId, userId, role)
      setPermissions(prev => prev.map(p => p.userId === userId ? { ...p, role } : p))
      notifications.show({ title: '已更新', message: '权限已更新', color: 'teal' })
    } catch (err) {
      notifications.show({ title: '失败', message: String(err), color: 'red' })
    }
  }, [shareSeasonId])

  const handleRemovePermission = useCallback(async (userId: string) => {
    if (!shareSeasonId) return
    try {
      await api.removePermission(shareSeasonId, userId)
      setPermissions(prev => prev.filter(p => p.userId !== userId))
      notifications.show({ title: '已移除', message: '权限已更新', color: 'teal' })
    } catch (err) {
      notifications.show({ title: '失败', message: String(err), color: 'red' })
    }
  }, [shareSeasonId])

  // ─── 重载外部变更 ────────────────────────────────────────────────────────
  const handleReload = useCallback(async () => {
    if (!externalChangeSeasonId) return
    const season = seasonsRef.current.find(s => s.id === externalChangeSeasonId)
    if (!season?.fsHandle) { setExternalChangeSeasonId(null); return }
    setReloading(true)
    try {
      const { data } = await loadFromDirectory(season.fsHandle)
      updateSeason(externalChangeSeasonId, () => data)
      setSeasonFsState(externalChangeSeasonId, 0, 'synced')
      notifications.show({ title: '重载成功', message: `已重载「${season.label}」`, color: 'teal' })
      setExternalChangeSeasonId(null)
    } catch (e) {
      notifications.show({ title: '重载失败', message: String(e), color: 'red' })
    } finally {
      setReloading(false)
    }
  }, [externalChangeSeasonId, updateSeason, setSeasonFsState])

  const handleRebind = useCallback(async (id: string) => {
    try {
      const handle = await openDirectory()
      if (!handle) return
      const { data } = await loadFromDirectory(handle)
      updateSeason(id, () => data)
      setSeasonFsHandle(id, handle)
      setSeasonFsState(id, 0, 'synced')
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

  async function handleImport() {
    try {
      const data = normalizeSeasonDataForRuntime(JSON.parse(jsonText) as AutoChessSeasonData)
      if (!data.modeDataDict || !data.bondInfoDict || !data.charShopChessDatas) {
        throw new Error('数据结构不完整，请确认是 AutoChessSeasonData 格式')
      }
      addLocalSeason(importLabel || `赛季 ${seasons.length + 1}`, data)
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
    downloadJson(normalizeSeasonDataForJson(season.data), `${season.label}.json`)
    markClean(id)
    notifications.show({ title: '导出成功', message: `${season.label}.json 已下载`, color: 'teal' })
  }

  async function handleOpenDirectory() {
    try {
      const handle = await openDirectory()
      if (!handle) return
      try {
        setLoadProgress({ current: 0, total: 0, field: '' })
        const { data, meta } = await loadFromDirectory(handle, p => setLoadProgress(p))
        setLoadProgress(null)
        const id = addLocalSeason(meta.label || handle.name, data)
        setSeasonFsHandle(id, handle)
        setSeasonFsState(id, 0, 'synced')
        notifications.show({ title: '目录加载成功', message: `已从「${handle.name}」加载`, color: 'teal', icon: <IconFolderCheck size={16} /> })
      } catch {
        setLoadProgress(null)
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

      // Check if directory has existing data
      let dirData: AutoChessSeasonData | null = null
      try {
        setLoadProgress({ current: 0, total: 0, field: '' })
        const result = await loadFromDirectory(handle, p => setLoadProgress(p))
        dirData = result.data
      } catch {
        // No project.json = empty directory, safe to write directly
      }
      setLoadProgress(null)

      if (dirData) {
        // Compare to find differences
        const diffFields: string[] = []
        const allKeys = new Set([
          ...Object.keys(season.data),
          ...Object.keys(dirData),
        ])
        for (const key of allKeys) {
          const editorVal = (season.data as unknown as Record<string, unknown>)[key]
          const dirVal = (dirData as unknown as Record<string, unknown>)[key]
          if (JSON.stringify(deepSortValue(editorVal)) !== JSON.stringify(deepSortValue(dirVal))) {
            diffFields.push(key)
          }
        }

        if (diffFields.length > 0) {
          // Show conflict modal
          setDirConflict({ seasonId: id, handle, diffFields, dirHasData: true })
          return
        }
      }

      // No conflict or empty dir — just bind and save
      await doSaveToDirectory(id, handle)
    } catch (e) {
      setLoadProgress(null)
      notifications.show({ title: '操作失败', message: String(e), color: 'red' })
    }
  }

  async function doSaveToDirectory(id: string, handle: FileSystemDirectoryHandle) {
    const season = seasonsRef.current.find(s => s.id === id)
    if (!season) return
    // Disconnect old watcher if rebinding
    if (watchCancels.current[id]) {
      watchCancels.current[id]()
      delete watchCancels.current[id]
      watchedIds.current.delete(id)
    }
    setLoadProgress({ current: 0, total: 0, field: '' })
    try {
      const savedAt = await saveToDirectory(handle, season.data, season.label, () => {
        lastOwnWriteRef.current[id] = Date.now()
      }, (p) => {
        setLoadProgress({ current: p.current, total: p.total, field: p.changedFields.join(', ') })
      })
      lastOwnWriteRef.current[id] = Date.now()
      setSeasonFsHandle(id, handle)
      setSeasonFsState(id, savedAt, 'synced')
      notifications.show({ title: '保存成功', message: `已保存到目录「${handle.name}」`, color: 'teal', icon: <IconFolderCheck size={16} /> })
    } catch (e) {
      notifications.show({ title: '保存失败', message: String(e), color: 'red' })
    } finally {
      setLoadProgress(null)
    }
  }

  async function handleConflictLoadDir() {
    if (!dirConflict) return
    const { seasonId, handle } = dirConflict
    setDirConflict(null)
    // Disconnect old watcher
    if (watchCancels.current[seasonId]) {
      watchCancels.current[seasonId]()
      delete watchCancels.current[seasonId]
      watchedIds.current.delete(seasonId)
    }
    try {
      setLoadProgress({ current: 0, total: 0, field: '' })
      const { data } = await loadFromDirectory(handle, p => setLoadProgress(p))
      setLoadProgress(null)
      updateSeason(seasonId, () => data)
      setSeasonFsHandle(seasonId, handle)
      setSeasonFsState(seasonId, 0, 'synced')
      markClean(seasonId)
      notifications.show({ title: '已加载目录数据', message: `已从「${handle.name}」加载`, color: 'teal' })
    } catch (e) {
      setLoadProgress(null)
      notifications.show({ title: '加载失败', message: String(e), color: 'red' })
    }
  }

  async function handleConflictOverwrite() {
    if (!dirConflict) return
    const { seasonId, handle } = dirConflict
    setDirConflict(null)
    await doSaveToDirectory(seasonId, handle)
  }

  async function handleManualSave(id: string) {
    if (savingRef.current[id]) {
      notifications.show({ message: '正在保存中，请等待当前保存完成', color: 'yellow' })
      return
    }
    const season = seasonsRef.current.find(s => s.id === id)
    if (!season?.fsHandle) return
    // Cancel pending auto-save timer
    if (fsTimers.current[id]) { clearTimeout(fsTimers.current[id]); delete fsTimers.current[id] }
    savingRef.current[id] = true
    setSeasonFsSyncStatus(id, 'saving')
    setFsProgress(prev => ({ ...prev, [id]: { current: 0, total: 0, changedFields: [] } }))
    try {
      const savedAt = await saveToDirectory(season.fsHandle, season.data, season.label, () => {
        lastOwnWriteRef.current[id] = Date.now()
      }, (p) => {
        setFsProgress(prev => ({ ...prev, [id]: p }))
      }, season.lastSavedData)
      lastOwnWriteRef.current[id] = Date.now()
      setSeasonFsState(id, savedAt, 'synced')
      notifications.show({ title: '保存成功', message: '已同步到目录', color: 'teal' })
    } catch (e) {
      notifications.show({ title: '保存失败', message: String(e), color: 'red' })
      setSeasonFsSyncStatus(id, 'unsaved')
    } finally {
      savingRef.current[id] = false
      setFsProgress(prev => ({ ...prev, [id]: null }))
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
                  {s.readOnly && (
                    <Tooltip label="只读" openDelay={400}>
                      <IconLock size={12} style={{ color: 'var(--mantine-color-gray-5)', flexShrink: 0 }} />
                    </Tooltip>
                  )}
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
                  {s.isLocal && <Badge size="xs" variant="outline" color="gray">本地</Badge>}
                  {s.isDirty && !s.fsHandle && <Badge size="xs" color="yellow" circle>●</Badge>}
                  {s.fsHandle && <FsSyncBadge status={s.fsSyncStatus} progress={fsProgress[s.id]} />}
                  <Menu withinPortal shadow="md" position="bottom-end">
                    <Menu.Target>
                      <ActionIcon size="xs" variant="transparent" onClick={e => e.stopPropagation()}>
                        <IconChevronDown size={12} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {(s.isOwner || s.isLocal) && (
                        <Menu.Item leftSection={<IconEdit size={14} />} onClick={e => { e.stopPropagation(); startRename(s.id, s.label) }}>重命名</Menu.Item>
                      )}
                      <Menu.Item leftSection={<IconDownload size={14} />} onClick={e => { e.stopPropagation(); handleExport(s.id) }}>导出 JSON</Menu.Item>
                      {s.isLocal && (
                        <Menu.Item leftSection={<IconUpload size={14} />} color="teal" onClick={e => { e.stopPropagation(); void uploadSeason(s.id).then(() => notifications.show({ title: '上传成功', message: '赛季已上传到服务器', color: 'teal' })) }}>上传到服务器</Menu.Item>
                      )}
                      {s.isOwner && !s.isLocal && (
                        <Menu.Item leftSection={<IconShare size={14} />} onClick={e => { e.stopPropagation(); void openShareModal(s.id) }}>分享管理</Menu.Item>
                      )}
                      <Menu.Divider />
                      {s.fsHandle ? (
                        <>
                          <Menu.Item leftSection={<IconRefresh size={14} />} onClick={e => { e.stopPropagation(); void handleManualSave(s.id) }}>立即保存到目录</Menu.Item>
                          <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={e => { e.stopPropagation(); void handleSaveAsDirectory(s.id) }}>更换目录...</Menu.Item>
                          <Menu.Item leftSection={<IconFolderOff size={14} />} onClick={e => { e.stopPropagation(); handleDisconnectFs(s.id) }}>断开目录</Menu.Item>
                        </>
                      ) : s.fsHandleName ? (
                        <Menu.Item leftSection={<IconFolderSearch size={14} />} color="orange" onClick={e => { e.stopPropagation(); setRebindSeasonId(s.id) }}>重新绑定目录...</Menu.Item>
                      ) : (
                        <Menu.Item leftSection={<IconFolderOpen size={14} />} onClick={e => { e.stopPropagation(); void handleSaveAsDirectory(s.id) }}>另存为目录...</Menu.Item>
                      )}
                      {!s.isLocal && (
                        <Menu.Item leftSection={<IconCopy size={14} />} onClick={e => { e.stopPropagation(); void api.duplicateSeason(s.id).then(() => refreshSeasonList()) }}>复制赛季</Menu.Item>
                      )}
                      <Menu.Divider />
                      <Menu.Item leftSection={<IconTrash size={14} />} onClick={e => { e.stopPropagation(); unloadSeason(s.id) }}>关闭标签</Menu.Item>
                      {s.isOwner && !s.isLocal && (
                        <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={e => { e.stopPropagation(); removeSeason(s.id) }}>从服务器删除</Menu.Item>
                      )}
                    </Menu.Dropdown>
                  </Menu>
                </>
              )}
            </Group>
          ))}
        </Group>

        <Group gap="xs" style={{ flexShrink: 0 }}>
          {/* Templates & Seasons browser */}
          <Menu withinPortal shadow="md" position="bottom-end" width={360} onOpen={() => { refreshTemplateList(); refreshSeasonList() }}>
            <Menu.Target>
              <Button size="xs" leftSection={<IconServer size={14} />} variant="light" color="blue" rightSection={loading ? <Loader size={10} /> : <IconChevronDown size={12} />}>
                浏览
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>模板（公共）</Menu.Label>
              {serverTemplates.length === 0 && <Menu.Item disabled>暂无模板</Menu.Item>}
              {serverTemplates.map(t => (
                <Menu.Item
                  key={t.id}
                  leftSection={<IconTemplate size={14} />}
                  rightSection={
                    <Badge size="sm" variant="light" color="teal" style={{ cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); setForkModal({ templateId: t.id, label: `${t.label} (${currentUserDisplayName || 'My'})` }) }}>
                      复制
                    </Badge>
                  }
                >
                  {t.label}
                </Menu.Item>
              ))}

              <Menu.Divider />
              <Menu.Label>我的赛季</Menu.Label>
              {serverSeasons.filter(s => s.isOwner).length === 0 && <Menu.Item disabled>暂无赛季</Menu.Item>}
              {serverSeasons.filter(s => s.isOwner).map(ss => {
                const isLoaded = seasons.some(s => s.id === ss.id)
                return (
                  <Menu.Item
                    key={ss.id}
                    leftSection={isLoaded ? <IconCheck size={14} /> : undefined}
                    onClick={() => { if (!isLoaded) void loadSeason(ss.id); else setActiveSeasonId(ss.id) }}
                  >
                    <Group gap="xs">
                      <Text size="sm">{ss.label}</Text>
                    </Group>
                  </Menu.Item>
                )
              })}

              {serverSeasons.filter(s => !s.isOwner).length > 0 && (
                <>
                  <Menu.Divider />
                  <Menu.Label>共享给我的</Menu.Label>
                  {serverSeasons.filter(s => !s.isOwner).map(ss => {
                    const isLoaded = seasons.some(s => s.id === ss.id)
                    const isReadOnly = ss.permissionRole === 'viewer'
                    return (
                      <Menu.Item
                        key={ss.id}
                        leftSection={isLoaded ? <IconCheck size={14} /> : (isReadOnly ? <IconEye size={14} /> : undefined)}
                        onClick={() => {
                          if (!isLoaded) void loadSeason(ss.id, isReadOnly, false)
                          else setActiveSeasonId(ss.id)
                        }}
                      >
                        <Group gap="xs" align="center" wrap="nowrap">
                          <Text size="sm">{ss.label}</Text>
                          <Text size="xs" c="dimmed">{ss.ownerDisplayName}</Text>
                          <PermissionBadge role={ss.permissionRole} />
                        </Group>
                      </Menu.Item>
                    )
                  })}
                </>
              )}
            </Menu.Dropdown>
          </Menu>

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

      {/* 分享管理 Modal */}
      <Modal opened={!!shareSeasonId} onClose={() => setShareSeasonId(null)} title="分享管理" size="md">
        <Stack gap="md">
          <Text size="sm" c="dimmed">添加用户并设置权限，让他们可以查看或编辑此赛季。</Text>

          {/* Add permission */}
          <Group gap="xs">
            <Select
              placeholder="选择用户"
              data={allUsers
                .filter(u => u.id !== currentUserId && !permissions.some(p => p.userId === u.id))
                .map(u => ({ value: u.id, label: `${u.displayName} (${u.username})` }))}
              value={shareUserId}
              onChange={setShareUserId}
              style={{ flex: 1 }}
              size="sm"
            />
            <Select
              data={[
                { value: 'editor', label: '可编辑' },
                { value: 'viewer', label: '只读' },
              ]}
              value={shareRole}
              onChange={v => setShareRole((v as 'editor' | 'viewer') ?? 'editor')}
              w={100}
              size="sm"
            />
            <Button size="sm" onClick={handleAddPermission} disabled={!shareUserId}>添加</Button>
          </Group>

          {/* Permission list */}
          {permissions.length === 0 ? (
            <Text size="sm" c="dimmed">尚未分享给任何人</Text>
          ) : (
            <Stack gap="xs">
              {permissions.map(p => (
                <Group key={p.userId} gap="xs" justify="space-between">
                  <Group gap="xs">
                    <Text size="sm" fw={500}>{p.displayName}</Text>
                    <Text size="xs" c="dimmed">({p.username})</Text>
                  </Group>
                  <Group gap={4}>
                    <Select
                      data={[
                        { value: 'editor', label: '可编辑' },
                        { value: 'viewer', label: '只读' },
                      ]}
                      value={p.role}
                      onChange={v => v && void handleUpdatePermission(p.userId, v as 'editor' | 'viewer')}
                      size="xs"
                      w={90}
                    />
                    <ActionIcon size="sm" color="red" variant="subtle" onClick={() => void handleRemovePermission(p.userId)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </Modal>

      {/* Fork模板重命名 Modal */}
      <Modal opened={!!forkModal} onClose={() => setForkModal(null)} title="复制模板到私有赛季" size="sm">
        {forkModal && (
          <Stack gap="md">
            <TextInput
              label="赛季名称"
              value={forkModal.label}
              onChange={e => setForkModal({ ...forkModal, label: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && forkModal.label.trim()) {
                  void forkTemplate(forkModal.templateId, forkModal.label.trim())
                  setForkModal(null)
                }
              }}
              autoFocus
            />
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setForkModal(null)}>取消</Button>
              <Button
                disabled={!forkModal.label.trim()}
                onClick={() => {
                  void forkTemplate(forkModal.templateId, forkModal.label.trim())
                  setForkModal(null)
                }}
              >
                复制
              </Button>
            </Group>
          </Stack>
        )}
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

      {/* 加载目录进度 */}
      <Modal opened={!!loadProgress} onClose={() => {}} withCloseButton={false} closeOnClickOutside={false} closeOnEscape={false} size="sm" centered>
        <Stack gap="sm" align="center" py="md">
          <Loader size="sm" />
          <Text size="sm" fw={500}>正在处理目录…</Text>
          {loadProgress && loadProgress.total > 0 && (
            <>
              <Progress value={Math.round((loadProgress.current / loadProgress.total) * 100)} size="md" color="teal" style={{ width: '100%' }} />
              <Text size="xs" c="dimmed">
                {loadProgress.current}/{loadProgress.total} 文件 · {fieldLabelMap[loadProgress.field] || loadProgress.field}
              </Text>
            </>
          )}
        </Stack>
      </Modal>

      {/* 目录数据冲突 */}
      <Modal opened={!!dirConflict} onClose={() => setDirConflict(null)} title="目录数据不一致" size="md" centered>
        {dirConflict && (
          <Stack gap="md">
            <Text size="sm">目录中已有数据，且与当前编辑器数据存在 <Text span fw={700}>{dirConflict.diffFields.length}</Text> 个字段的差异：</Text>
            <Stack gap={4}>
              {dirConflict.diffFields.map(f => (
                <Badge key={f} variant="light" color="orange" size="sm">{fieldLabelMap[f] || f}</Badge>
              ))}
            </Stack>
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" onClick={() => setDirConflict(null)}>取消</Button>
              <Button color="blue" onClick={() => void handleConflictLoadDir()}>加载目录数据</Button>
              <Button color="orange" onClick={() => void handleConflictOverwrite()}>覆盖目录</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  )
}
