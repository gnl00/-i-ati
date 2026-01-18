/**
 * Embedded Tools Entry Point
 * 统一导出所有 embedded tools 的定义和处理器
 */

import { tools as toolsDefinitions } from '@tools/definitions'
import {
  invokeCreateDirectory,
  invokeDirectoryTree,
  invokeEditFile,
  invokeGetFileInfo,
  invokeListAllowedDirectories,
  invokeListDirectory,
  invokeListDirectoryWithSizes,
  invokeMoveFile,
  invokeReadMediaFile,
  invokeReadMultipleFiles,
  invokeReadTextFile,
  invokeSearchFile,
  invokeSearchFiles,
  invokeWriteFile
} from '@renderer-tools/fileOperations/renderer/FileOperationsInvoker'
import { embeddedToolsRegistry, type ToolDefinition } from '@tools/registry'
import { invokeWebFetch, invokeWebSearch } from '@renderer-tools/webTools/renderer/WebToolsInvoker'
import { invokeMemoryRetrieval, invokeMemorySave } from '@renderer-tools/memory/renderer/MemoryToolsInvoker'
import { invokeExecuteCommand } from '@renderer-tools/command/renderer/CommandInvoker'

/**
 * 工具处理器映射表
 * 将工具名称映射到对应的处理器函数
 * 注意：available_tools 不再作为工具注册，而是通过 system 消息发送
 */
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  // Tool discovery
  'list_tools': async () => embeddedToolsRegistry.availableTools(),

  // Tool search - 使用 registry 的 searchTools 方法
  'search_tools': (args) => embeddedToolsRegistry.searchTools(args),

  // Web search
  'web_search': invokeWebSearch,
  'web_fetch': invokeWebFetch,

  // File read operations
  'read_text_file': invokeReadTextFile,
  'read_media_file': invokeReadMediaFile,
  'read_multiple_files': invokeReadMultipleFiles,

  // File write operations
  'write_file': invokeWriteFile,
  'edit_file': invokeEditFile,

  // File search operations
  'search_file': invokeSearchFile,
  'search_files': invokeSearchFiles,

  // Directory operations
  'list_directory': invokeListDirectory,
  'list_directory_with_sizes': invokeListDirectoryWithSizes,
  'directory_tree': invokeDirectoryTree,

  // File info operations
  'get_file_info': invokeGetFileInfo,
  'list_allowed_directories': invokeListAllowedDirectories,

  // File management operations
  'create_directory': invokeCreateDirectory,
  'move_file': invokeMoveFile,

  // Memory operations
  'memory_retrieval': invokeMemoryRetrieval,
  'memory_save': invokeMemorySave,

  // Command operations
  'execute_command': invokeExecuteCommand
}

/**
 * 初始化所有 embedded tools
 * 在应用启动时调用此函数来注册所有工具
 * @param config 可选的配置对象，用于条件性地注册工具
 */
export function initializeEmbeddedTools(config?: IAppConfig): void {
  // console.log('[EmbeddedTools] Initializing embedded tools...')

  // 检查是否启用 memory 工具
  const memoryEnabled = config?.tools?.memoryEnabled ?? true

  // 遍历 tools.json 中的所有工具定义
  const tools = toolsDefinitions as ToolDefinition[]

  tools.forEach(toolDef => {
    const toolName = toolDef.function.name

    // 如果是 memory 工具且未启用，则跳过注册
    if ((toolName === 'memory_retrieval' || toolName === 'memory_save') && !memoryEnabled) {
      console.log(`[EmbeddedTools] Skipping tool "${toolName}" (memory disabled)`)
      return
    }

    const handler = toolHandlers[toolName]

    if (handler) {
      // 注册工具，同时保存工具定义
      embeddedToolsRegistry.register(toolName, handler, toolDef)
    } else {
      console.warn(`[EmbeddedTools] Warning: No handler found for tool "${toolName}"`)
    }
  })

  console.log('[EmbeddedTools] All embedded tools registered:', embeddedToolsRegistry.getRegisteredTools())
}

// 导出注册中心和工具定义
export { embeddedToolsRegistry } from '@tools/registry'
export { toolsDefinitions as embeddedToolsDefinitions }
