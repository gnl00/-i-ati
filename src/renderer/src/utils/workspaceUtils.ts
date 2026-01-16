/**
 * Workspace Management Utilities
 * 管理基于 chatUUID 的工作空间目录
 */

import { invokeCreateDirectory } from '@renderer/invoker/ipcInvoker'

/**
 * 工作空间配置
 */
const WORKSPACE_CONFIG = {
  baseDir: './workspaces',  // 相对路径
  defaultWorkspace: 'tmp'
}

/**
 * 获取工作空间路径
 * @param chatUuid 聊天的 UUID，如果为空则返回默认工作空间
 * @param customPath 自定义工作空间路径（绝对路径），优先级最高
 * @returns 工作空间的路径
 */
export function getWorkspacePath(chatUuid?: string, customPath?: string): string {
  // 优先使用自定义路径
  if (customPath) {
    console.log(`[Workspace] Using custom workspace path: ${customPath}`)
    return customPath
  }

  // 否则使用默认的基于 UUID 的路径
  const workspaceName = chatUuid || WORKSPACE_CONFIG.defaultWorkspace
  const workspacePath = `${WORKSPACE_CONFIG.baseDir}/${workspaceName}`
  console.log(`[Workspace] Using default workspace path: ${workspacePath} (chatUuid: ${chatUuid || 'default'})`)
  return workspacePath
}

/**
 * 创建工作空间目录
 * @param chatUuid 聊天的 UUID，如果为空则创建默认工作空间
 * @param customPath 自定义工作空间路径（绝对路径）
 * @returns 创建结果，包含成功状态和路径
 */
export async function createWorkspace(chatUuid?: string, customPath?: string): Promise<{
  success: boolean
  path: string
  error?: string
}> {
  const workspacePath = getWorkspacePath(chatUuid, customPath)

  try {
    console.log(`[Workspace] Creating workspace: ${workspacePath}`)

    const result = await invokeCreateDirectory({
      directory_path: workspacePath,
      recursive: true
    })

    if (result.success) {
      console.log(`[Workspace] Workspace created successfully: ${workspacePath}`)
      return {
        success: true,
        path: workspacePath
      }
    } else {
      console.error(`[Workspace] Failed to create workspace: ${result.error}`)
      return {
        success: false,
        path: workspacePath,
        error: result.error
      }
    }
  } catch (error: any) {
    console.error(`[Workspace] Error creating workspace:`, error)
    return {
      success: false,
      path: workspacePath,
      error: error.message || 'Unknown error'
    }
  }
}

/**
 * 切换到指定的工作空间
 * 如果工作空间不存在，则自动创建
 * @param chatUuid 聊天的 UUID
 * @param customPath 自定义工作空间路径（绝对路径）
 * @returns 切换结果，包含成功状态和路径
 */
export async function switchWorkspace(chatUuid?: string, customPath?: string): Promise<{
  success: boolean
  path: string
  created: boolean
  error?: string
}> {
  const workspacePath = getWorkspacePath(chatUuid, customPath)
  console.log(`[Workspace] Attempting to switch to workspace: ${workspacePath}`)

  try {
    console.log(`[Workspace] Switching to workspace: ${workspacePath}`)

    // 尝试创建工作空间（如果已存在，create_directory 应该返回成功或提示已存在）
    const createResult = await createWorkspace(chatUuid, customPath)

    if (createResult.success) {
      console.log(`[Workspace] Switched to workspace: ${workspacePath}`)
      return {
        success: true,
        path: workspacePath,
        created: true
      }
    } else {
      // 如果创建失败但是因为目录已存在，仍然认为切换成功
      if (createResult.error?.includes('exists') || createResult.error?.includes('已存在')) {
        console.log(`[Workspace] Workspace already exists, using: ${workspacePath}`)
        return {
          success: true,
          path: workspacePath,
          created: false
        }
      }

      return {
        success: false,
        path: workspacePath,
        created: false,
        error: createResult.error
      }
    }
  } catch (error: any) {
    console.error(`[Workspace] Error switching workspace:`, error)
    return {
      success: false,
      path: workspacePath,
      created: false,
      error: error.message || 'Unknown error'
    }
  }
}

/**
 * 获取当前工作空间的基础目录
 */
export function getWorkspaceBaseDir(): string {
  return WORKSPACE_CONFIG.baseDir
}

/**
 * 获取默认工作空间名称
 */
export function getDefaultWorkspaceName(): string {
  return WORKSPACE_CONFIG.defaultWorkspace
}
