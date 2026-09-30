import { isDefaultWorkspacePath, normalizeWorkspaceGroupPath } from '@shared/workspace/workspacePaths'

export function projectChatWorkspaceGroups(results: ChatSearchResult[]): {
  key: string
  label: string
  path?: string
  items: ChatSearchResult[]
}[] {
  const groups = new Map<string, { key: string; label: string; path?: string; items: ChatSearchResult[] }>()
  for (const result of [...results].sort((a, b) => b.chat.updateTime - a.chat.updateTime)) {
    const chat = result.chat
    if (chat.id === -1 || chat.isScheduled) continue
    const path = chat.workspacePath && !isDefaultWorkspacePath(chat.workspacePath, chat.uuid)
      ? normalizeWorkspaceGroupPath(chat.workspacePath) : undefined
    const key = path ? `workspace:${path}` : 'recently'
    if (!groups.has(key)) groups.set(key, { key, label: path?.split('/').pop() || 'Recently', path, items: [] })
    groups.get(key)!.items.push(result)
  }
  const list = [...groups.values()]
  const labels = new Map<string, number>()
  for (const group of list) labels.set(group.label, (labels.get(group.label) || 0) + 1)
  for (const group of list) {
    if (group.path && labels.get(group.label)! > 1) {
      group.label = group.path.split('/').filter(Boolean).slice(-2).join('/') || group.path
    }
  }
  const duplicates = new Set(list.filter(group => list.some(other => other.key !== group.key && other.label === group.label)).map(group => group.label))
  for (const group of list) {
    if (group.path && duplicates.has(group.label)) group.label = group.path
  }
  return list.sort((a, b) => a.key === 'recently' ? -1 : b.key === 'recently' ? 1 : b.items[0].chat.updateTime - a.items[0].chat.updateTime)
}
