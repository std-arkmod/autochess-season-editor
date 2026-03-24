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
import type { ConnectionLineComponentProps } from '@xyflow/react'
import type { MouseTool } from './mouseTools'

function ConnectionLine({ fromX, fromY, toX, toY, connectionStatus }: ConnectionLineComponentProps) {
  const isInvalid = connectionStatus === 'invalid'
  const color = isInvalid ? '#e74c3c' : '#ccc'
  return (
    <g>
      <path
        fill="none"
        stroke={color}
        strokeWidth={isInvalid ? 2.5 : 1.5}
        strokeDasharray={isInvalid ? '6 3' : undefined}
        d={`M${fromX},${fromY} C${fromX + 80},${fromY} ${toX - 80},${toY} ${toX},${toY}`}
      />
      <circle cx={toX} cy={toY} r={4} fill={color} />
    </g>
  )
}

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
  onConnectEndEmpty?: (info: {
    nodeId: string
    handleId: string | null
    handleType: 'source' | 'target' | null
    screenPosition: { x: number; y: number }
  }) => void
}

function BuffNodeCanvasInner({
  nodes, edges, edgeStyle, activeTool,
  onNodesChange, onEdgesChange, onNodeSelect, onDrop,
  onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu, onSelectionContextMenu,
  onSelectionUpdate, onReactFlowReady, onCutEdges, onCreateComment, onConnectEndEmpty,
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

  // ── Connection validation ──
  const [connToast, setConnToast] = useState<string | null>(null)
  const connToastTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const showConnToast = useCallback((msg: string) => {
    clearTimeout(connToastTimer.current)
    setConnToast(msg)
    connToastTimer.current = setTimeout(() => setConnToast(null), 2500)
  }, [])

  const validateConnection = useCallback((connection: Connection | Edge): { valid: boolean; reason?: string } => {
    if (connection.source === connection.target) {
      return { valid: false, reason: '不能连接到自身' }
    }

    // Handle type validation
    const srcHandle = connection.sourceHandle ?? ''
    const tgtHandle = connection.targetHandle ?? ''
    const isSrcCondition = srcHandle === 'bool_out'
    const isTgtCondition = tgtHandle === 'condition' || tgtHandle.startsWith('condition_')
    if (isSrcCondition && !isTgtCondition) {
      return { valid: false, reason: '条件输出只能连接到条件输入' }
    }
    if (!isSrcCondition && isTgtCondition) {
      return { valid: false, reason: '条件输入只能接收条件输出' }
    }

    // BFS from connection.target to detect cycle
    const visited = new Set<string>()
    const queue = [connection.target]
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      if (nodeId === connection.source) {
        return { valid: false, reason: '不能形成回环' }
      }
      if (visited.has(nodeId)) continue
      visited.add(nodeId)
      for (const e of edges) {
        if (e.source === nodeId) queue.push(e.target)
      }
    }
    return { valid: true }
  }, [edges])

  // Visual validation — controls connectionStatus for line color (red on invalid)
  const isValidConnection = useCallback((connection: Connection | Edge) => {
    return validateConnection(connection).valid
  }, [validateConnection])

  // Show toast when a connection attempt ends on an invalid target,
  // or open node search when dropped on empty space
  const handleConnectEnd = useCallback((_event: MouseEvent | TouchEvent, state: { isValid?: boolean | null; fromNode?: { id: string } | null; toNode?: { id: string } | null; fromHandle?: { id?: string | null; type?: string | null } | null; toHandle?: { id?: string | null } | null }) => {
    if (state.isValid === false && state.fromNode && state.toNode) {
      const { reason } = validateConnection({
        source: state.fromNode.id,
        target: state.toNode.id,
        sourceHandle: state.fromHandle?.id ?? null,
        targetHandle: state.toHandle?.id ?? null,
      })
      if (reason) showConnToast(reason)
    } else if (!state.toNode && state.fromNode && onConnectEndEmpty) {
      // Dropped on empty space — trigger node creation menu
      const pos = _event instanceof MouseEvent
        ? { x: _event.clientX, y: _event.clientY }
        : { x: (_event as TouchEvent).changedTouches[0].clientX, y: (_event as TouchEvent).changedTouches[0].clientY }
      onConnectEndEmpty({
        nodeId: state.fromNode.id,
        handleId: state.fromHandle?.id ?? null,
        handleType: (state.fromHandle?.type as 'source' | 'target') ?? null,
        screenPosition: pos,
      })
    }
  }, [validateConnection, showConnToast, onConnectEndEmpty])

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // One-to-one: remove any existing edge on the same source handle or target handle
      const filtered = edges.filter(e => {
        if (e.source === connection.source && e.sourceHandle === connection.sourceHandle) return false
        if (e.target === connection.target && e.targetHandle === connection.targetHandle) return false
        return true
      })
      const updated = addEdge({ ...connection, type: edgeStyle }, filtered)
      onEdgesChange(updated)
    },
    [edges, onEdgesChange, edgeStyle, validateConnection, showConnToast],
  )

  // ── Edge reconnection: drag edge endpoint to re-route ──
  const reconnectSuccessful = useRef(false)

  const handleReconnectStart = useCallback(() => {
    reconnectSuccessful.current = false
  }, [])

  const handleReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      const { valid, reason } = validateConnection(newConnection)
      if (!valid) { if (reason) showConnToast(reason); return }
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
    [edges, onEdgesChange, edgeStyle, validateConnection, showConnToast],
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
        onConnectEnd={handleConnectEnd}
        isValidConnection={isValidConnection}
        connectionLineComponent={ConnectionLine}
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

      {/* Connection rejection toast */}
      {connToast && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(220, 53, 69, 0.92)', color: '#fff',
          padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 500,
          pointerEvents: 'none', zIndex: 50, whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {connToast}
        </div>
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
