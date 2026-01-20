import { saveMessage, updateMessage } from '@renderer/db/MessageRepository'
import { logger } from '../../logger'
import { extractContentFromSegments } from '../streaming/segment-utils'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { MessageService } from './message-service'

const syncChatMessages = (context: SubmissionContext): void => {
  context.session.chatMessages = context.session.messageEntities.map(message => message.body)
}

export class DefaultMessageService implements MessageService {
  async createUserMessage(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<MessageEntity> {
    const userMessageEntity: MessageEntity = {
      ...context.session.userMessageEntity,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    }

    const msgId = await saveMessage(userMessageEntity)
    userMessageEntity.id = msgId

    context.session.userMessageEntity = userMessageEntity
    context.session.messageEntities.push(userMessageEntity)
    const chatMessages = context.session.chatEntity.messages || []
    context.session.chatEntity.messages = [...chatMessages, msgId]
    syncChatMessages(context)

    await publisher.emit('message.created', { message: userMessageEntity }, {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    })

    return userMessageEntity
  }

  async createAssistantPlaceholder(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<MessageEntity> {
    const assistantMessage: MessageEntity = {
      body: {
        role: 'assistant',
        model: context.meta.model.label,
        content: '',
        segments: [],
        typewriterCompleted: false
      },
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    }

    const msgId = await saveMessage(assistantMessage)
    assistantMessage.id = msgId

    context.session.messageEntities.push(assistantMessage)
    const chatMessages = context.session.chatEntity.messages || []
    context.session.chatEntity.messages = [...chatMessages, msgId]
    syncChatMessages(context)

    await publisher.emit('message.created', { message: assistantMessage }, {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    })

    return assistantMessage
  }

  updateLastAssistantMessage(
    context: SubmissionContext,
    updater: (message: MessageEntity) => MessageEntity,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): void {
    try {
      const entities = context.session.messageEntities
      for (let i = entities.length - 1; i >= 0; i--) {
        if (entities[i].body.role === 'assistant') {
          const updated = updater(entities[i])
          entities[i] = updated
          syncChatMessages(context)
          void publisher.emit('message.updated', { message: updated }, {
            ...meta,
            chatId: context.session.currChatId,
            chatUuid: context.session.chatEntity.uuid
          })
          return
        }
      }
    } catch (error) {
      logger.error('Failed to update last assistant message', error as Error)
    }
  }

  appendSegment(
    context: SubmissionContext,
    segment: MessageSegment,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): void {
    this.updateLastAssistantMessage(
      context,
      (last) => {
        const currentSegments = last.body.segments || []
        return {
          ...last,
          body: {
            ...last.body,
            segments: [...currentSegments, segment]
          }
        }
      },
      publisher,
      meta
    )

    void publisher.emit('message.segment.appended', { messageId: undefined, segment }, {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    })
  }

  async addToolCallMessage(
    context: SubmissionContext,
    toolCalls: IToolCall[],
    content: string,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void> {
    const lastAssistant = this.getLastAssistantMessage(context)
    const existingToolCalls = lastAssistant.body.toolCalls || []
    const mergedToolCalls = this.mergeToolCalls(existingToolCalls, toolCalls)
    const toolCallIds = mergedToolCalls.map(call => call.id).filter(Boolean) as string[]

    this.updateLastAssistantMessage(
      context,
      (last) => ({
        ...last,
        body: {
          ...last.body,
          content: content || last.body.content || '',
          toolCalls: mergedToolCalls
        }
      }),
      publisher,
      meta
    )

    await publisher.emit('tool.call.attached', {
      toolCallIds,
      messageId: lastAssistant.id
    }, {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    })
  }

  async addToolResultMessage(
    context: SubmissionContext,
    toolMsg: ChatMessage,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void> {
    if (toolMsg.toolCallId && this.hasToolResult(context, toolMsg.toolCallId)) {
      return
    }

    const toolResultEntity: MessageEntity = {
      body: toolMsg,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    }

    let saved = false
    try {
      const msgId = await saveMessage(toolResultEntity)
      toolResultEntity.id = msgId
      const chatMessages = context.session.chatEntity.messages || []
      context.session.chatEntity.messages = [...chatMessages, msgId]
      saved = true
    } catch (error) {
      logger.error('Failed to save tool result message', error as Error)
    }

    context.session.messageEntities.push(toolResultEntity)
    syncChatMessages(context)

    await publisher.emit('tool.result.attached', {
      toolCallId: toolMsg.toolCallId || '',
      message: toolResultEntity
    }, {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    })

    if (saved) {
      await publisher.emit('tool.result.persisted', {
        toolCallId: toolMsg.toolCallId || '',
        message: toolResultEntity
      }, {
        ...meta,
        chatId: context.session.currChatId,
        chatUuid: context.session.chatEntity.uuid
      })
    }
  }

  async updateAssistantMessagesFromSegments(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void> {
    for (const message of context.session.messageEntities) {
      if (message.body.role !== 'assistant') continue

      if (message.body.segments && message.body.segments.length > 0) {
        message.body.content = extractContentFromSegments(message.body.segments)
      }

      if (message.id && message.id > 0) {
        await updateMessage(message)
        await publisher.emit('message.updated', { message }, {
          ...meta,
          chatId: context.session.currChatId,
          chatUuid: context.session.chatEntity.uuid
        })
      }
    }
  }

  async persistToolMessages(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<void> {
    for (const message of context.session.messageEntities) {
      if (message.body.role !== 'tool' || message.id) continue

      let saved = false
      try {
        const msgId = await saveMessage(message)
        message.id = msgId
        const chatMessages = context.session.chatEntity.messages || []
        context.session.chatEntity.messages = [...chatMessages, msgId]
        saved = true
      } catch (error) {
        logger.error('Failed to persist tool message', error as Error)
      }

      await publisher.emit('tool.result.attached', {
        toolCallId: message.body.toolCallId || '',
        message
      }, {
        ...meta,
        chatId: context.session.currChatId,
        chatUuid: context.session.chatEntity.uuid
      })

      if (saved) {
        await publisher.emit('tool.result.persisted', {
          toolCallId: message.body.toolCallId || '',
          message
        }, {
          ...meta,
          chatId: context.session.currChatId,
          chatUuid: context.session.chatEntity.uuid
        })
      }
    }
  }

  private getLastAssistantMessage(context: SubmissionContext): MessageEntity {
    const entities = context.session.messageEntities
    for (let i = entities.length - 1; i >= 0; i--) {
      if (entities[i].body.role === 'assistant') {
        return entities[i]
      }
    }
    throw new Error('No assistant message found')
  }

  private mergeToolCalls(existing: IToolCall[], incoming: IToolCall[]): IToolCall[] {
    if (existing.length === 0) return [...incoming]
    if (incoming.length === 0) return [...existing]

    const seen = new Set<string>()
    const merged: IToolCall[] = []
    for (const call of existing) {
      if (!call.id) continue
      if (!seen.has(call.id)) {
        seen.add(call.id)
        merged.push(call)
      }
    }
    for (const call of incoming) {
      if (!call.id) continue
      if (!seen.has(call.id)) {
        seen.add(call.id)
        merged.push(call)
      }
    }
    return merged
  }

  private hasToolResult(context: SubmissionContext, toolCallId: string): boolean {
    return context.session.messageEntities.some(
      message => message.body.role === 'tool' && message.body.toolCallId === toolCallId
    )
  }
}
