// 基础适配器抽象类
export abstract class BaseAdapter {
  abstract providerType: ProviderType
  abstract apiVersion: string

  buildHeaders(req: IUnifiedRequest): any {
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    }
    if (req.providerType === 'openai') {
      headers['authorization'] = `Bearer ${req.apiKey}`
    } else if (req.providerType === 'claude') {
      headers['x-api-key'] = req.apiKey
    } else if (req.providerType === 'azure-openai') {
      headers['api-key'] = req.apiKey
    } else {
      headers['authorization'] = `Bearer ${req.apiKey}`
    }
    return headers
  }

  // 转换请求格式
  abstract transformRequest(req: IUnifiedRequest): any

  // 获取端点URL
  abstract getEndpoint(baseUrl: string): string

  // 转换普通响应
  abstract transformNotStreamResponse(response: any): IUnifiedResponse

  // 转换stream响应
  abstract transformStreamResponse(streamReader: ReadableStreamDefaultReader<string>): AsyncGenerator<IUnifiedResponse, void, unknown>

  // 解析流式响应的单个块
  abstract parseStreamChunk(chunk: string): IUnifiedStreamResponse | null

  // 可选：自定义 headers
  getHeaders?(req: IUnifiedRequest): Record<string, string>

  // 工具调用转换的通用方法
  protected transformTools(tools: any[]): any[] {
    if (!tools?.length) return []

    return tools.map(tool => {
      // 如果已经是标准的 OpenAI tools 格式（包含 type 和 function）
      if (tool.type === 'function' && tool.function) {
        return {
          type: 'function',
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters || tool.function.inputSchema
          }
        }
      }

      // 如果是扁平化的 MCP 格式
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || tool.parameters
        }
      }
    })
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
      index: tc.index,
      type: 'function' as const,
      function: {
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || ''
      }
    }))
  }
}