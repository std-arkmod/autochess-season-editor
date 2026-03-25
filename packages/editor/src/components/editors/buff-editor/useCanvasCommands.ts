import { useMemo } from 'react'
import type { MouseTool } from './mouseTools'

export interface Command {
  id: string
  label: string
  shortcut?: string
  icon?: string
  execute: () => void
  enabled: () => boolean
  readOnlyAllowed?: boolean
}

export interface CanvasCommandsProps {
  // State
  nodeCount: number
  selectedNodeIds: Set<string>
  selectedEdgeIds: Set<string>
  isReadOnly: boolean
  hasUndo: boolean
  hasRedo: boolean
  hasClipboard: boolean
  activeKey: string | null

  // Operations
  undo: () => void
  redo: () => void
  copyNodes: () => void
  pasteNodes: () => void
  cutNodes: () => void
  duplicateNodes: () => void
  deleteSelected: () => void
  selectAll: () => void
  autoLayout: () => void
  frameSelected: () => void
  fitView: () => void
  disconnectNode: () => void
  save: () => void

  // Tool switching
  setActiveTool: (tool: MouseTool) => void
}

export type ContextMenuType = 'pane' | 'node' | 'edge' | 'selection'

export interface ContextMenuItem {
  command: Command
  dividerAfter?: boolean
}

export function useCanvasCommands(props: CanvasCommandsProps) {
  const {
    nodeCount, selectedNodeIds, selectedEdgeIds, isReadOnly,
    hasUndo, hasRedo, hasClipboard, activeKey,
    undo, redo, copyNodes, pasteNodes, cutNodes, duplicateNodes,
    deleteSelected, selectAll, autoLayout, frameSelected, fitView,
    disconnectNode, save,
  } = props

  const commands = useMemo(() => {
    const hasSelection = selectedNodeIds.size > 0 || selectedEdgeIds.size > 0
    const hasNodeSelection = selectedNodeIds.size > 0
    const hasNodes = nodeCount > 0

    const map = new Map<string, Command>()

    const defs: Command[] = [
      {
        id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', icon: 'IconArrowBackUp',
        execute: undo,
        enabled: () => hasUndo && !isReadOnly,
      },
      {
        id: 'redo', label: '重做', shortcut: 'Ctrl+Shift+Z', icon: 'IconArrowForwardUp',
        execute: redo,
        enabled: () => hasRedo && !isReadOnly,
      },
      {
        id: 'copy', label: '复制', shortcut: 'Ctrl+C', icon: 'IconCopy',
        execute: copyNodes,
        enabled: () => hasNodeSelection,
        readOnlyAllowed: true,
      },
      {
        id: 'paste', label: '粘贴', shortcut: 'Ctrl+V', icon: 'IconClipboard',
        execute: pasteNodes,
        enabled: () => !isReadOnly,
      },
      {
        id: 'cut', label: '剪切', shortcut: 'Ctrl+X', icon: 'IconScissors',
        execute: cutNodes,
        enabled: () => hasNodeSelection && !isReadOnly,
      },
      {
        id: 'duplicate', label: '原地复制', shortcut: 'Ctrl+D', icon: 'IconCopyPlus',
        execute: duplicateNodes,
        enabled: () => hasNodeSelection && !isReadOnly,
      },
      {
        id: 'delete', label: '删除', shortcut: 'Delete', icon: 'IconTrash',
        execute: deleteSelected,
        enabled: () => hasSelection && !isReadOnly,
      },
      {
        id: 'selectAll', label: '全选', shortcut: 'Ctrl+A', icon: 'IconSelectAll',
        execute: selectAll,
        enabled: () => hasNodes,
        readOnlyAllowed: true,
      },
      {
        id: 'autoLayout', label: '自动布局', shortcut: 'Ctrl+Shift+L', icon: 'IconLayoutAlignBottom',
        execute: autoLayout,
        enabled: () => hasNodes,
        readOnlyAllowed: true,
      },
      {
        id: 'frameSelected', label: '聚焦选中', shortcut: 'F', icon: 'IconFocusCentered',
        execute: frameSelected,
        enabled: () => hasNodeSelection,
        readOnlyAllowed: true,
      },
      {
        id: 'fitView', label: '适应画布', shortcut: 'Home', icon: 'IconMaximize',
        execute: fitView,
        enabled: () => hasNodes,
        readOnlyAllowed: true,
      },
      {
        id: 'disconnect', label: '断开连接', shortcut: 'Alt+D', icon: 'IconUnlink',
        execute: disconnectNode,
        enabled: () => hasNodeSelection && !isReadOnly,
      },
      {
        id: 'save', label: '保存', shortcut: 'Ctrl+S',
        execute: save,
        enabled: () => !!activeKey && !isReadOnly,
      },
    ]

    for (const cmd of defs) map.set(cmd.id, cmd)
    return map
  }, [
    nodeCount, selectedNodeIds, selectedEdgeIds, isReadOnly,
    hasUndo, hasRedo, hasClipboard, activeKey,
    undo, redo, copyNodes, pasteNodes, cutNodes, duplicateNodes,
    deleteSelected, selectAll, autoLayout, frameSelected, fitView,
    disconnectNode, save,
  ])

  const hotkeyBindings = useMemo((): Array<[string, (e: KeyboardEvent) => void]> => {
    const isInputFocused = () => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
    }

    const bindings: Array<[string, (e: KeyboardEvent) => void]> = []
    for (const cmd of commands.values()) {
      if (!cmd.shortcut) continue
      // Convert shortcut to Mantine useHotkeys format
      const key = cmd.shortcut
        .replace('Ctrl+', 'mod+')
        .replace('Alt+', 'alt+')
        .replace('Shift+', 'shift+')
        .replace('Delete', 'Delete')
        .replace('Home', 'Home')
      bindings.push([key, (e: KeyboardEvent) => {
        // Skip single-letter keys when a text input is focused
        if (!key.includes('+') && isInputFocused()) return
        // Prevent browser defaults for our shortcuts
        e.preventDefault()
        if (cmd.enabled()) cmd.execute()
      }])
    }

    // Tool-switching hotkeys (single letter, no modifier)
    // Skip when a text input is focused to avoid swallowing typed characters
    const toolKeys: Array<[string, MouseTool]> = [
      ['V', 'select'], ['H', 'pan'], ['K', 'knife'], ['C', 'comment'],
    ]
    for (const [key, tool] of toolKeys) {
      bindings.push([key, (e: KeyboardEvent) => {
        if (isInputFocused()) return
        e.preventDefault()
        props.setActiveTool(tool)
      }])
    }

    return bindings
  }, [commands, props.setActiveTool])

  const getContextMenuItems = useMemo(() => {
    return (type: ContextMenuType): ContextMenuItem[] => {
      const cmd = (id: string) => commands.get(id)!

      switch (type) {
        case 'pane':
          return [
            { command: cmd('paste') },
            { command: cmd('selectAll'), dividerAfter: true },
            { command: cmd('autoLayout') },
            { command: cmd('fitView'), dividerAfter: true },
            { command: cmd('undo') },
            { command: cmd('redo') },
          ]
        case 'node':
          return [
            { command: cmd('copy') },
            { command: cmd('cut') },
            { command: cmd('duplicate'), dividerAfter: true },
            { command: cmd('disconnect') },
            { command: cmd('delete') },
          ]
        case 'edge':
          return [
            { command: cmd('delete') },
          ]
        case 'selection':
          return [
            { command: cmd('copy') },
            { command: cmd('cut') },
            { command: cmd('duplicate'), dividerAfter: true },
            { command: cmd('delete'), dividerAfter: true },
            { command: cmd('autoLayout') },
          ]
        default:
          return []
      }
    }
  }, [commands])

  return { commands, hotkeyBindings, getContextMenuItems }
}
