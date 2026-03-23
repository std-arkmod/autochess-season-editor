import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { BlueprintNode } from './BlueprintNode'

const nodeTypes = {
  blueprint: BlueprintNode,
}

export type EdgeStyle = 'default' | 'straight' | 'step' | 'smoothstep'

interface Props {
  nodes: Node[]
  edges: Edge[]
  edgeStyle: EdgeStyle
  onNodesChange: (nodes: Node[]) => void
  onEdgesChange: (edges: Edge[]) => void
  onNodeSelect: (nodeId: string | null) => void
  onDrop?: (event: React.DragEvent, position: { x: number; y: number }) => void
}

export function BuffNodeCanvas({ nodes, edges, edgeStyle, onNodesChange, onEdgesChange, onNodeSelect, onDrop }: Props) {
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const updated = applyNodeChanges(changes, nodes)
      onNodesChange(updated as Node[])
    },
    [nodes, onNodesChange],
  )

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const updated = applyEdgeChanges(changes, edges)
      onEdgesChange(updated as Edge[])
    },
    [edges, onEdgesChange],
  )

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const updated = addEdge({ ...connection, type: edgeStyle }, edges)
      onEdgesChange(updated)
    },
    [edges, onEdgesChange, edgeStyle],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      if (selectedNodes.length === 1) {
        onNodeSelect(selectedNodes[0].id)
      } else {
        onNodeSelect(null)
      }
    },
    [onNodeSelect],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!onDrop) return
      const bounds = (e.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect()
      if (!bounds) return
      onDrop(e, { x: e.clientX - bounds.left, y: e.clientY - bounds.top })
    },
    [onDrop],
  )

  // Apply edge style to all existing edges
  const styledEdges = useMemo(() =>
    edges.map(e => ({ ...e, type: edgeStyle })),
    [edges, edgeStyle],
  )

  const defaultEdgeOptions = useMemo(() => ({
    type: edgeStyle,
    animated: false,
  }), [edgeStyle])

  return (
    <div style={{ width: '100%', height: '100%' }} onDragOver={handleDragOver} onDrop={handleDrop}>
      <ReactFlow
        nodes={nodes}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onSelectionChange={handleSelectionChange}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background gap={20} size={1} />
        <Controls />
        <MiniMap
          nodeStrokeWidth={3}
          style={{ background: '#1a1b1e' }}
        />
      </ReactFlow>
    </div>
  )
}
