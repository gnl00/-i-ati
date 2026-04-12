/**
 * ExecutableRequestAdapter
 *
 * 放置内容：
 * - 把 `MaterializedProtocolRequest` 适配成当前运行时可真正发出的请求
 *
 * 业务逻辑边界：
 * - 它是协议层和现有调用设施之间的显式桥接
 * - 它不回头修改 transcript 或 request spec
 * - 它负责把 typed user content parts 映射成当前 `IUnifiedRequest` 所需的消息形态
 * - 这种映射必须保留多模态信息，不能把图片/文件压扁成普通文本
 */
import type { MaterializedProtocolRequest } from '../transcript/RequestMaterializer'
import type { AgentContentPart } from '../transcript/AgentContentPart'

export const partsToUnifiedContent = (parts: AgentContentPart[]): string | VLMContent[] => {
  const hasStructuredParts = parts.some(part => part.type !== 'input_text')

  if (!hasStructuredParts) {
    return parts
      .map(part => ('text' in part ? part.text : ''))
      .join('')
  }

  const content: VLMContent[] = []
  for (const part of parts) {
    if (part.type === 'input_text') {
      content.push({
        type: 'text',
        text: part.text
      })
      continue
    }

    if (part.type === 'input_image') {
      const url = part.imageUrl || part.fileUrl
      if (url) {
        content.push({
          type: 'image_url',
          image_url: {
            url,
            detail: part.detail ?? 'auto'
          }
        })
        continue
      }
    }

    const label = part.type === 'input_file'
      ? `[file:${part.filename || part.fileId || 'unknown'}]`
      : `[image:${part.filename || part.fileId || 'unknown'}]`

    content.push({
      type: 'text',
      text: label
    })
  }

  return content
}

const createChatMessage = (
  role: ChatMessage['role'],
  content: ChatMessage['content'],
  extra: Partial<ChatMessage> = {}
): ChatMessage => ({
  role,
  content,
  segments: [],
  ...extra
})

export interface ExecutableRequestAdapter {
  adapt(request: MaterializedProtocolRequest): IUnifiedRequest
}

export class DefaultExecutableRequestAdapter implements ExecutableRequestAdapter {
  adapt(request: MaterializedProtocolRequest): IUnifiedRequest {
    const messages: ChatMessage[] = request.messages.map((message) => {
      if (message.role === 'user') {
        return createChatMessage('user', partsToUnifiedContent(message.content))
      }

      if (message.role === 'assistant') {
        return createChatMessage('assistant', message.content, {
          toolCalls: message.toolCalls
        })
      }

      return createChatMessage('tool', message.content, {
        name: message.toolName,
        toolCallId: message.toolCallId
      })
    })

    return {
      adapterPluginId: request.adapterPluginId,
      baseUrl: request.baseUrl,
      apiKey: request.apiKey,
      model: request.model,
      modelType: request.modelType,
      systemPrompt: request.systemPrompt,
      userInstruction: request.userInstruction,
      messages,
      stream: request.stream,
      tools: request.tools as any[] | undefined,
      requestOverrides: request.requestOverrides,
      options: request.options
    }
  }
}
