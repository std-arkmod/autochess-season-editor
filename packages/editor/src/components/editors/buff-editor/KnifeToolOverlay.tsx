import { useState, useCallback, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { segmentsIntersect } from './mouseTools'

interface Props {
  onCutEdges: (edgeIds: string[]) => void
}

interface Point { x: number; y: number }

export function KnifeToolOverlay({ onCutEdges }: Props) {
  const { screenToFlowPosition, getEdges, getInternalNode } = useReactFlow()
  // Screen-relative points for rendering
  const [screenPts, setScreenPts] = useState<Point[]>([])
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const rect = containerRef.current!.getBoundingClientRect()
    setScreenPts([{ x: e.clientX - rect.left, y: e.clientY - rect.top }])
    setDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    setScreenPts(prev => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top }])
  }, [dragging])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    e.preventDefault()
    setDragging(false)

    if (screenPts.length < 2) { setScreenPts([]); return }

    // Convert screen points to flow coordinates for intersection
    const rect = containerRef.current!.getBoundingClientRect()
    const flowPts = screenPts.map(p =>
      screenToFlowPosition({ x: p.x + rect.left, y: p.y + rect.top })
    )

    // Test knife stroke against each edge
    const edges = getEdges()
    const cutIds: string[] = []

    for (const edge of edges) {
      const src = getInternalNode(edge.source)
      const tgt = getInternalNode(edge.target)
      if (!src || !tgt) continue

      const sw = (src as any).measured?.width ?? 180
      const sh = (src as any).measured?.height ?? 50
      const tw = (tgt as any).measured?.width ?? 180
      const th = (tgt as any).measured?.height ?? 50
      const srcPos = (src as any).internals?.positionAbsolute ?? src.position
      const tgtPos = (tgt as any).internals?.positionAbsolute ?? tgt.position

      // Edge endpoints: source right-center → target left-center
      const ep1: Point = { x: srcPos.x + sw, y: srcPos.y + sh / 2 }
      const ep2: Point = { x: tgtPos.x, y: tgtPos.y + th / 2 }

      let hit = false
      for (let ki = 0; ki < flowPts.length - 1 && !hit; ki++) {
        if (segmentsIntersect(
          flowPts[ki].x, flowPts[ki].y, flowPts[ki + 1].x, flowPts[ki + 1].y,
          ep1.x, ep1.y, ep2.x, ep2.y,
        )) {
          hit = true
        }
      }

      if (hit) cutIds.push(edge.id)
    }

    setScreenPts([])
    if (cutIds.length > 0) onCutEdges(cutIds)
  }, [dragging, screenPts, screenToFlowPosition, getEdges, getInternalNode, onCutEdges])

  const polyline = screenPts.length >= 2
    ? screenPts.map(p => `${p.x},${p.y}`).join(' ')
    : ''

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
      {dragging && polyline && (
        <svg
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          <polyline
            points={polyline}
            fill="none"
            stroke="#ff4444"
            strokeWidth={2}
            strokeDasharray="6 3"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  )
}
