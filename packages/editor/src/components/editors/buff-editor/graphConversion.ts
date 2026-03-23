import type { Node, Edge } from '@xyflow/react'
import type { BuffTemplate, ActionNode } from '@autochess-editor/shared'
import { getSchema } from './nodeSchema'

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  nodeType: string
  category: string
  color: string
  eventType?: string
  actionNode?: ActionNode
  isEventTrigger?: boolean
  treePath: string
}

let nodeIdCounter = 0

function nextId(prefix: string): string {
  return `${prefix}_${nodeIdCounter++}`
}

/** Known special keys that are part of the tree structure, not node properties */
const TREE_KEYS = new Set([
  '$type', '_conditionNode', '_succeedNodes', '_failNodes',
  '_conditionsNode', '_isAnd',
])

/** Extract user-facing properties from an ActionNode (excluding tree structure keys) */
export function getNodeProperties(node: ActionNode): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) {
    if (!TREE_KEYS.has(k)) {
      props[k] = v
    }
  }
  return props
}

/** Convert a BuffTemplate tree into React Flow nodes and edges */
export function treeToGraph(template: BuffTemplate): { nodes: Node[]; edges: Edge[] } {
  nodeIdCounter = 0
  const nodes: Node[] = []
  const edges: Edge[] = []

  const eventTypes = Object.keys(template.eventToActions)

  let eventY = 0
  for (const eventType of eventTypes) {
    const actions = template.eventToActions[eventType]
    if (!actions || actions.length === 0) continue

    const triggerId = nextId('trigger')
    nodes.push({
      id: triggerId,
      type: 'blueprint',
      position: { x: 0, y: eventY },
      data: {
        label: eventType,
        nodeType: 'event_trigger',
        category: 'event',
        color: '#2c3e50',
        eventType,
        isEventTrigger: true,
        treePath: eventType,
      } satisfies FlowNodeData,
    })

    const result = walkActions(actions, `${eventType}`, 0)

    if (result.length > 0) {
      edges.push({
        id: `e_${triggerId}_${result[0].id}`,
        source: triggerId,
        target: result[0].id,
        sourceHandle: 'next',
        type: 'smoothstep',
      })

      for (let i = 0; i < result.length - 1; i++) {
        if (!result[i].isBranching) {
          edges.push({
            id: `e_${result[i].id}_${result[i + 1].id}`,
            source: result[i].id,
            target: result[i + 1].id,
            sourceHandle: 'next',
            type: 'smoothstep',
          })
        }
      }

      nodes.push(...result.flatMap(r => r.nodes))
      edges.push(...result.flatMap(r => r.edges))
    }

    eventY += 300
  }

  return { nodes, edges }
}

interface WalkResult {
  id: string
  nodes: Node[]
  edges: Edge[]
  isBranching: boolean
}

function walkActions(actions: ActionNode[], pathPrefix: string, startX: number): WalkResult[] {
  const results: WalkResult[] = []

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const path = `${pathPrefix}.${i}`
    const typeDef = getSchema(action.$type)
    const label = typeDef.shortName
    const category = typeDef.category

    const nodeId = nextId('action')
    const nodeData: FlowNodeData = {
      label,
      nodeType: action.$type,
      category,
      color: '',
      actionNode: action,
      treePath: path,
    }

    const resultNodes: Node[] = []
    const resultEdges: Edge[] = []

    // Detect branching patterns
    const hasSingleCondition = action._conditionNode != null
    const hasMultiCondition = Array.isArray(action._conditionsNode) && action._conditionsNode.length > 0
    const hasBranches = action._succeedNodes != null || action._failNodes != null
    const isBranching = hasSingleCondition || hasMultiCondition || hasBranches

    // Determine visual node type
    const flowNodeType = 'blueprint'

    resultNodes.push({
      id: nodeId,
      type: flowNodeType,
      position: { x: startX, y: 0 },
      data: nodeData,
    })

    // Handle single condition node (_conditionNode)
    if (hasSingleCondition && action._conditionNode) {
      const condNode = action._conditionNode as ActionNode
      const condDef = getSchema(condNode.$type)
      const condId = nextId('cond')
      resultNodes.push({
        id: condId,
        type: 'blueprint',
        position: { x: 0, y: 0 },
        data: {
          label: condDef.shortName,
          nodeType: condNode.$type,
          category: condDef.category,
          color: '',
          actionNode: condNode,
          treePath: `${path}.condition`,
        } satisfies FlowNodeData,
      })
      // Edge: condNode (bool_out) → ifElseNode (condition input)
      resultEdges.push({
        id: `e_${condId}_${nodeId}`,
        source: condId,
        target: nodeId,
        sourceHandle: 'bool_out',
        targetHandle: 'condition',
        label: '条件',
        type: 'smoothstep',
        style: { stroke: '#f39c12' },
      })
    }

    // Handle multiple condition nodes (_conditionsNode array)
    if (hasMultiCondition) {
      const conditions = action._conditionsNode as ActionNode[]
      for (let ci = 0; ci < conditions.length; ci++) {
        const condNode = conditions[ci]
        const condDef = getSchema(condNode.$type)
        const condId = nextId('cond')
        resultNodes.push({
          id: condId,
          type: 'blueprint',
          position: { x: 0, y: 0 },
          data: {
            label: condDef.shortName,
            nodeType: condNode.$type,
            category: condDef.category,
            color: '',
            actionNode: condNode,
            treePath: `${path}.conditions.${ci}`,
          } satisfies FlowNodeData,
        })
        // Edge: condNode (bool_out) → ifElseNode (condition_N input)
        resultEdges.push({
          id: `e_${condId}_${nodeId}`,
          source: condId,
          target: nodeId,
          sourceHandle: 'bool_out',
          targetHandle: `condition_${ci}`,
          label: `条件${ci + 1}`,
          type: 'smoothstep',
          style: { stroke: '#f39c12' },
        })
      }
    }

    // Handle succeed branch
    if (action._succeedNodes && (action._succeedNodes as ActionNode[]).length > 0) {
      const succeedResults = walkActions(action._succeedNodes as ActionNode[], `${path}.succeed`, startX - 150)
      if (succeedResults.length > 0) {
        resultEdges.push({
          id: `e_${nodeId}_${succeedResults[0].id}`,
          source: nodeId,
          target: succeedResults[0].id,
          sourceHandle: 'true',
          label: 'True',
          type: 'smoothstep',
          style: { stroke: '#2ecc71' },
        })
        connectSequential(succeedResults, resultEdges)
        resultNodes.push(...succeedResults.flatMap(r => r.nodes))
        resultEdges.push(...succeedResults.flatMap(r => r.edges))
      }
    }

    // Handle fail branch
    if (action._failNodes && (action._failNodes as ActionNode[]).length > 0) {
      const failResults = walkActions(action._failNodes as ActionNode[], `${path}.fail`, startX + 150)
      if (failResults.length > 0) {
        resultEdges.push({
          id: `e_${nodeId}_${failResults[0].id}`,
          source: nodeId,
          target: failResults[0].id,
          sourceHandle: 'false',
          label: 'False',
          type: 'smoothstep',
          style: { stroke: '#e74c3c' },
        })
        connectSequential(failResults, resultEdges)
        resultNodes.push(...failResults.flatMap(r => r.nodes))
        resultEdges.push(...failResults.flatMap(r => r.edges))
      }
    }

    results.push({ id: nodeId, nodes: resultNodes, edges: resultEdges, isBranching })
  }

  return results
}

/** Connect walk results sequentially (non-branching nodes get 'next' edges) */
function connectSequential(results: WalkResult[], edges: Edge[]) {
  for (let j = 0; j < results.length - 1; j++) {
    if (!results[j].isBranching) {
      edges.push({
        id: `e_${results[j].id}_${results[j + 1].id}`,
        source: results[j].id,
        target: results[j + 1].id,
        sourceHandle: 'next',
        type: 'smoothstep',
      })
    }
  }
}

// ── Graph → Tree reconstruction ──

export function graphToTree(
  nodes: Node[],
  edges: Edge[],
): Pick<BuffTemplate, 'eventToActions'> {
  const eventToActions: Record<string, ActionNode[]> = {}

  const outEdges = new Map<string, { target: string; handle: string | null | undefined }[]>()
  const inEdges = new Map<string, { source: string; sourceHandle: string | null | undefined; targetHandle: string | null | undefined }[]>()
  for (const edge of edges) {
    const outList = outEdges.get(edge.source) ?? []
    outList.push({ target: edge.target, handle: edge.sourceHandle })
    outEdges.set(edge.source, outList)

    const inList = inEdges.get(edge.target) ?? []
    inList.push({ source: edge.source, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle })
    inEdges.set(edge.target, inList)
  }

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  const triggers = nodes.filter(n => (n.data as FlowNodeData)?.isEventTrigger)

  for (const trigger of triggers) {
    const td = trigger.data as FlowNodeData
    const eventType = td?.eventType
    if (!eventType) continue

    const nextEdges = outEdges.get(trigger.id) ?? []
    const firstNext = nextEdges.find(e => e.handle === 'next')
    if (!firstNext) {
      eventToActions[eventType] = []
      continue
    }

    eventToActions[eventType] = reconstructChain(firstNext.target, outEdges, inEdges, nodeMap)
  }

  return { eventToActions }
}

function reconstructChain(
  startId: string,
  outEdges: Map<string, { target: string; handle: string | null | undefined }[]>,
  inEdges: Map<string, { source: string; sourceHandle: string | null | undefined; targetHandle: string | null | undefined }[]>,
  nodeMap: Map<string, Node>,
): ActionNode[] {
  const result: ActionNode[] = []
  let currentId: string | null = startId

  while (currentId) {
    const node = nodeMap.get(currentId)
    if (!node || (node.data as FlowNodeData)?.isEventTrigger) break

    const actionNode = rebuildActionNode(node, outEdges, inEdges, nodeMap)
    result.push(actionNode)

    const nexts = outEdges.get(currentId) ?? []
    const nextEdge = nexts.find(e => e.handle === 'next')
    currentId = nextEdge?.target ?? null
  }

  return result
}

function rebuildActionNode(
  node: Node,
  outEdges: Map<string, { target: string; handle: string | null | undefined }[]>,
  inEdges: Map<string, { source: string; sourceHandle: string | null | undefined; targetHandle: string | null | undefined }[]>,
  nodeMap: Map<string, Node>,
): ActionNode {
  const data = node.data as FlowNodeData
  const original = data.actionNode
  const result: ActionNode = { $type: data.nodeType }

  // Copy properties from original (excluding tree structure keys)
  if (original) {
    for (const [k, v] of Object.entries(original)) {
      if (!TREE_KEYS.has(k)) {
        result[k] = v
      }
    }
  }

  const nexts = outEdges.get(node.id) ?? []
  const ins = inEdges.get(node.id) ?? []

  // Rebuild single condition (_conditionNode) — condition nodes connect INTO this node
  const condEdge = ins.find(e => e.targetHandle === 'condition')
  if (condEdge) {
    const condNode = nodeMap.get(condEdge.source)
    const condData = condNode?.data as FlowNodeData | undefined
    if (condData?.actionNode) {
      result._conditionNode = { ...condData.actionNode }
    }
  }

  // Rebuild multiple conditions (_conditionsNode) — condition nodes connect INTO condition_N handles
  const conditionEdges = ins
    .filter(e => e.targetHandle && e.targetHandle.startsWith('condition_'))
    .sort((a, b) => {
      const ai = parseInt(a.targetHandle!.replace('condition_', ''))
      const bi = parseInt(b.targetHandle!.replace('condition_', ''))
      return ai - bi
    })
  if (conditionEdges.length > 0) {
    result._conditionsNode = conditionEdges.map(ce => {
      const cn = nodeMap.get(ce.source)
      const cd = cn?.data as FlowNodeData | undefined
      return cd?.actionNode ? { ...cd.actionNode } : { $type: 'unknown' }
    })
    if (original?._isAnd !== undefined) {
      result._isAnd = original._isAnd
    }
  }

  // Rebuild succeed branch
  const trueEdge = nexts.find(e => e.handle === 'true')
  if (trueEdge) {
    result._succeedNodes = reconstructChain(trueEdge.target, outEdges, inEdges, nodeMap)
  }

  // Rebuild fail branch
  const falseEdge = nexts.find(e => e.handle === 'false')
  if (falseEdge) {
    result._failNodes = reconstructChain(falseEdge.target, outEdges, inEdges, nodeMap)
  }

  return result
}
