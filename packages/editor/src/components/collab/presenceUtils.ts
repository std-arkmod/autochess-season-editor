export const PRESENCE_COLORS = ['teal', 'blue', 'violet', 'orange', 'pink', 'cyan', 'grape', 'lime']

export function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length]
}
