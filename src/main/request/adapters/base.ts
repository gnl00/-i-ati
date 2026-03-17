import type { RequestAdapterStreamProtocol } from '@shared/plugins/requestAdapterHooks'

const extractSseDataChunks = (buffer: string): { chunks: string[]; remaining: string } => {
  const events = buffer.split(/\r?\n\r?\n/)
  const remaining = events.pop() ?? ''
  const chunks: string[] = []

  for (const eventText of events) {
    const dataLines = eventText
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())

    if (dataLines.length === 0) continue
    chunks.push(`data: ${dataLines.join('\n')}`)
  }

  return { chunks, remaining }
}

// 基础适配器抽象类
export abstract class BaseAdapter {
  abstract providerType: ProviderType
  protected streamProtocol: RequestAdapterStreamProtocol = 'sse'

  abstract buildHeaders(req: IUnifiedRequest): Record<string, string>

  // 构造请求体
  abstract buildRequest(req: IUnifiedRequest): any

  // 获取端点URL
  abstract getEndpoint(baseUrl: string, req?: IUnifiedRequest): string

  // 解析非流式响应
  abstract parseResponse(response: any): IUnifiedResponse

  // 转换stream响应
  async *transformStreamResponse(streamReader: ReadableStreamDefaultReader<string>): AsyncGenerator<IUnifiedResponse, void, unknown> {
    if (!streamReader || typeof streamReader.read !== 'function') {
      console.error('Invalid streamReader provided:', streamReader)
      return
    }

    this.onStreamStart()

    if (this.streamProtocol === 'raw') {
      while (true) {
        const { done, value } = await streamReader.read()
        if (done) {
          break
        }

        const parsed = this.parseStreamResponse(value)
        if (!parsed) {
          continue
        }

        yield this.toUnifiedStreamMessage(parsed)
      }

      return
    }

    let sseBuffer = ''
    while (true) {
      const { done, value } = await streamReader.read()
      if (done) {
        break
      }

      sseBuffer += value
      const { chunks, remaining } = extractSseDataChunks(sseBuffer)
      sseBuffer = remaining

      for (const chunk of chunks) {
        // console.log(`[Stream] chunk: ${chunk}`)
        const parsed = this.parseStreamResponse(chunk)
        if (!parsed) {
          continue
        }

        yield this.toUnifiedStreamMessage(parsed)
      }
    }

    if (sseBuffer.trim() !== '') {
      const { chunks } = extractSseDataChunks(`${sseBuffer}\n\n`)
      for (const chunk of chunks) {
        const parsed = this.parseStreamResponse(chunk)
        if (!parsed) {
          continue
        }

        yield this.toUnifiedStreamMessage(parsed)
      }
    }
  }

  // 解析流式响应的单个块
  abstract parseStreamResponse(chunk: string): IUnifiedStreamResponse | null

  // 是否支持 OpenAI 风格 stream_options.include_usage
  abstract supportsStreamOptionsUsage(): boolean

  // 可选：usage 解析（由子类实现）
  protected extractUsage(_raw: any): ITokenUsage | undefined {
    return undefined
  }

  protected onStreamStart(): void {}

  // 工具调用转换的通用方法
  protected transformToolDefinitions(tools: any[]): any[] {
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

  private toUnifiedStreamMessage(response: IUnifiedStreamResponse): IUnifiedResponse {
    return {
      id: response.id,
      model: response.model,
      timestamp: Date.now(),
      content: response.delta?.content || '',
      reasoning: response.delta?.reasoning,
      toolCalls: response.delta?.toolCalls,
      finishReason: response.delta?.finishReason || 'stop',
      usage: response.usage,
      raw: response.raw
    }
  }
}
