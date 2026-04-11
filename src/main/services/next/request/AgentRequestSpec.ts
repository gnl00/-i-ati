/**
 * AgentRequestSpec
 *
 * 放置内容：
 * - 整轮 run 共享的稳定请求规格
 *
 * 预期内容：
 * - model / provider selection
 * - baseUrl / apiKey 等认证与路由信息
 * - systemPrompt / userInstruction
 * - tools
 * - stream / options / requestOverrides
 *
 * 业务逻辑边界：
 * - 它回答的是“这一轮 run 内的请求按什么规格发”
 * - 它是整轮 run 共享的 immutable spec
 * - 它不是 transcript，也不是运行中的 mutable request bag
 * - 它不直接承载 host-facing output
 */
export interface AgentRequestOptions {
  maxTokens?: number
}

export interface AgentRequestSpec {
  adapterPluginId: string
  baseUrl: string
  apiKey: string
  model: string
  modelType?: string
  systemPrompt?: string
  userInstruction?: string
  tools?: unknown[]
  stream?: boolean
  requestOverrides?: Record<string, unknown>
  options?: AgentRequestOptions
}
