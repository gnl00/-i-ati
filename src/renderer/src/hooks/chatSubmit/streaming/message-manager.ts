/**
 * MessageManager - 统一消息状态管理（简化版）
 *
 * 核心职责：
 * - 提供便捷的消息更新方法
 * - 通过 Zustand store actions 自动同步到 SQLite
 * - 消除手动同步代码
 *
 * 设计原则：
 * - 单一职责：只负责消息的业务操作
 * - 自动同步：通过 store actions 自动处理 IPC 和 SQLite
 * - 类型安全：提供类型化的更新方法
 */

import type { StreamingContext } from '../types'
import { logger } from '../logger'
import type { ChatStore } from '@renderer/store'

// MessageEntity, MessageSegment, ChatMessage 是全局类型，无需导入

/**
 * 消息更新函数类型
 */
export type MessageUpdater = (
  entities: MessageEntity[]
) => MessageEntity[]

export class MessageManager {
  constructor(
    private readonly context: StreamingContext,
    private readonly store: ChatStore
  ) {}

  /**
   * 更新最后一条消息（流式更新，仅更新内存）
   * 用于流式输出场景，避免频繁的 IPC 调用
   * @param updater 更新函数，接收最后一条消息，返回更新后的消息
   */
  updateLastMessage(updater: (message: MessageEntity) => MessageEntity): void {
    try {
      const entities = this.context.session.messageEntities
      const lastIndex = entities.length - 1
      const last = entities[lastIndex]
      const updated = updater(last)

      // 更新 session 中的引用
      entities[lastIndex] = updated

      // 使用 store.upsertMessage 更新 UI（不持久化）
      this.store.upsertMessage(updated)
    } catch (error) {
      logger.error('Failed to update last message', error as Error)
    }
  }

  /**
   * 向最后一条消息添加 segment（流式更新，仅更新内存）
   * @param segment 要添加的 segment
   */
  appendSegmentToLastMessage(segment: MessageSegment): void {
    this.updateLastMessage((last) => {
      if (!last.body.segments) {
        last.body.segments = []
      }
      last.body.segments.push(segment)
      return last
    })
  }

  /**
   * 批量添加多个 segments（智能合并）
   * @param segments 要添加的 segments 数组
   */
  appendSegmentsToLastMessage(segments: MessageSegment[]): void {
    this.updateLastMessage((last) => {
      if (!last.body.segments) {
        last.body.segments = []
      }
      last.body.segments.push(...segments)
      return last
    })
  }

  /**
   * 添加工具调用消息（同时更新 session 和 request）
   * 注意：此操作仅更新内存，不持久化
   * @param toolCalls 工具调用列表
   * @param content 消息内容
   */
  addToolCallMessage(toolCalls: IToolCall[], content: string): void {
    const assistantToolCallMessage: ChatMessage = {
      role: 'assistant',
      content: content || '',
      segments: [],
      toolCalls: toolCalls
    }

    // 更新 request.messages
    this.context.request.messages.push(assistantToolCallMessage)

    // 更新最后一条消息，添加 toolCalls
    this.updateLastMessage((msg) => ({
      ...msg,
      body: {
        ...msg.body,
        content: content || '',
        toolCalls: toolCalls
      }
    }))
  }

  /**
   * 添加 tool result 消息（保存到 SQLite）
   * 注意：这个方法会持久化消息到数据库
   * @param toolMsg 工具结果消息
   */
  async addToolResultMessage(toolMsg: ChatMessage): Promise<void> {
    // 1. 创建 tool result 的 MessageEntity
    const toolResultEntity: MessageEntity = {
      body: toolMsg,
      chatId: this.context.session.currChatId,
      chatUuid: this.context.session.chatEntity.uuid
    }

    // 2. ✅ 通过 store action 保存（自动 IPC → SQLite → 更新 state）
    await this.store.addMessage(toolResultEntity)

    // 3. 更新 session.messageEntities
    this.context.session.messageEntities.push(toolResultEntity)

    // 4. 更新 request.messages，供下一轮 LLM 调用使用
    this.context.request.messages.push(toolMsg)
  }

  /**
   * 获取当前消息列表
   */
  getMessages(): MessageEntity[] {
    return this.context.session.messageEntities
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage(): MessageEntity {
    const entities = this.context.session.messageEntities
    return entities[entities.length - 1]
  }

  /**
   * 获取最后一条消息的 body
   */
  getLastMessageBody(): MessageEntity['body'] {
    return this.getLastMessage().body
  }
}
