import { embeddedToolsRegistry } from '@tools/index'
import { systemPrompt as systemPromptBuilder } from '../../../constant/prompts'
import { BuildRequestParams, RequestReadyChat } from './types'

export const buildRequest = ({ prepared, prompt }: BuildRequestParams): RequestReadyChat => {
  let systemPrompts = [systemPromptBuilder(prepared.session.workspacePath)]
  if (prompt) {
    systemPrompts = [prompt, ...systemPrompts]
  }

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
    prompt: systemPrompts.join('\n'),
    model: prepared.meta.model.value,
    modelType: prepared.meta.model.type,
    tools: finalTools
  }

  return {
    ...prepared,
    request
  }
}
