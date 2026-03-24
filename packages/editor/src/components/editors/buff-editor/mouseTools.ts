export type MouseTool = 'select' | 'pan' | 'knife' | 'comment'

export interface MouseToolConfig {
  id: MouseTool
  label: string
  shortcut: string
  icon: string
  cursor: string
}

export const MOUSE_TOOLS: MouseToolConfig[] = [
  { id: 'select',  label: '选择',   shortcut: 'V', icon: 'IconPointer',      cursor: 'default' },
  { id: 'pan',     label: '抓手',   shortcut: 'H', icon: 'IconHandStop',     cursor: 'grab' },
  { id: 'knife',   label: '切割',   shortcut: 'K', icon: 'IconCut',        cursor: 'crosshair' },
  { id: 'comment', label: '注释框', shortcut: 'C', icon: 'IconTextPlus',     cursor: 'crosshair' },
]

/** 2D line-segment intersection test */
export function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1x = bx - ax, d1y = by - ay
  const d2x = dx - cx, d2y = dy - cy
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-10) return false
  const ex = cx - ax, ey = cy - ay
  const t = (ex * d2y - ey * d2x) / cross
  const u = (ex * d1y - ey * d1x) / cross
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}
