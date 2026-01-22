/**
 * Embedded Tools Registry
 * 用于注册和管理内置的 LLM 工具
 */

export interface ToolDefinition {
  type: string
  function: {
    name: string
    description: string
    parameters: any
  }
}

export interface EmbeddedToolHandler {
  name: string
  handler: (args: any) => Promise<any>
  definition?: ToolDefinition
}

class EmbeddedToolsRegistry {
  private tools: Map<string, EmbeddedToolHandler> = new Map()
  private externalTools: Map<string, ToolDefinition> = new Map()

  /**
   * 注册一个内置工具（embedded tool）
   */
  register(toolName: string, handler: (args: any) => Promise<any>, definition?: ToolDefinition): void {
    this.tools.set(toolName, {
      name: toolName,
      handler,
      definition
    })
    // console.log(`[EmbeddedToolsRegistry] Registered tool: ${toolName}`)
  }

  /**
   * 注册一个外部工具（external tool，如 MCP tools）
   * 外部工具没有 handler，只有定义
   */
  registerExternal(toolName: string, definition: ToolDefinition): void {
    this.externalTools.set(toolName, definition)
    console.log(`[EmbeddedToolsRegistry] Registered external tool: ${toolName}`)
  }

  /**
   * 取消注册外部工具
   */
  unregisterExternal(toolName: string): boolean {
    const result = this.externalTools.delete(toolName)
    if (result) {
      console.log(`[EmbeddedToolsRegistry] Unregistered external tool: ${toolName}`)
    }
    return result
  }

  /**
   * 清空所有外部工具
   */
  clearExternalTools(): void {
    this.externalTools.clear()
    console.log(`[EmbeddedToolsRegistry] Cleared all external tools`)
  }

  /**
   * 检查工具是否已注册
   */
  isRegistered(toolName: string): boolean {
    return this.tools.has(toolName)
  }

  /**
   * 获取工具处理器
   */
  getHandler(toolName: string): ((args: any) => Promise<any>) | undefined {
    const tool = this.tools.get(toolName)
    return tool?.handler
  }

  /**
   * 根据工具名称获取工具定义
   */
  getTool(toolName: string): ToolDefinition | undefined {
    const tool = this.tools.get(toolName)
    return tool?.definition
  }

  /**
   * 批量获取工具定义
   * 用于 search_tools 功能
   * 同时搜索 embedded tools 和 external tools
   */
  getTools(toolNames: string[]): ToolDefinition[] {
    const definitions: ToolDefinition[] = []
    toolNames.forEach(toolName => {
      // 先从 embedded tools 中查找
      const embeddedTool = this.tools.get(toolName)
      if (embeddedTool?.definition) {
        definitions.push(embeddedTool.definition)
        return
      }

      // 再从 external tools 中查找
      const externalTool = this.externalTools.get(toolName)
      if (externalTool) {
        definitions.push(externalTool)
      }
    })
    return definitions
  }

  /**
   * 获取所有工具定义
   */
  getAllTools(): ToolDefinition[] {
    const definitions: ToolDefinition[] = []
    this.tools.forEach(tool => {
      if (tool.definition) {
        definitions.push(tool.definition)
      }
    })
    return definitions
  }

  /**
   * 获取所有工具定义（embedded + external）
   */
  getAllToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = []
    this.tools.forEach(tool => {
      if (tool.definition) {
        definitions.push(tool.definition)
      }
    })
    this.externalTools.forEach(tool => {
      definitions.push(tool)
    })
    return definitions
  }

  /**
   * 执行工具
   */
  async execute(toolName: string, args: any): Promise<any> {
    const handler = this.getHandler(toolName)
    if (!handler) {
      throw new Error(`Tool "${toolName}" is not registered`)
    }
    return await handler(args)
  }

  /**
   * 获取所有已注册的工具名称
   */
  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 取消注册工具
   */
  unregister(toolName: string): boolean {
    const result = this.tools.delete(toolName)
    if (result) {
      console.log(`[EmbeddedToolsRegistry] Unregistered tool: ${toolName}`)
    }
    return result
  }

  /**
   * 搜索工具（search_tools 的实现）
   * 根据工具名称批量获取完整的工具定义
   */
  async searchTools(args: { tool_names: string[] }): Promise<{
    success: boolean
    tools?: ToolDefinition[]
    error?: string
  }> {
    const { tool_names } = args
    console.log(`[ToolSearch] Searching for tools:`, tool_names)

    if (!tool_names || tool_names.length === 0) {
      return {
        success: false,
        error: 'tool_names cannot be empty'
      }
    }

    // 使用 getTools 方法批量获取工具定义
    const foundTools = this.getTools(tool_names)

    console.log(`[ToolSearch] Found ${foundTools.length}/${tool_names.length} tools`)

    return {
      success: true,
      tools: foundTools
    }
  }

  /**
   * 列出所有可用的外部工具（available_tools 的实现）
   * 只返回外部工具的简化列表（仅包含 name 和 description）
   * 内置工具（embedded tools）会直接发送完整定义，不需要通过此方法
   */
  availableTools(): Array<{ name: string; description: string }> {
    console.log(`[AvailableTools] Listing all available external tools`)

    const toolList = Array.from(this.externalTools.values())
      .map(tool => ({
        name: tool.function.name,
        description: tool.function.description
      }))

    console.log(`[AvailableTools] Found ${toolList.length} external tools`)

    return toolList
  }
}

// 导出单例
export const embeddedToolsRegistry = new EmbeddedToolsRegistry()
