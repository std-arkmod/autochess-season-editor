import { useState, useRef, useCallback } from 'react'
import { Stack, Group, Button, Text, ActionIcon, Tooltip, Paper, TextInput, Modal, Box } from '@mantine/core'
import { IconPlus, IconTrash, IconArrowUp, IconArrowDown, IconUpload } from '@tabler/icons-react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { DataStore } from '../../store/dataStore'

interface Props {
  store: DataStore
}

export function ScriptsEditor({ store }: Props) {
  const { activeSeason, activeSeasonId, updateSeason } = store
  const data = activeSeason?.data
  const scripts: string[] = (data as any)?.scripts ?? []
  const [activeIdx, setActiveIdx] = useState(0)
  const [dtsContent, setDtsContent] = useState('')
  const [dtsModalOpen, setDtsModalOpen] = useState(false)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)

  const updateScripts = useCallback((newScripts: string[]) => {
    if (!activeSeasonId) return
    updateSeason(activeSeasonId, prev => ({
      ...prev,
      scripts: newScripts,
    }))
  }, [activeSeasonId, updateSeason])

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Configure TypeScript/JavaScript defaults
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      strict: true,
    })

    // Add default type definitions for the game API
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      dtsContent || getDefaultDts(),
      'file:///autochess.d.ts'
    )
  }

  const addScript = () => {
    const newScripts = [...scripts, '// 新脚本\n']
    updateScripts(newScripts)
    setActiveIdx(newScripts.length - 1)
  }

  const removeScript = (idx: number) => {
    const newScripts = scripts.filter((_, i) => i !== idx)
    updateScripts(newScripts)
    if (activeIdx >= newScripts.length) {
      setActiveIdx(Math.max(0, newScripts.length - 1))
    }
  }

  const moveScript = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= scripts.length) return
    const newScripts = [...scripts]
    ;[newScripts[idx], newScripts[target]] = [newScripts[target], newScripts[idx]]
    updateScripts(newScripts)
    setActiveIdx(target)
  }

  const onEditorChange = (value: string | undefined) => {
    if (value === undefined) return
    const newScripts = [...scripts]
    newScripts[activeIdx] = value
    updateScripts(newScripts)
  }

  const loadDtsFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.d.ts,.ts'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      setDtsContent(text)
      if (monacoRef.current) {
        monacoRef.current.languages.typescript.typescriptDefaults.addExtraLib(
          text,
          'file:///autochess.d.ts'
        )
      }
    }
    input.click()
  }

  if (!activeSeason) {
    return <Text c="dimmed">请先选择一个赛季</Text>
  }

  return (
    <Stack gap="md" style={{ height: '100%' }}>
      {/* Toolbar */}
      <Group gap="xs">
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={addScript}>
          添加脚本
        </Button>
        <Button size="xs" variant="light" leftSection={<IconUpload size={14} />} onClick={loadDtsFile}>
          加载 .d.ts 类型文件
        </Button>
        {dtsContent && (
          <Tooltip label="查看当前类型定义">
            <Button size="xs" variant="subtle" onClick={() => setDtsModalOpen(true)}>
              已加载类型定义
            </Button>
          </Tooltip>
        )}
        <Text size="xs" c="dimmed" ml="auto">
          共 {scripts.length} 个脚本
        </Text>
      </Group>

      {scripts.length === 0 ? (
        <Paper p="xl" withBorder style={{ textAlign: 'center' }}>
          <Text c="dimmed">暂无脚本，点击「添加脚本」创建</Text>
        </Paper>
      ) : (
        <Box style={{ display: 'flex', flex: 1, gap: 12, overflow: 'hidden' }}>
          {/* Script list */}
          <Stack gap={4} style={{ width: 200, flexShrink: 0, overflowY: 'auto' }}>
            {scripts.map((script, idx) => {
              const firstLine = script.split('\n')[0].slice(0, 30) || `脚本 ${idx + 1}`
              return (
                <Paper
                  key={idx}
                  p="xs"
                  withBorder
                  style={{
                    cursor: 'pointer',
                    background: idx === activeIdx ? 'var(--mantine-color-teal-9)' : undefined,
                    borderColor: idx === activeIdx ? 'var(--mantine-color-teal-6)' : undefined,
                  }}
                  onClick={() => setActiveIdx(idx)}
                >
                  <Group gap={4} wrap="nowrap" justify="space-between">
                    <Text size="xs" truncate style={{ flex: 1 }}>
                      {idx + 1}. {firstLine.replace(/^\/\/\s*/, '')}
                    </Text>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon size={16} variant="subtle" onClick={(e) => { e.stopPropagation(); moveScript(idx, -1) }} disabled={idx === 0}>
                        <IconArrowUp size={10} />
                      </ActionIcon>
                      <ActionIcon size={16} variant="subtle" onClick={(e) => { e.stopPropagation(); moveScript(idx, 1) }} disabled={idx === scripts.length - 1}>
                        <IconArrowDown size={10} />
                      </ActionIcon>
                      <ActionIcon size={16} variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); removeScript(idx) }}>
                        <IconTrash size={10} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Paper>
              )
            })}
          </Stack>

          {/* Monaco Editor */}
          <Box style={{ flex: 1, border: '1px solid var(--mantine-color-dark-4)', borderRadius: 8, overflow: 'hidden' }}>
            <Editor
              key={activeIdx}
              height="100%"
              language="typescript"
              theme="vs-dark"
              value={scripts[activeIdx] ?? ''}
              onChange={onEditorChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                automaticLayout: true,
              }}
            />
          </Box>
        </Box>
      )}

      {/* DTS preview modal */}
      <Modal opened={dtsModalOpen} onClose={() => setDtsModalOpen(false)} title="类型定义预览" size="lg">
        <Editor
          height="400px"
          language="typescript"
          theme="vs-dark"
          value={dtsContent}
          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
        />
      </Modal>
    </Stack>
  )
}

function getDefaultDts(): string {
  return `
// AutoChess Season Script API
// 加载自定义 .d.ts 文件以获得更完整的类型提示

declare interface ScriptContext {
  /** 当前赛季数据 */
  seasonData: any
  /** 日志输出 */
  log(message: string): void
}

declare const ctx: ScriptContext
`
}
