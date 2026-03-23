import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import type { FlowNodeData } from './graphConversion'
import { getSchema, categoryColors } from './nodeSchema'
import { InlineField } from './InlineField'

const TREE_KEYS = new Set(['$type', '_conditionNode', '_succeedNodes', '_failNodes', '_conditionsNode', '_isAnd'])

function BlueprintNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as FlowNodeData
  const schema = getSchema(d.nodeType)
  const isEvent = d.isEventTrigger
  const isConditionNode = d.treePath?.includes('.condition')
  const color = isEvent ? '#2980b9' : (categoryColors[schema.category] ?? '#7f8c8d')

  const actionNode: Record<string, any> = d.actionNode ?? {}
  const properties = Object.entries(actionNode).filter(([k]) => !TREE_KEYS.has(k))

  const hasBranches = actionNode._succeedNodes != null || actionNode._failNodes != null
  const hasCondition = actionNode._conditionNode != null
  const hasMultiCondition = Array.isArray(actionNode._conditionsNode) && actionNode._conditionsNode.length > 0
  const needsConditionInput = hasCondition || hasMultiCondition

  const { setNodes } = useReactFlow()

  const updateProperty = useCallback((key: string, value: unknown) => {
    setNodes(nodes => nodes.map(n => {
      if (n.id !== id) return n
      const nd = n.data as unknown as FlowNodeData
      const updatedAction = nd.actionNode
        ? { ...nd.actionNode, [key]: value }
        : { $type: nd.nodeType, [key]: value }
      return { ...n, data: { ...nd, actionNode: updatedAction } }
    }))
  }, [id, setNodes])

  // Right-side output handles
  const rightHandles: { id: string; label: string; color: string }[] = []
  if (!isConditionNode) {
    rightHandles.push({ id: 'next', label: 'Exec ▶', color: '#ccc' })
  }
  if (hasBranches) {
    rightHandles.push({ id: 'true', label: 'True ▶', color: '#2ecc71' })
    rightHandles.push({ id: 'false', label: 'False ▶', color: '#e74c3c' })
  }
  // Condition nodes output a boolean result
  if (isConditionNode) {
    rightHandles.push({ id: 'bool_out', label: 'Result ▶', color: '#f39c12' })
  }

  // Left-side input handles (condition inputs for IfElse/IfConditions)
  const conditionInputs: { id: string; label: string; color: string }[] = []
  if (hasCondition) {
    conditionInputs.push({ id: 'condition', label: '● 条件', color: '#f39c12' })
  }
  if (hasMultiCondition) {
    const conditions = actionNode._conditionsNode as unknown[]
    conditions.forEach((_, i) => {
      conditionInputs.push({ id: `condition_${i}`, label: `● 条件${i + 1}`, color: '#f39c12' })
    })
  }

  return (
    <div style={{
      background: 'var(--mantine-color-dark-7, #1a1a2e)',
      borderRadius: 6,
      minWidth: 280,
      maxWidth: 420,
      border: selected ? '2px solid #fff' : `1px solid ${color}55`,
      overflow: 'visible',
      fontSize: 11,
      boxShadow: selected ? `0 0 12px ${color}44` : '0 2px 8px #00000044',
      position: 'relative',
    }}>
      {/* Title bar */}
      <div style={{
        background: color,
        color: '#fff',
        padding: '5px 10px',
        fontWeight: 600,
        fontSize: 11,
        borderRadius: '6px 6px 0 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span>{isEvent ? d.label : schema.shortName}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{schema.category}</span>
      </div>

      {/* Pin labels row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '3px 10px',
        fontSize: 9,
        color: '#888',
        borderBottom: properties.length > 0 ? '1px solid #333' : undefined,
      }}>
        {/* Left: exec in + condition inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {!isEvent && !isConditionNode && <span style={{ color: '#ccc' }}>▶ Exec</span>}
          {conditionInputs.map(h => (
            <span key={h.id} style={{ color: h.color }}>{h.label}</span>
          ))}
        </div>
        {/* Right: exec out + branch out + bool out */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          {rightHandles.map(h => (
            <span key={h.id} style={{ color: h.color }}>{h.label}</span>
          ))}
        </div>
      </div>

      {/* Properties — inline editing */}
      {properties.length > 0 && (
        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {properties.map(([key, value]) => (
            <InlineField
              key={key}
              propKey={key}
              value={value}
              onChange={v => updateProperty(key, v)}
              examples={schema.properties[key]?.examples}
            />
          ))}
        </div>
      )}

      {/* ── Handles ── */}

      {/* Exec In — left side (not for event triggers or condition-check nodes) */}
      {!isEvent && !isConditionNode && (
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          style={{ background: '#ccc', top: 38, width: 10, height: 10, borderRadius: 2 }}
        />
      )}

      {/* Condition inputs — left side below exec in (these are TARGET handles) */}
      {conditionInputs.map((h, i) => (
        <Handle
          key={h.id}
          type="target"
          position={Position.Left}
          id={h.id}
          style={{
            background: h.color,
            top: 38 + ((!isEvent ? 1 : 0) + i) * 14,
            width: 10,
            height: 10,
            borderRadius: '50%',
          }}
        />
      ))}

      {/* Right side outputs: next, true, false, bool_out */}
      {rightHandles.map((h, i) => (
        <Handle
          key={h.id}
          type="source"
          position={Position.Right}
          id={h.id}
          style={{
            background: h.color,
            top: 38 + i * 14,
            width: 10,
            height: 10,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  )
}

export const BlueprintNode = memo(BlueprintNodeInner)
