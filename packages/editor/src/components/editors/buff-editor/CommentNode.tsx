import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'

export interface CommentNodeData {
  label: string
  color: string
}

const COLORS = [
  'rgba(255, 255, 255, 0.06)',
  'rgba(34, 139, 230, 0.10)',
  'rgba(81, 207, 102, 0.10)',
  'rgba(255, 212, 59, 0.10)',
  'rgba(255, 107, 107, 0.10)',
  'rgba(204, 93, 232, 0.10)',
]

export const CommentNode = memo(function CommentNode({ data, selected }: NodeProps) {
  const d = data as unknown as CommentNodeData
  const { label, color } = d
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(label)

  const handleDoubleClick = useCallback(() => {
    setEditing(true)
  }, [])

  const handleBlur = useCallback(() => {
    setEditing(false)
    d.label = text
  }, [d, text])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setText(label)
      setEditing(false)
    }
    // Stop propagation so canvas shortcuts don't fire
    e.stopPropagation()
  }, [label])

  // Native mousedown listener to prevent D3 drag from intercepting input text selection
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') e.stopPropagation()
    }
    el.addEventListener('mousedown', handler)
    return () => el.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={120}
        minHeight={60}
        lineStyle={{ borderColor: 'rgba(255,255,255,0.2)' }}
        handleStyle={{ width: 8, height: 8, background: 'rgba(255,255,255,0.4)', borderRadius: 2 }}
      />
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: color || COLORS[0],
          border: selected ? '1px solid rgba(255,255,255,0.3)' : '1px dashed rgba(255,255,255,0.15)',
          borderRadius: 6,
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
        }}
        onDoubleClick={handleDoubleClick}
      >
        {editing ? (
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            autoFocus
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255,255,255,0.7)',
              fontSize: 12,
              fontWeight: 600,
              padding: 0,
              width: '100%',
            }}
          />
        ) : (
          <span style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: 12,
            fontWeight: 600,
            userSelect: 'none',
          }}>
            {text || '双击编辑注释...'}
          </span>
        )}
      </div>
    </>
  )
})
