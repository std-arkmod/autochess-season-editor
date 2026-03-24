import dagre from 'dagre'
import type { Node, Edge } from '@xyflow/react'
import type { FlowNodeData } from './graphConversion'

const NODE_WIDTH = 300

const TREE_KEYS = new Set(['$type', '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode', '_isAnd'])

/** Estimate node height based on its content to prevent overlap */
function estimateNodeHeight(node: Node): number {
  const d = node.data as unknown as FlowNodeData
  const actionNode: Record<string, any> = d?.actionNode ?? {}

  // Title bar: ~28px
  let height = 28

  // Pin rows
  const isEvent = d?.isEventTrigger
  const isConditionNode = d?.treePath?.includes('.condition')
  const hasCondition = actionNode._conditionNode != null
  const hasMultiCondition = Array.isArray(actionNode._conditionsNode) && actionNode._conditionsNode.length > 0
  const hasBranches = actionNode._succeedNodes != null || actionNode._failNodes != null

  let leftPinCount = 0
  if (!isEvent && !isConditionNode) leftPinCount++
  if (hasCondition) leftPinCount++
  if (hasMultiCondition) leftPinCount += (actionNode._conditionsNode as unknown[]).length

  let rightPinCount = 0
  if (!isConditionNode) rightPinCount++
  if (hasBranches) rightPinCount += 2
  if (isConditionNode) rightPinCount++

  const pinRows = Math.max(leftPinCount, rightPinCount)
  height += pinRows * 18 + (pinRows > 0 ? 6 : 0) // 18px per row + padding

  // Properties: each property row ~24px, complex ones (objects/arrays) are taller
  const properties = Object.entries(actionNode).filter(([k]) => !TREE_KEYS.has(k))
  if (properties.length > 0) {
    height += 12 // padding top+bottom
    for (const [, value] of properties) {
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        // Nested object — collapsed by default, count as single row
        height += 24
      } else if (Array.isArray(value)) {
        // Array — collapsed by default, count as single row
        height += 24
      } else {
        height += 24
      }
    }
  }

  return Math.max(height, 60)
}

export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'LR',
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 120,
    edgesep: 20,
  })

  const nodeSizes = new Map<string, { width: number; height: number }>()
  for (const node of nodes) {
    const height = estimateNodeHeight(node)
    const size = { width: NODE_WIDTH, height }
    nodeSizes.set(node.id, size)
    g.setNode(node.id, size)
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map(node => {
    const pos = g.node(node.id)
    if (!pos) return node
    const size = nodeSizes.get(node.id) ?? { width: NODE_WIDTH, height: 120 }
    return {
      ...node,
      position: {
        x: pos.x - size.width / 2,
        y: pos.y - size.height / 2,
      },
    }
  })
}
