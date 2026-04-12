/**
 * ModelResponseChunk
 *
 * 放置内容：
 * - `next` runtime 在 model execution 和 parser 之间使用的规范化响应块
 *
 * 业务逻辑边界：
 * - 它不直接暴露 provider-specific / unified response shape 给 loop / parser
 * - `delta` 只表达本次解析应消费的增量事实
 * - `final` 只表达流已经稳定结束，不应重复携带前面 delta 已经发过的内容
 */
export interface ModelResponseChunkBase {
  responseId?: string
  model?: string
  raw?: unknown
}

export interface ModelToolCallChunk {
  toolCall: IToolCall
  argumentsMode: 'delta' | 'snapshot'
}

export interface ModelDeltaResponseChunk extends ModelResponseChunkBase {
  kind: 'delta'
  content?: string
  reasoning?: string
  toolCalls?: ModelToolCallChunk[]
  finishReason?: IUnifiedResponse['finishReason']
  usage?: ITokenUsage
}

/**
 * final chunk 的约束：
 * - 它不重复携带 content / reasoning / toolCalls
 * - 它只是一个终止信号，以及可选的终态 metadata / raw payload
 * - parser 不应把它当作第二份正文来源
 */
export interface ModelFinalResponseChunk extends ModelResponseChunkBase {
  kind: 'final'
}

export type ModelResponseChunk =
  | ModelDeltaResponseChunk
  | ModelFinalResponseChunk
