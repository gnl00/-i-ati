/**
 * Embedded Tools Entry Point
 * 统一导出所有 embedded tools 的定义和处理器
 */

import { embeddedToolsRegistry, type ToolDefinition } from './registry'
import { webSearchHandler } from './renderer/webSearchRendererBridge'
import toolsDefinitions from './tools.json'

/**
 * 工具处理器映射表
 * 将工具名称映射到对应的处理器函数
 */
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  'web_search': webSearchHandler,
  // 在这里添加更多工具处理器
  // 'another_tool': anotherToolHandler,
}

/**
 * 初始化所有 embedded tools
 * 在应用启动时调用此函数来注册所有工具
 */
export function initializeEmbeddedTools(): void {
  console.log('[EmbeddedTools] Initializing embedded tools...')

  // 遍历 tools.json 中的所有工具定义
  const tools = toolsDefinitions as ToolDefinition[]

  tools.forEach(toolDef => {
    const toolName = toolDef.function.name
    const handler = toolHandlers[toolName]

    if (handler) {
      // 注册工具，同时保存工具定义
      embeddedToolsRegistry.register(toolName, handler, toolDef)
      console.log(`[EmbeddedTools] Registered: ${toolName}`)
    } else {
      console.warn(`[EmbeddedTools] Warning: No handler found for tool "${toolName}"`)
    }
  })

  console.log('[EmbeddedTools] All embedded tools registered:', embeddedToolsRegistry.getRegisteredTools())
}

// 导出注册中心和工具定义
export { embeddedToolsRegistry } from './registry'
export { webSearchHandler } from './renderer/webSearchRendererBridge'
export { toolsDefinitions as embeddedToolsDefinitions }
