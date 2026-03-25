import { memo, useCallback, useRef, useEffect } from 'react'
import { Handle, Position, type NodeProps, useStore } from '@xyflow/react'
import type { FlowNodeData } from './graphConversion'
import { TREE_KEYS } from './constants'
import { getSchema, categoryColors, categoryLabels } from './nodeSchema'
import { InlineField } from './InlineField'
import { nodeNames, eventLabels, tl, tlTip } from './buffEditorI18n'
import { useBuffEditor } from './BuffEditorContext'

function BlueprintNodeInner({ id, data, selected }: NodeProps) {
  const { labelMode, onPropertyEdit, isReadOnly } = useBuffEditor()
  const d = data as unknown as FlowNodeData

  // Condition detection: explicit flag (from treeToGraph) + dynamic edge fallback
  const isConditionByConnection = useStore(
    useCallback(
      (store: { edges: Array<{ source: string; sourceHandle?: string | null; targetHandle?: string | null }> }) =>
        store.edges.some(e =>
          e.source === id &&
          e.sourceHandle === 'bool_out' &&
          (e.targetHandle === 'condition' || e.targetHandle?.startsWith('condition_'))
        ),
      [id],
    ),
  )
  // Exec detection: node has exec edges (in or next connected)
  const hasExecConnection = useStore(
    useCallback(
      (store: { edges: Array<{ source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }> }) =>
        store.edges.some(e =>
          (e.target === id && (e.targetHandle === 'in' || !e.targetHandle)) ||
          (e.source === id && e.sourceHandle === 'next')
        ),
      [id],
    ),
  )
  const schema = getSchema(d.nodeType)
  const isEvent = d.isEventTrigger
  const isConditionNode = d.isCondition || isConditionByConnection
  const color = isEvent ? '#2980b9' : (categoryColors[schema.category] ?? '#7f8c8d')

  const actionNode: Record<string, any> = d.actionNode ?? {}
  const properties = Object.entries(actionNode).filter(([k]) => !TREE_KEYS.has(k)).sort(([a], [b]) => a.localeCompare(b))

  const hasBranches = schema.hasBranches
  const hasCondition = schema.hasCondition
  const hasMultiCondition = schema.hasMultiCondition

  const updateProperty = useCallback((key: string, value: unknown) => {
    onPropertyEdit(id, key, value)
  }, [id, onPropertyEdit])

  // Build left-side pins (inputs)
  // When in condition mode, exec pins are shown disabled instead of hidden.
  const leftPins: { id: string; label: string; color: string; type: 'target'; disabled?: boolean; disabledTip?: string }[] = []
  if (!isEvent) {
    leftPins.push(isConditionNode
      ? { id: 'in', label: '▶ Exec', color: '#555', type: 'target', disabled: true, disabledTip: '条件模式下不可用，断开 Result 连线后恢复' }
      : { id: 'in', label: '▶ Exec', color: '#ccc', type: 'target' })
  }
  if (hasCondition) {
    leftPins.push({ id: 'condition', label: '● 条件', color: '#f39c12', type: 'target' })
  }
  if (hasMultiCondition) {
    const conditions = Array.isArray(actionNode._conditionsNode) ? actionNode._conditionsNode as unknown[] : []
    const count = Math.max(conditions.length, 1)
    for (let i = 0; i < count; i++) {
      leftPins.push({ id: `condition_${i}`, label: `● 条件${i + 1}`, color: '#f39c12', type: 'target' })
    }
  }

  // Build right-side pins (outputs)
  // Dual-use types show bool_out alongside exec pins.
  // When in condition mode, exec pins shown disabled.
  const rightPins: { id: string; label: string; color: string; type: 'source'; disabled?: boolean; disabledTip?: string }[] = []
  if (isConditionNode) {
    rightPins.push({ id: 'next', label: 'Exec ▶', color: '#555', type: 'source', disabled: true, disabledTip: '条件模式下不可用' })
  } else {
    rightPins.push({ id: 'next', label: 'Exec ▶', color: '#ccc', type: 'source' })
  }
  if (hasBranches) {
    rightPins.push({ id: 'true', label: 'True ▶', color: '#2ecc71', type: 'source' })
    rightPins.push({ id: 'false', label: 'False ▶', color: '#e74c3c', type: 'source' })
  }
  if (isConditionNode || schema.usedAsCondition) {
    const execBlocks = !isConditionNode && hasExecConnection
    rightPins.push(execBlocks
      ? { id: 'bool_out', label: 'Result ▶', color: '#555', type: 'source', disabled: true, disabledTip: '执行模式下不可用，断开 Exec 连线后恢复' }
      : { id: 'bool_out', label: 'Result ▶', color: '#f39c12', type: 'source' })
  }

  const pinRowCount = Math.max(leftPins.length, rightPins.length)

  // Native mousedown listener to stop propagation for input elements,
  // preventing ReactFlow's D3 drag (which uses mousedown, not pointerdown)
  // from intercepting text selection. Must be a native listener because
  // React's synthetic events use delegation and fire too late.
  const nodeRootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = nodeRootRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target) return
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        e.stopPropagation()
        return
      }
      // Prevent D3 drag from intercepting clicks on Mantine combobox dropdown options.
      // Also preventDefault to keep input focused (mimics Mantine's own onMouseDown
      // which we blocked via stopPropagation before it reached React delegation).
      if (target.closest('[role="listbox"]')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const wheelHandler = (e: WheelEvent) => {
      // Prevent ReactFlow zoom when scrolling inside a combobox dropdown
      if ((e.target as HTMLElement)?.closest('[role="listbox"]')) {
        e.stopPropagation()
      }
    }
    el.addEventListener('mousedown', handler)
    el.addEventListener('wheel', wheelHandler, { passive: true })
    return () => {
      el.removeEventListener('mousedown', handler)
      el.removeEventListener('wheel', wheelHandler)
    }
  }, [])

  return (
    <div ref={nodeRootRef} style={{
      background: 'var(--mantine-color-dark-7, #1a1a2e)',
      borderRadius: 6,
      minWidth: 280,
      maxWidth: 420,
      border: `1px solid ${selected ? color : `${color}55`}`,
      outline: selected ? '2px solid rgba(255,255,255,0.6)' : 'none',
      outlineOffset: 1,
      overflow: 'visible',
      fontSize: 11,
      boxShadow: selected ? `0 0 16px ${color}66` : '0 2px 8px #00000044',
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
        <span title={isEvent ? (tlTip(d.eventType ?? d.label as string, eventLabels, labelMode) ?? (d.eventType ?? d.label as string)) : (tlTip(schema.shortName, nodeNames, labelMode) ?? schema.shortName)}>
          {isEvent ? tl(d.eventType ?? d.label as string, eventLabels, labelMode) : tl(schema.shortName, nodeNames, labelMode)}
        </span>
        <span style={{ fontSize: 9, opacity: 0.6 }} title={tlTip(schema.category, categoryLabels, labelMode)}>
          {tl(schema.category, categoryLabels, labelMode)}
        </span>
      </div>

      {/* Pin rows — each row has a left pin and a right pin, handles are inline */}
      {pinRowCount > 0 && (
        <div style={{
          borderBottom: (properties.length > 0 || hasMultiCondition) ? '1px solid #333' : undefined,
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
                <div style={{ position: 'relative', color: left?.color ?? 'transparent', opacity: left?.disabled ? 0.4 : 1 }}>
                  {left && (
                    <>
                      <span title={left.disabled ? left.disabledTip : undefined}>{left.label}</span>
                      <Handle
                        type={left.type}
                        position={Position.Left}
                        id={left.id}
                        isConnectable={!left.disabled}
                        style={{
                          background: left.color,
                          width: 10, height: 10,
                          borderRadius: left.id === 'in' ? 2 : '50%',
                          position: 'absolute',
                          left: -18,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          cursor: left.disabled ? 'not-allowed' : undefined,
                        }}
                      />
                    </>
                  )}
                </div>
                {/* Right pin */}
                <div style={{ position: 'relative', color: right?.color ?? 'transparent', opacity: right?.disabled ? 0.4 : 1 }}>
                  {right && (
                    <>
                      <span title={right.disabled ? right.disabledTip : undefined}>{right.label}</span>
                      <Handle
                        type={right.type}
                        position={Position.Right}
                        id={right.id}
                        isConnectable={!right.disabled}
                        style={{
                          background: right.color,
                          width: 10, height: 10,
                          borderRadius: right.id === 'bool_out' ? '50%' : 2,
                          position: 'absolute',
                          right: -18,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          cursor: right.disabled ? 'not-allowed' : undefined,
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

      {/* AND/OR toggle for multi-condition nodes */}
      {hasMultiCondition && (
        <div style={{ padding: '2px 10px', fontSize: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: '#f39c12' }}>
            {actionNode._isAnd !== false ? 'AND' : 'OR'}
          </span>
          {!isReadOnly && (
            <span
              role="button" tabIndex={0}
              style={{ cursor: 'pointer', color: '#888', fontSize: 8, textDecoration: 'underline' }}
              onClick={() => updateProperty('_isAnd', actionNode._isAnd === false)}
              onKeyDown={e => { if (e.key === 'Enter') updateProperty('_isAnd', actionNode._isAnd === false) }}
            >
              切换
            </span>
          )}
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
