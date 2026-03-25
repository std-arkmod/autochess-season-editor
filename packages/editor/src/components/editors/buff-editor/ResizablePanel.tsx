import { useState, useRef, useCallback, type ReactNode } from 'react'
import { ActionIcon, Tooltip } from '@mantine/core'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'

interface Props {
  side: 'left' | 'right'
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  children: ReactNode
}

const COLLAPSE_THRESHOLD = 50

export function ResizablePanel({ side, defaultWidth, minWidth = 150, maxWidth = 500, children }: Props) {
  const [width, setWidth] = useState(defaultWidth)
  const [collapsed, setCollapsed] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef(width)
  widthRef.current = width

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widthRef.current
    const panel = panelRef.current
    if (!panel) return

    // Capture panel position once — avoids layout queries during drag
    const panelRect = panel.getBoundingClientRect()
    const startBorderX = side === 'left' ? panelRect.right : panelRect.left

    // Create a preview line — positioned with transform (compositor-only, no layout)
    const line = document.createElement('div')
    line.style.cssText =
      `position:fixed;top:${panelRect.top}px;height:${panelRect.height}px;` +
      'width:2px;pointer-events:none;z-index:9999;' +
      'background:var(--mantine-color-teal-6);will-change:transform;left:0;' +
      `transform:translateX(${startBorderX}px)`
    document.body.appendChild(line)

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    let finalWidth = startW

    const onMove = (ev: MouseEvent) => {
      const delta = side === 'left'
        ? ev.clientX - startX
        : startX - ev.clientX
      const raw = startW + delta
      if (raw < COLLAPSE_THRESHOLD) {
        line.remove()
        cleanup()
        setCollapsed(true)
        return
      }
      finalWidth = Math.max(minWidth, Math.min(maxWidth, raw))
      // Move preview line — pure transform, zero layout cost
      const borderX = side === 'left'
        ? panelRect.left + finalWidth
        : panelRect.right - finalWidth
      line.style.transform = `translateX(${borderX}px)`
    }

    const cleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    const onUp = () => {
      line.remove()
      cleanup()
      // Single React re-render + layout on release
      widthRef.current = finalWidth
      setWidth(finalWidth)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [side, minWidth, maxWidth])

  if (collapsed) {
    return (
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24,
        ...(side === 'left'
          ? { borderRight: '1px solid var(--mantine-color-dark-4)' }
          : { borderLeft: '1px solid var(--mantine-color-dark-4)' }),
      }}>
        <Tooltip label="展开侧栏" position={side === 'left' ? 'right' : 'left'}>
          <ActionIcon size="xs" variant="subtle" onClick={() => setCollapsed(false)}>
            {side === 'left' ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
          </ActionIcon>
        </Tooltip>
      </div>
    )
  }

  return (
    <div ref={panelRef} style={{
      width, flexShrink: 0, position: 'relative',
      display: 'flex', flexDirection: 'column',
      ...(side === 'left'
        ? { borderRight: '1px solid var(--mantine-color-dark-4)' }
        : { borderLeft: '1px solid var(--mantine-color-dark-4)' }),
    }}>
      {/* Content */}
      <div style={{
        flex: 1, overflow: 'hidden', minHeight: 0,
        padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {children}
      </div>
      {/* Resize handle — drag to resize, double-click to collapse */}
      <div
        ref={handleRef}
        onMouseDown={onHandleMouseDown}
        onDoubleClick={() => setCollapsed(true)}
        style={{
          position: 'absolute', top: 0, bottom: 0,
          ...(side === 'left' ? { right: 0 } : { left: 0 }),
          width: 4,
          cursor: 'col-resize', zIndex: 10,
        }}
        onMouseOver={(e) => e.currentTarget.style.background = 'var(--mantine-color-dark-3)'}
        onMouseOut={(e) => e.currentTarget.style.background = ''}
      />
    </div>
  )
}
