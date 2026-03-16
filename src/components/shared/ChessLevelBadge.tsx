import { Badge } from '@mantine/core'
import { chessLevelColor, chessLevelLabel } from '../../store/utils'

export function ChessLevelBadge({ level }: { level: number }) {
  const color = chessLevelColor[level] ?? '#aaa'
  const label = chessLevelLabel[level] ?? `${level}阶`
  return (
    <Badge size="xs" style={{ backgroundColor: color + '33', color, borderColor: color + '66' }} variant="outline">
      {label}
    </Badge>
  )
}
