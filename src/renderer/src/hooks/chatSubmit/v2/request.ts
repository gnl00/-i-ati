import { embeddedToolsRegistry } from '@tools/index'
import type { BuildRequestParams, PreparedRequest } from './types'

export const buildRequestV2 = ({ prepared }: BuildRequestParams): PreparedRequest => {
  const filteredMessages = prepared.session.chatMessages.filter(msg => {
    if (msg.role === 'assistant') {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        return true
      }
      if (msg.content && (msg.content as string).trim() !== '') {
        return true
      }
      return false
    }
    return true
  })

  const embeddedTools = embeddedToolsRegistry.getAllTools()
  const finalTools = embeddedTools.map(tool => ({
    ...tool.function
  }))

  if (prepared.input.tools && prepared.input.tools.length > 0) {
    finalTools.push(...prepared.input.tools)
  }

  const request: IUnifiedRequest = {
    baseUrl: prepared.meta.provider.apiUrl,
    messages: filteredMessages,
    apiKey: prepared.meta.provider.apiKey,
    prompt: prepared.systemPrompts.join('\n'),
    model: prepared.meta.model.value,
    modelType: prepared.meta.model.type,
    tools: finalTools
  }

  return {
    ...prepared,
    request
  }
}
