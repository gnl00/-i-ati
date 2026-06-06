import { createUnifiedRequest } from '@main/request/UnifiedRequestFactory'
import { unifiedChatRequest } from '@main/request/index'
import { embeddedToolsRegistry } from '@tools/registry'
import type { ToolDefinition } from '@tools/registry'

const MAX_LOOP_ROUNDS = 25

export interface AgentOptions {
  model?: AccountModel
  account?: ProviderAccount
  providerDefinition?: ProviderDefinition
  toolDefinitions?: ToolDefinition[]
  sanitizeOverrides?: (
    overrides: ProviderDefinition['requestOverrides']
  ) => ProviderDefinition['requestOverrides']
  requestOptions?: {
    maxTokens?: number
    thinking?: UnifiedRequestThinkingOption
  }
}

export interface AgentToolCallResult {
  name: string
  args: Record<string, any>
  result: any
  success: boolean
  error?: string
}

export interface AgentResult {
  type: 'tool_call' | 'text' | 'error'
  content?: string
  toolCalls?: AgentToolCallResult[]
  usage?: ITokenUsage
  error?: string
}

const toUsage = (base: ITokenUsage | undefined, next: ITokenUsage | undefined): ITokenUsage | undefined => {
  if (!base) return next
  if (!next) return base

  return {
    promptTokens: (base.promptTokens ?? 0) + (next.promptTokens ?? 0),
    completionTokens: (base.completionTokens ?? 0) + (next.completionTokens ?? 0),
    totalTokens: (base.totalTokens ?? 0) + (next.totalTokens ?? 0),
    promptCacheHitTokens: (base.promptCacheHitTokens ?? 0) + (next.promptCacheHitTokens ?? 0),
    promptCacheMissTokens: (base.promptCacheMissTokens ?? 0) + (next.promptCacheMissTokens ?? 0),
    promptCacheWriteTokens: (base.promptCacheWriteTokens ?? 0) + (next.promptCacheWriteTokens ?? 0),
    reasoningTokens: (base.reasoningTokens ?? 0) + (next.reasoningTokens ?? 0)
  }
}

const safeParseJson = (value: string): any => {
  return JSON.parse(value)
}

const normalizeToolArgs = (value: string): { args: Record<string, any> } => {
  return { args: safeParseJson(value) }
}

const createToolResultContent = (result: any): string => {
  if (typeof result === 'string') {
    return result
  }

  if (typeof result === 'undefined') {
    return 'null'
  }

  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

const resolveModelContext = (options?: AgentOptions) => {
  const model = options?.model
  const account = options?.account
  const providerDefinition = options?.providerDefinition

  if (!model || !account || !providerDefinition) {
    throw new Error('agent() requires model, account, and providerDefinition')
  }

  return { model, account, providerDefinition }
}

async function executeToolCalls(
  toolCalls: IToolCall[],
  allToolCalls: AgentToolCallResult[]
): Promise<AgentToolCallResult[]> {
  const toolResults = [...allToolCalls]

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name
    if (!toolName) {
      toolResults.push({
        name: '',
        args: {},
        result: 'Missing tool name',
        success: false
      })
      continue
    }

    let args: Record<string, any> = {}
    try {
      args = normalizeToolArgs(toolCall.function.arguments).args
    } catch (error) {
      toolResults.push({
        name: toolName,
        args: {},
        result: undefined,
        success: false,
        error: error instanceof Error ? error.message : 'Tool args parse failed'
      })
      continue
    }

    const handler = embeddedToolsRegistry.getHandler(toolName)
    if (!handler) {
      toolResults.push({
        name: toolName,
        args,
        result: undefined,
        success: false,
        error: `Tool handler not found: ${toolName}`
      })
      continue
    }

    try {
      const result = await handler(args)
      toolResults.push({
        name: toolName,
        args,
        result,
        success: true
      })
    } catch (error) {
      toolResults.push({
        name: toolName,
        args,
        result: undefined,
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      })
    }
  }

  return toolResults
}

export async function agent(
  name: string,
  systemPrompt: string,
  tools: string[],
  messages: UnifiedRequestMessage[],
  loop = false,
  options: AgentOptions = {}
): Promise<AgentResult> {
  const { model, account, providerDefinition } = resolveModelContext(options)
  const toolDefinitions = options.toolDefinitions ?? (tools.length > 0
    ? embeddedToolsRegistry.getTools(tools)
    : [])
  const overrides = options.sanitizeOverrides
    ? options.sanitizeOverrides(providerDefinition.requestOverrides ?? {})
    : providerDefinition.requestOverrides
  const requestOptions = options.requestOptions

  const disabledThinking = requestOptions?.thinking?.enabled === false
  const payloadExtensions = disabledThinking
    ? { ...providerDefinition.payloadExtensions, thinking: undefined }
    : providerDefinition.payloadExtensions

  const agentMessages: UnifiedRequestMessage[] = [
    {
      role: 'system',
      content: systemPrompt
    },
    ...messages
  ]

  let rounds = 0
  let usage: ITokenUsage | undefined
  let text = ''
  const toolResults: AgentToolCallResult[] = []

  try {
    while (true) {
      const request = createUnifiedRequest({
        adapterPluginId: providerDefinition.adapterPluginId,
        baseUrl: account.apiUrl,
        apiKey: account.apiKey,
        model: model.id,
        modelType: model.type,
        messages: agentMessages,
        tools: toolDefinitions,
        stream: false,
        payloadExtensions,
        requestOverrides: overrides,
        options: {
          ...requestOptions
        }
      })

      const response = await unifiedChatRequest(request, null, () => {}, () => {})
      usage = toUsage(usage, response?.usage)

      const toolCalls = response?.toolCalls ?? []
      if (toolCalls.length > 0) {
        const nextToolResults = await executeToolCalls(toolCalls, toolResults)
        const existingLength = toolResults.length
        if (nextToolResults.length > existingLength) {
          toolResults.push(...nextToolResults.slice(existingLength))
        }

        if (!loop) {
          return {
            type: 'tool_call',
            toolCalls: [...toolResults],
            usage
          }
        }

        for (let index = 0; index < toolCalls.length; index += 1) {
          const toolCall = toolCalls[index]
          const toolCallResult = nextToolResults[index] ?? {
            name: toolCall.function?.name ?? '',
            args: {},
            result: undefined,
            success: false,
            error: 'Missing tool call result'
          }
          const toolCallResultPayload = toolCallResult.result === undefined
            ? toolCallResult.error
            : toolCallResult.result
          agentMessages.push({
            role: 'assistant',
            content: '',
            toolCalls: [toolCall]
          }, {
            role: 'tool',
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            content: createToolResultContent(toolCallResultPayload)
          })
        }

        rounds += 1
        if (rounds >= MAX_LOOP_ROUNDS) {
          return {
            type: 'tool_call',
            toolCalls: [...toolResults],
            usage
          }
        }
        continue
      }

      text = response?.content ?? ''
      return {
        type: 'text',
        content: text,
        usage
      }
    }
  } catch (error) {
    return {
      type: 'error',
      error: error instanceof Error ? error.message : 'agent() execution failed',
      usage
    }
  }
}
