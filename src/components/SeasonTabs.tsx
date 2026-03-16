import {
  Stack, Card, Group, Text, Badge, Grid, Title, Button, Modal,
  Textarea, FileButton, Tabs, ActionIcon, Menu, TextInput, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import {
  IconUpload, IconDownload, IconTrash, IconEdit, IconPlus,
  IconChevronDown, IconCheck,
} from '@tabler/icons-react'
import type { AutoChessSeasonData } from '../autochess-season-data'
import type { DataStore } from '../store/dataStore'
import { downloadJson } from '../store/utils'

interface Props {
  store: DataStore
}

export function SeasonTabs({ store }: Props) {
  const { seasons, activeSeason, activeSeasonId, setActiveSeasonId, addSeason, removeSeason, renameSeason, markClean } = store
  const [importOpened, { open: openImport, close: closeImport }] = useDisclosure(false)
  const [jsonText, setJsonText] = useState('')
  const [importLabel, setImportLabel] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

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
      // Basic validation
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
      notifications.show({
        title: '导入失败',
        message: e instanceof Error ? e.message : 'JSON 格式错误',
        color: 'red',
      })
    }
  }

  function handleExport(id: string) {
    const season = seasons.find(s => s.id === id)
    if (!season) return
    downloadJson(season.data, `${season.label}.json`)
    markClean(id)
    notifications.show({
      title: '导出成功',
      message: `${season.label}.json 已下载`,
      color: 'teal',
    })
  }

  function startRename(id: string, currentLabel: string) {
    setRenamingId(id)
    setRenameValue(currentLabel)
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      renameSeason(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  return (
    <>
      <Group gap="xs" align="center" wrap="nowrap" px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
        <Group gap="xs" style={{ flex: 1, overflowX: 'auto', flexWrap: 'nowrap' }}>
          {seasons.map(s => (
            <Group
              key={s.id}
              gap={4}
              px="sm"
              py={6}
              style={{
                borderRadius: 6,
                cursor: 'pointer',
                background: activeSeasonId === s.id ? 'var(--mantine-color-teal-9)' : 'var(--mantine-color-dark-6)',
                border: activeSeasonId === s.id ? '1px solid var(--mantine-color-teal-6)' : '1px solid transparent',
                flexShrink: 0,
              }}
              onClick={() => setActiveSeasonId(s.id)}
            >
              {renamingId === s.id ? (
                <TextInput
                  size="xs"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                  autoFocus
                  w={120}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <Text size="sm" fw={activeSeasonId === s.id ? 600 : 400}>{s.label}</Text>
                  {s.isDirty && <Badge size="xs" color="yellow" circle>●</Badge>}
                  <Menu withinPortal shadow="md" position="bottom-end">
                    <Menu.Target>
                      <ActionIcon
                        size="xs"
                        variant="transparent"
                        onClick={e => e.stopPropagation()}
                      >
                        <IconChevronDown size={12} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconEdit size={14} />} onClick={e => { e.stopPropagation(); startRename(s.id, s.label) }}>重命名</Menu.Item>
                      <Menu.Item leftSection={<IconDownload size={14} />} onClick={e => { e.stopPropagation(); handleExport(s.id) }}>导出 JSON</Menu.Item>
                      <Menu.Divider />
                      <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={e => { e.stopPropagation(); removeSeason(s.id) }}>关闭</Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </>
              )}
            </Group>
          ))}
        </Group>

        <Group gap="xs" flexShrink={0}>
          <FileButton accept=".json" onChange={handleFileLoad}>
            {props => (
              <Button size="xs" leftSection={<IconUpload size={14} />} variant="light" {...props}>
                导入 JSON
              </Button>
            )}
          </FileButton>
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            variant="subtle"
            onClick={openImport}
          >
            粘贴数据
          </Button>
        </Group>
      </Group>

      <Modal
        opened={importOpened}
        onClose={closeImport}
        title="导入赛季数据"
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label="赛季名称"
            placeholder="如：第一期、Act1..."
            value={importLabel}
            onChange={e => setImportLabel(e.target.value)}
          />
          <Textarea
            label="粘贴 JSON 数据（AutoChessSeasonData 格式）"
            placeholder='{"modeDataDict": {...}, "bondInfoDict": {...}, ...}'
            minRows={8}
            maxRows={16}
            autosize
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            ff="monospace"
            fz="xs"
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeImport}>取消</Button>
            <Button onClick={handleImport} disabled={!jsonText.trim()}>导入</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
