import { validate as isUuid } from 'uuid'

export const DEFAULT_WORKSPACE_DIR = 'workspaces'
export const DEFAULT_WORKSPACE_NAME = 'tmp'

export function getDefaultWorkspacePath(chatUuid?: string): string {
  return `./${DEFAULT_WORKSPACE_DIR}/${chatUuid || DEFAULT_WORKSPACE_NAME}`
}

export function normalizeWorkspaceGroupPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
}

export function isDefaultWorkspacePath(path?: string, chatUuid?: string): boolean {
  if (!path) return false
  const normalized = normalizeWorkspaceGroupPath(path)
  const directoryName = normalized.split('/').pop() || ''
  const defaultNames = chatUuid ? [chatUuid, DEFAULT_WORKSPACE_NAME] : [DEFAULT_WORKSPACE_NAME]
  if (isUuid(directoryName)) defaultNames.push(directoryName)
  return defaultNames.some(name => {
    const suffix = `${DEFAULT_WORKSPACE_DIR}/${name}`
    return normalized === suffix || normalized.endsWith(`/${suffix}`)
  })
}
