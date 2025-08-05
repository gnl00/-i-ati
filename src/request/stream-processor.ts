import { BaseAdapter } from './adapters/base'

// 流式响应处理器
export class UnifiedStreamProcessor {
  private adapter: BaseAdapter
  private onDelta: (delta: IUnifiedStreamDelta) => void
  private onComplete: (response: IUnifiedResponse) => void
  private onError: (error: Error) => void
  
  // 累积的响应数据
  private accumulated = {
    id: '',
    model: '',
    content: '',
    reasoning: '',
    toolCalls: [] as IToolCall[],
    usage: undefined as ITokenUsage | undefined
  }
  
  constructor(
    adapter: BaseAdapter,
    callbacks: {
      onDelta: (delta: IUnifiedStreamDelta) => void
      onComplete: (response: IUnifiedResponse) => void
      onError: (error: Error) => void
    }
  ) {
    this.adapter = adapter
    this.onDelta = callbacks.onDelta
    this.onComplete = callbacks.onComplete  
    this.onError = callbacks.onError
  }
  
  async processStream(reader: ReadableStreamDefaultReader<string>) {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        // 处理可能包含多个块的 value
        const chunks = this.splitChunks(value)
        
        for (const chunk of chunks) {
          if (chunk.trim()) {
            const streamResponse = this.adapter.parseStreamChunk(chunk)
            if (streamResponse) {
              this.handleStreamResponse(streamResponse)
            }
          }
        }
      }
      
      // 流结束，构建最终响应
      this.buildFinalResponse()
      
    } catch (error) {
      this.onError(error as Error)
    }
  }
  
  private splitChunks(value: string): string[] {
    // 不同 Provider 可能有不同的分隔符
    // OpenAI: "data: {...}\n\ndata: {...}\n\n"
    // Claude: 可能是不同的格式
    return value.split('\n\n').filter(chunk => chunk.trim())
  }
  
  private handleStreamResponse(streamResponse: IUnifiedStreamResponse) {
    const { delta } = streamResponse
    
    // 更新累积数据
    if (streamResponse.id) this.accumulated.id = streamResponse.id
    if (streamResponse.model) this.accumulated.model = streamResponse.model
    
    if (delta.content) {
      this.accumulated.content += delta.content
    }
    
    if (delta.reasoning) {
      this.accumulated.reasoning += delta.reasoning
    }
    
    if (delta.toolCalls) {
      this.accumulated.toolCalls.push(...delta.toolCalls)
    }
    
    if (delta.usage) {
      this.accumulated.usage = delta.usage
    }
    
    // 触发 delta 事件
    this.onDelta(delta)
    
    // 如果有结束信号，准备完成
    if (delta.finishReason) {
      this.buildFinalResponse(delta.finishReason)
    }
  }
  
  private buildFinalResponse(finishReason: string = 'stop') {
    const finalResponse: IUnifiedResponse = {
      id: this.accumulated.id || 'stream-' + Date.now(),
      model: this.accumulated.model || 'unknown',
      timestamp: Date.now(),
      content: this.accumulated.content,
      reasoning: this.accumulated.reasoning || undefined,
      toolCalls: this.accumulated.toolCalls.length > 0 ? this.accumulated.toolCalls : undefined,
      finishReason: finishReason as IUnifiedResponse['finishReason'],
      usage: this.accumulated.usage
    }
    
    this.onComplete(finalResponse)
  }
}