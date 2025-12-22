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

  /**
   * 注册一个工具
   */
  register(toolName: string, handler: (args: any) => Promise<any>, definition?: ToolDefinition): void {
    this.tools.set(toolName, {
      name: toolName,
      handler,
      definition
    })
    console.log(`[EmbeddedToolsRegistry] Registered tool: ${toolName}`)
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
}

// 导出单例
export const embeddedToolsRegistry = new EmbeddedToolsRegistry()
