/**
 * MessageManager - 统一消息状态管理
 *
 * 核心职责：
 * - 原子更新消息（自动同步 3 个地方：messageEntities、chatMessages、setMessages）
 * - 提供便捷的消息更新方法
 * - 消除手动同步代码
 *
 * 设计原则：
 * - 单一职责：只负责消息的更新和同步
 * - 原子性：每次更新保证 3 个地方同步
 * - 类型安全：提供类型化的更新方法
 * - 易于测试：独立类，无副作用
 */

import type {
  MessageEntity,
  MessageSegment,
  ChatMessage,
  StreamingContext
} from '../types'

/**
 * 消息更新函数类型
 */
export type MessageUpdater = (
  entities: MessageEntity[]
) => MessageEntity[]

export class MessageManager {
  constructor(
    private readonly context: StreamingContext,
    private readonly setMessages: (messages: MessageEntity[]) => void
  ) {}

  /**
   * 原子更新消息（自动同步 3 个地方）
   * @param updater 更新函数，接收当前消息列表，返回更新后的消息列表
   * @returns 更新后的消息列表
   */
  updateMessages(updater: MessageUpdater): MessageEntity[] {
    const updated = updater(this.context.session.messageEntities)

    // 单次同步所有 3 个地方
    this.context.session.messageEntities = updated
    this.context.session.chatMessages = updated.map(msg => msg.body)
    this.setMessages(updated)

    return updated
  }

  /**
   * 向最后一条消息添加 segment
   * @param segment 要添加的 segment
   * @returns 更新后的消息列表
   */
  appendSegmentToLastMessage(segment: MessageSegment): MessageEntity[] {
    return this.updateMessages(entities => {
      const last = entities[entities.length - 1]
      if (!last.body.segments) {
        last.body.segments = []
      }
      last.body.segments.push(segment)
      return entities
    })
  }

  /**
   * 批量添加多个 segments（智能合并）
   * @param segments 要添加的 segments 数组
   * @returns 更新后的消息列表
   */
  appendSegmentsToLastMessage(segments: MessageSegment[]): MessageEntity[] {
    return this.updateMessages(entities => {
      const last = entities[entities.length - 1]
      if (!last.body.segments) {
        last.body.segments = []
      }
      last.body.segments.push(...segments)
      return entities
    })
  }

  /**
   * 更新最后一条消息
   * @param updater 更新函数，接收最后一条消息，返回更新后的消息
   * @returns 更新后的消息列表
   */
  updateLastMessage(
    updater: (message: MessageEntity) => MessageEntity
  ): MessageEntity[] {
    return this.updateMessages(entities => {
      const lastIndex = entities.length - 1
      const last = entities[lastIndex]
      entities[lastIndex] = updater(last)
      return entities
    })
  }

  /**
   * 添加 tool result 消息（同时更新 session 和 request）
   * @param toolMsg 工具结果消息
   */
  addToolResultMessage(toolMsg: ChatMessage): void {
    this.updateMessages(entities => [...entities, { body: toolMsg }])
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
