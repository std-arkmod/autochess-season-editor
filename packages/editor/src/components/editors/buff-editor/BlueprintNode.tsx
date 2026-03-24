import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react'
import type { FlowNodeData } from './graphConversion'
import { getSchema, categoryColors } from './nodeSchema'
import { InlineField } from './InlineField'
import { nodeNames, eventLabels } from './buffEditorI18n'

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

  // Build left-side pins (inputs)
  const leftPins: { id: string; label: string; color: string; type: 'target' }[] = []
  if (!isEvent && !isConditionNode) {
    leftPins.push({ id: 'in', label: '▶ Exec', color: '#ccc', type: 'target' })
  }
  if (hasCondition) {
    leftPins.push({ id: 'condition', label: '● 条件', color: '#f39c12', type: 'target' })
  }
  if (hasMultiCondition) {
    const conditions = actionNode._conditionsNode as unknown[]
    conditions.forEach((_, i) => {
      leftPins.push({ id: `condition_${i}`, label: `● 条件${i + 1}`, color: '#f39c12', type: 'target' })
    })
  }

  // Build right-side pins (outputs)
  const rightPins: { id: string; label: string; color: string; type: 'source' }[] = []
  if (!isConditionNode) {
    rightPins.push({ id: 'next', label: 'Exec ▶', color: '#ccc', type: 'source' })
  }
  if (hasBranches) {
    rightPins.push({ id: 'true', label: 'True ▶', color: '#2ecc71', type: 'source' })
    rightPins.push({ id: 'false', label: 'False ▶', color: '#e74c3c', type: 'source' })
  }
  if (isConditionNode) {
    rightPins.push({ id: 'bool_out', label: 'Result ▶', color: '#f39c12', type: 'source' })
  }

  const pinRowCount = Math.max(leftPins.length, rightPins.length)

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
        <span title={isEvent ? (d.label as string) : schema.shortName}>
          {isEvent ? (eventLabels[d.label as string] ?? d.label) : (nodeNames[schema.shortName] ?? schema.shortName)}
        </span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{schema.category}</span>
      </div>

      {/* Pin rows — each row has a left pin and a right pin, handles are inline */}
      {pinRowCount > 0 && (
        <div style={{
          borderBottom: properties.length > 0 ? '1px solid #333' : undefined,
        }}>
          {Array.from({ length: pinRowCount }).map((_, i) => {
            const left = leftPins[i]
            const right = rightPins[i]
            return (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '3px 10px',
                fontSize: 9,
                position: 'relative',
                minHeight: 18,
              }}>
                {/* Left pin */}
                <div style={{ position: 'relative', color: left?.color ?? 'transparent' }}>
                  {left && (
                    <>
                      <span>{left.label}</span>
                      <Handle
                        type={left.type}
                        position={Position.Left}
                        id={left.id}
                        style={{
                          background: left.color,
                          width: 10, height: 10,
                          borderRadius: left.id === 'in' ? 2 : '50%',
                          position: 'absolute',
                          left: -18,
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      />
                    </>
                  )}
                </div>
                {/* Right pin */}
                <div style={{ position: 'relative', color: right?.color ?? 'transparent' }}>
                  {right && (
                    <>
                      <span>{right.label}</span>
                      <Handle
                        type={right.type}
                        position={Position.Right}
                        id={right.id}
                        style={{
                          background: right.color,
                          width: 10, height: 10,
                          borderRadius: 2,
                          position: 'absolute',
                          right: -18,
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
    </div>
  )
}

export const BlueprintNode = memo(BlueprintNodeInner)
