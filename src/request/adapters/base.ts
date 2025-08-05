// 基础适配器抽象类
export abstract class BaseAdapter {
  abstract providerType: ProviderType
  abstract apiVersion: string
  
  // 转换请求格式
  abstract transformRequest(req: IUnifiedChatRequest): any
  
  // 获取端点URL
  abstract getEndpoint(baseUrl: string): string
  
  // 转换普通响应
  abstract transformResponse(response: any): IUnifiedResponse
  
  // 解析流式响应的单个块
  abstract parseStreamChunk(chunk: string): IUnifiedStreamResponse | null
  
  // 可选：自定义 headers
  getHeaders?(req: IUnifiedChatRequest): Record<string, string>
  
  // 工具调用转换的通用方法
  protected transformTools(tools: any[]): any[] {
    if (!tools?.length) return []
    
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }))
  }
  
  // 通用的结束原因映射
  protected mapFinishReason(reason: string): IUnifiedResponse['finishReason'] {
    switch (reason?.toLowerCase()) {
      case 'stop':
      case 'stop_sequence':
      case 'end_turn':
      case 'complete':
        return 'stop'
      case 'length':
      case 'max_tokens':
      case 'length_limit':
        return 'length'
      case 'tool_calls':
      case 'tool_use':
        return 'tool_calls'
      case 'content_filter':
        return 'content_filter'
      default:
        return 'stop'
    }
  }
  
  // 通用的工具调用转换
  protected transformToolCalls(toolCalls: any[]): IToolCall[] | undefined {
    if (!toolCalls?.length) return undefined
    
    return toolCalls.map(tc => ({
      id: tc.id || `tool_${Date.now()}`,
      type: 'function' as const,
      function: {
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || ''
      }
    }))
  }
}