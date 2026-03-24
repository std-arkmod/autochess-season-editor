import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  PanOnScrollMode,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnReconnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { BlueprintNode } from './BlueprintNode'
import { CommentNode } from './CommentNode'
import { KnifeToolOverlay } from './KnifeToolOverlay'
import { CommentToolOverlay } from './CommentToolOverlay'
import type { MouseTool } from './mouseTools'

const nodeTypes = {
  blueprint: BlueprintNode,
  comment: CommentNode,
}

export type EdgeStyle = 'default' | 'straight' | 'step' | 'smoothstep'

export interface ReactFlowApi {
  fitView: (options?: { padding?: number; nodes?: Array<{ id: string }> }) => void
  getNodes: () => Node[]
  setCenter: (x: number, y: number, options?: { zoom?: number }) => void
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number }
}

interface Props {
  nodes: Node[]
  edges: Edge[]
  edgeStyle: EdgeStyle
  activeTool: MouseTool
  onNodesChange: (nodes: Node[]) => void
  onEdgesChange: (edges: Edge[]) => void
  onNodeSelect: (nodeId: string | null) => void
  onDrop?: (event: React.DragEvent, position: { x: number; y: number }) => void
  onPaneContextMenu?: (e: React.MouseEvent) => void
  onNodeContextMenu?: (e: React.MouseEvent, node: Node) => void
  onEdgeContextMenu?: (e: React.MouseEvent, edge: Edge) => void
  onSelectionContextMenu?: (e: React.MouseEvent, nodes: Node[]) => void
  onSelectionUpdate?: (params: { nodes: Node[]; edges: Edge[] }) => void
  onReactFlowReady?: (api: ReactFlowApi) => void
  onCutEdges?: (edgeIds: string[]) => void
  onCreateComment?: (position: { x: number; y: number }, size: { width: number; height: number }) => void
}

function BuffNodeCanvasInner({
  nodes, edges, edgeStyle, activeTool,
  onNodesChange, onEdgesChange, onNodeSelect, onDrop,
  onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu, onSelectionContextMenu,
  onSelectionUpdate, onReactFlowReady, onCutEdges, onCreateComment,
}: Props) {
  const reactFlow = useReactFlow()

  useEffect(() => {
    if (onReactFlowReady) {
      onReactFlowReady({
        fitView: (opts) => reactFlow.fitView(opts),
        getNodes: () => reactFlow.getNodes(),
        setCenter: (x, y, opts) => reactFlow.setCenter(x, y, opts),
        screenToFlowPosition: (pos) => reactFlow.screenToFlowPosition(pos),
      })
    }
  }, [reactFlow, onReactFlowReady])

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const filtered = changes.filter(c => c.type !== 'remove')
      if (filtered.length === 0) return
      const updated = applyNodeChanges(filtered, nodes)
      onNodesChange(updated as Node[])
    },
    [nodes, onNodesChange],
  )

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const filtered = changes.filter(c => c.type !== 'remove')
      if (filtered.length === 0) return
      const updated = applyEdgeChanges(filtered, edges)
      onEdgesChange(updated as Edge[])
    },
    [edges, onEdgesChange],
  )

  // ── Connection validation: no self-loops ──
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    return connection.source !== connection.target
  }, [])

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return
      // One-to-one: remove any existing edge on the same source handle or target handle
      const filtered = edges.filter(e => {
        if (e.source === connection.source && e.sourceHandle === connection.sourceHandle) return false
        if (e.target === connection.target && e.targetHandle === connection.targetHandle) return false
        return true
      })
      const updated = addEdge({ ...connection, type: edgeStyle }, filtered)
      onEdgesChange(updated)
    },
    [edges, onEdgesChange, edgeStyle],
  )

  // ── Edge reconnection: drag edge endpoint to re-route ──
  const reconnectSuccessful = useRef(false)

  const handleReconnectStart = useCallback(() => {
    reconnectSuccessful.current = false
  }, [])

  const handleReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      if (newConnection.source === newConnection.target) return
      reconnectSuccessful.current = true
      // Remove old edge + any existing edge on the new handle (one-to-one)
      const without = edges.filter(e => {
        if (e.id === oldEdge.id) return false
        if (e.source === newConnection.source && e.sourceHandle === newConnection.sourceHandle) return false
        if (e.target === newConnection.target && e.targetHandle === newConnection.targetHandle) return false
        return true
      })
      const updated = addEdge({ ...newConnection, type: edgeStyle }, without)
      onEdgesChange(updated)
    },
    [edges, onEdgesChange, edgeStyle],
  )

  const handleReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectSuccessful.current) {
        // Dragged to void — remove the edge
        onEdgesChange(edges.filter(e => e.id !== edge.id))
      }
      reconnectSuccessful.current = false
    },
    [edges, onEdgesChange],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (selectedNodes.length === 1) {
        onNodeSelect(selectedNodes[0].id)
      } else {
        onNodeSelect(null)
      }
      onSelectionUpdate?.({ nodes: selectedNodes, edges: selectedEdges })
    },
    [onNodeSelect, onSelectionUpdate],
  )

  const handlePaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault()
      onPaneContextMenu?.(e as React.MouseEvent)
    },
    [onPaneContextMenu],
  )

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault()
      onNodeContextMenu?.(e, node)
    },
    [onNodeContextMenu],
  )

  const handleEdgeContextMenu = useCallback(
    (e: React.MouseEvent, edge: Edge) => {
      e.preventDefault()
      onEdgeContextMenu?.(e, edge)
    },
    [onEdgeContextMenu],
  )

  const handleSelectionContextMenu = useCallback(
    (e: React.MouseEvent, nodes: Node[]) => {
      e.preventDefault()
      onSelectionContextMenu?.(e, nodes)
    },
    [onSelectionContextMenu],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!onDrop) return
      const position = reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      onDrop(e, position)
    },
    [onDrop, reactFlow],
  )

  const styledEdges = useMemo(() =>
    edges.map(e => ({ ...e, type: edgeStyle })),
    [edges, edgeStyle],
  )

  const defaultEdgeOptions = useMemo(() => ({
    type: edgeStyle,
    animated: false,
  }), [edgeStyle])

  // ── Tool-dependent ReactFlow config ──
  const isSelect = activeTool === 'select'
  const isPan = activeTool === 'pan'
  const isOverlayTool = activeTool === 'knife' || activeTool === 'comment'

  // panOnDrag: array of mouse buttons that trigger pan
  // select: middle+right pan; pan: all buttons pan; knife/comment: middle+right pan
  const panOnDrag = useMemo<number[] | boolean>(() => {
    if (isPan) return [0, 1, 2]
    return [1, 2]
  }, [isPan])

  // selectionOnDrag: only for select tool (left-drag on empty = box select)
  const selectionOnDrag = isSelect

  // nodesDraggable: not for pan/knife/comment tools
  const nodesDraggable = isSelect

  // Track Space key for temporary pan cursor
  const [spaceHeld, setSpaceHeld] = useState(false)
  // Track Shift key for horizontal scroll
  const [shiftHeld, setShiftHeld] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(true)
      if (e.key === 'Shift') setShiftHeld(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
      if (e.key === 'Shift') setShiftHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // Scroll mode: default=vertical pan, Shift=horizontal pan, Ctrl=zoom
  const panScrollMode = shiftHeld ? PanOnScrollMode.Horizontal : PanOnScrollMode.Vertical

  // Cursor: override ReactFlow's built-in grab cursor on the pane
  const paneCursor = spaceHeld || isPan ? 'grab' : isOverlayTool ? 'crosshair' : 'default'
  const nodeCursor = spaceHeld || isPan ? 'grab' : isSelect ? 'pointer' : 'crosshair'
  const cursorCSS = `
    .bf-canvas-wrap .react-flow__pane { cursor: ${paneCursor} !important; }
    .bf-canvas-wrap .react-flow__pane:active { cursor: ${spaceHeld || isPan ? 'grabbing' : paneCursor} !important; }
    .bf-canvas-wrap .react-flow__node { cursor: ${nodeCursor} !important; }
  `

  return (
    <div
      className="bf-canvas-wrap"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <style>{cursorCSS}</style>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onReconnect={handleReconnect}
        onReconnectStart={handleReconnectStart}
        onReconnectEnd={handleReconnectEnd}
        onSelectionChange={handleSelectionChange}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onSelectionContextMenu={handleSelectionContextMenu}
        defaultEdgeOptions={defaultEdgeOptions}
        panOnDrag={panOnDrag}
        panOnScroll
        panOnScrollMode={panScrollMode}
        zoomOnScroll={false}
        zoomActivationKeyCode=" "
        selectionOnDrag={selectionOnDrag}
        selectionMode={SelectionMode.Partial}
        nodesDraggable={nodesDraggable}
        fitView
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        deleteKeyCode={null}
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          style={{ background: '#1a1b1e' }}
        />
      </ReactFlow>

      {/* Tool overlays — rendered on top of ReactFlow canvas */}
      {activeTool === 'knife' && onCutEdges && (
        <KnifeToolOverlay onCutEdges={onCutEdges} />
      )}
      {activeTool === 'comment' && onCreateComment && (
        <CommentToolOverlay onCreateComment={onCreateComment} />
      )}
    </div>
  )
}

export function BuffNodeCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <BuffNodeCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
