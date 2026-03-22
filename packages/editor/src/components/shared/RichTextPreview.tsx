import { Text, Tooltip } from '@mantine/core'
import { stripRichText } from '@autochess-editor/shared'

interface RichTextProps {
  text: string
  maxLen?: number
}

/** 富文本预览：显示纯文本，tooltip 显示原始 */
export function RichTextPreview({ text, maxLen = 80 }: RichTextProps) {
  const plain = stripRichText(text)
  const truncated = plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain
  return (
    <Tooltip label={plain} multiline maw={400} disabled={plain.length <= maxLen}>
      <Text size="sm" c="dimmed" style={{ cursor: plain.length > maxLen ? 'help' : 'default' }}>
        {truncated}
      </Text>
    </Tooltip>
  )
}
