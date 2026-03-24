import { useState, useCallback, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'

interface Props {
  onCreateComment: (position: { x: number; y: number }, size: { width: number; height: number }) => void
}

interface Point { x: number; y: number }

export function CommentToolOverlay({ onCreateComment }: Props) {
  const { screenToFlowPosition } = useReactFlow()
  const [startPt, setStartPt] = useState<Point | null>(null)
  const [currentPt, setCurrentPt] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect = containerRef.current!.getBoundingClientRect()
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    setStartPt(pt)
    setCurrentPt(pt)
    setDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    setCurrentPt({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [dragging])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragging || !startPt || !currentPt) return
    e.preventDefault()
    setDragging(false)

    const rect = containerRef.current!.getBoundingClientRect()

    // Convert both corners to flow coordinates
    const flowStart = screenToFlowPosition({ x: startPt.x + rect.left, y: startPt.y + rect.top })
    const flowEnd = screenToFlowPosition({ x: currentPt.x + rect.left, y: currentPt.y + rect.top })

    const x = Math.min(flowStart.x, flowEnd.x)
    const y = Math.min(flowStart.y, flowEnd.y)
    const width = Math.abs(flowEnd.x - flowStart.x)
    const height = Math.abs(flowEnd.y - flowStart.y)

    // Only create if the rect is large enough (min 40x30 in flow coords)
    if (width > 40 && height > 30) {
      onCreateComment({ x, y }, { width, height })
    }

    setStartPt(null)
    setCurrentPt(null)
  }, [dragging, startPt, currentPt, screenToFlowPosition, onCreateComment])

  // Compute selection rect in screen-relative coords
  const rectStyle = startPt && currentPt && dragging ? {
    left: Math.min(startPt.x, currentPt.x),
    top: Math.min(startPt.y, currentPt.y),
    width: Math.abs(currentPt.x - startPt.x),
    height: Math.abs(currentPt.y - startPt.y),
  } : null

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        position: 'absolute', inset: 0, zIndex: 5,
        cursor: 'crosshair',
      }}
    >
      {dragging && rectStyle && (
        <div style={{
          position: 'absolute',
          ...rectStyle,
          border: '2px dashed rgba(255,255,255,0.4)',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  )
}
