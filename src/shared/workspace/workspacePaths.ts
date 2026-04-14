export const DEFAULT_WORKSPACE_DIR = 'workspaces'
export const DEFAULT_WORKSPACE_NAME = 'tmp'

export function getDefaultWorkspacePath(chatUuid?: string): string {
  return `${DEFAULT_WORKSPACE_DIR}/${chatUuid || DEFAULT_WORKSPACE_NAME}`
}
