import { ipcMain, app } from 'electron'
import { mkdir, stat } from 'fs/promises'
import { isAbsolute, join, resolve } from 'path'
import { createLogger } from '@main/logging/LogService'
import { WORKSPACE_ENSURE_DIRECTORY } from '@shared/constants'

const logger = createLogger('WorkspaceIPC')
const DEFAULT_WORKSPACE_NAME = 'tmp'

export interface EnsureWorkspaceDirectoryArgs {
  chat_uuid?: string
  workspace_path?: string
}

export interface EnsureWorkspaceDirectoryResponse {
  success: boolean
  path?: string
  created?: boolean
  error?: string
}

function normalizeWorkspacePath(workspacePath?: string, chatUuid?: string): string {
  const userDataPath = app.getPath('userData')
  const fallbackDir = join(userDataPath, 'workspaces', chatUuid || DEFAULT_WORKSPACE_NAME)

  if (!workspacePath) {
    return fallbackDir
  }

  if (isAbsolute(workspacePath)) {
    return resolve(workspacePath)
  }

  const normalized = workspacePath.replace(/\\/g, '/')
  const clean = normalized.startsWith('./') ? normalized.slice(2) : normalized

  if (clean.startsWith('workspaces/')) {
    return resolve(join(userDataPath, clean))
  }

  logger.warn('workspace.relative_path_rebased', { workspacePath })
  return resolve(join(userDataPath, clean))
}

export async function ensureWorkspaceDirectory(
  args: EnsureWorkspaceDirectoryArgs
): Promise<EnsureWorkspaceDirectoryResponse> {
  try {
    const workspacePath = normalizeWorkspacePath(args.workspace_path, args.chat_uuid)
    logger.info('workspace.ensure_directory.start', {
      chatUuid: args.chat_uuid,
      workspacePath
    })

    try {
      const existingStats = await stat(workspacePath)
      if (!existingStats.isDirectory()) {
        return {
          success: false,
          path: workspacePath,
          created: false,
          error: `Workspace path exists and is not a directory: ${workspacePath}`
        }
      }

      return {
        success: true,
        path: workspacePath,
        created: false
      }
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }

    await mkdir(workspacePath, { recursive: true })

    return {
      success: true,
      path: workspacePath,
      created: true
    }
  } catch (error: any) {
    logger.error('workspace.ensure_directory.failed', error)
    return {
      success: false,
      error: error.message || 'Failed to ensure workspace directory'
    }
  }
}

export function registerWorkspaceHandlers(): void {
  ipcMain.handle(WORKSPACE_ENSURE_DIRECTORY, (_event, args: EnsureWorkspaceDirectoryArgs) => {
    return ensureWorkspaceDirectory(args)
  })
}
