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

import type { ChatStore } from '@renderer/store'
import { logger } from '../logger'
import type { StreamingContext } from '../types'

// MessageEntity, MessageSegment, ChatMessage 是全局类型，无需导入

/**
 * 消息更新函数类型
 */
export type MessageUpdater = (
  entities: MessageEntity[]
) => MessageEntity[]

export interface MessageManagerOptions {
  enableStreamBuffer?: boolean
  streamBufferMs?: number
}

export class MessageManager {
  private readonly enableStreamBuffer: boolean
  private readonly streamBufferMs: number
  private pendingAssistantUpdate: MessageEntity | null = null
  private streamFlushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly context: StreamingContext,
    private readonly store: ChatStore,
    options: MessageManagerOptions = {}
  ) {
    this.enableStreamBuffer = options.enableStreamBuffer ?? false
    this.streamBufferMs = options.streamBufferMs ?? 40
  }

  private scheduleAssistantFlush(): void {
    if (!this.enableStreamBuffer) {
      if (this.pendingAssistantUpdate) {
        this.store.upsertMessage(this.pendingAssistantUpdate)
        this.pendingAssistantUpdate = null
      }
      return
    }

    if (this.streamFlushTimer) return
    this.streamFlushTimer = setTimeout(() => {
      this.streamFlushTimer = null
      if (this.pendingAssistantUpdate) {
        this.store.upsertMessage(this.pendingAssistantUpdate)
        this.pendingAssistantUpdate = null
      }
    }, this.streamBufferMs)
  }

  flushPendingAssistantUpdate(): void {
    if (this.streamFlushTimer) {
      clearTimeout(this.streamFlushTimer)
      this.streamFlushTimer = null
    }
    if (this.pendingAssistantUpdate) {
      this.store.upsertMessage(this.pendingAssistantUpdate)
      this.pendingAssistantUpdate = null
    }
  }

  /**
   * 更新最后一条消息（流式更新，仅更新内存）
   *
   * 数据流说明：
   * 1. 更新 session.messageEntities - 保持内存中的消息状态最新
   * 2. 调用 store.upsertMessage - 触发 UI 更新（不持久化到 SQLite）
   * 3. 最终持久化由 finalize 阶段统一处理
   *
   * 用途：流式输出场景，避免频繁的 IPC 调用
   * @param updater 更新函数，接收最后一条消息，返回更新后的消息
   */
  updateLastMessage(updater: (message: MessageEntity) => MessageEntity): void {
    try {
      this.flushPendingAssistantUpdate()
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
   * 更新最后一条 assistant 消息（流式更新，仅更新内存）
   * 用于 Cycle 2 时，确保内容追加到正确的 assistant 消息上
   * @param updater 更新函数，接收最后一条 assistant 消息，返回更新后的消息
   */
  updateLastAssistantMessage(updater: (message: MessageEntity) => MessageEntity): void {
    try {
      const entities = this.context.session.messageEntities
      // 从后往前查找最后一条 assistant 消息
      for (let i = entities.length - 1; i >= 0; i--) {
        if (entities[i].body.role === 'assistant') {
          const updated = updater(entities[i])
          entities[i] = updated
          if (this.enableStreamBuffer) {
            this.pendingAssistantUpdate = updated
            this.scheduleAssistantFlush()
          } else {
            this.store.upsertMessage(updated)
          }
          return
        }
      }
      throw new Error('No assistant message found')
    } catch (error) {
      logger.error('Failed to update last assistant message', error as Error)
    }
  }

  /**
   * 向最后一条消息添加 segment（流式更新，仅更新内存）
   * @param segment 要添加的 segment
   */
  appendSegmentToLastMessage(segment: MessageSegment): void {
    this.updateLastAssistantMessage((last) => {
      const currentSegments = last.body.segments || []

      // 创建新的对象引用，避免直接修改原对象
      const updated = {
        ...last,
        body: {
          ...last.body,
          segments: [...currentSegments, segment]
        }
      }

      return updated
    })
  }

  /**
   * 批量添加多个 segments（智能合并）
   * @param segments 要添加的 segments 数组
   */
  appendSegmentsToLastMessage(segments: MessageSegment[]): void {
    this.updateLastMessage((last) => {
      // 创建新的对象引用，避免直接修改原对象
      return {
        ...last,
        body: {
          ...last.body,
          segments: [...(last.body.segments || []), ...segments]
        }
      }
    })
  }

  /**
   * 添加工具调用消息
   *
   * 数据流说明（新方案）：
   * 1. 更新最后一条消息 - 添加 toolCalls 字段，触发 UI 更新
   * 2. 更新 request.messages - 添加 assistant 消息（包含 toolCalls），用于后续请求
   * 3. 不保存到数据库 - 由 finalize 阶段统一保存（确保顺序正确）
   *
   * 关键变化：移除了 streaming 阶段的数据库保存，统一在 finalize 阶段处理
   *
   * @param toolCalls 工具调用列表
   * @param content 消息内容
   */
  async addToolCallMessage(toolCalls: IToolCall[], content: string): Promise<void> {
    const assistantToolCallMessage: ChatMessage = {
      role: 'assistant',
      content: content || '',
      segments: [],
      toolCalls: toolCalls
    }

    // 1. 获取最后一条消息（assistant 消息）
    const lastMessage = this.getLastMessage()

    // 2. 更新最后一条消息，添加 toolCalls 和 content（仅内存）
    lastMessage.body.content = content || ''
    lastMessage.body.toolCalls = toolCalls

    // 3. 更新 request.messages（用于下一轮 LLM 请求）
    this.context.request.messages.push(assistantToolCallMessage)
  }

  /**
   * 添加 tool result 消息
   *
   * 数据流说明（新方案）：
   * 1. 创建 tool result 的 MessageEntity（仅内存，无 id）
   * 2. 添加到 session.messageEntities - 用于 finalize 阶段保存
   * 3. 添加到 request.messages - 用于下一轮 LLM 请求
   * 4. 不更新 store.messages - 避免在 UI 中显示为独立消息
   * 5. 不保存到数据库 - 由 finalize 阶段统一保存（在 assistant 消息之后）
   *
   * 关键：finalize 阶段会按顺序保存：assistant → tool results
   *
   * @param toolMsg 工具结果消息
   */
  async addToolResultMessage(toolMsg: ChatMessage): Promise<void> {
    // 1. 创建 tool result 的 MessageEntity（仅内存，无 id）
    const toolResultEntity: MessageEntity = {
      body: toolMsg,
      chatId: this.context.session.currChatId,
      chatUuid: this.context.session.chatEntity.uuid
      // 注意：不设置 id，由 finalize 阶段保存时生成
    }

    // 2. 添加到 session.messageEntities（用于 finalize 阶段保存）
    this.context.session.messageEntities.push(toolResultEntity)

    // 3. 添加到 request.messages（用于下一轮 LLM 请求）
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
   * 获取最后一条 assistant 消息
   * 用于 Cycle 2 时，确保内容追加到正确的 assistant 消息上
   */
  getLastAssistantMessage(): MessageEntity {
    const entities = this.context.session.messageEntities
    for (let i = entities.length - 1; i >= 0; i--) {
      if (entities[i].body.role === 'assistant') {
        return entities[i]
      }
    }
    throw new Error('No assistant message found')
  }

  /**
   * 获取最后一条消息的 body
   */
  getLastMessageBody(): MessageEntity['body'] {
    return this.getLastMessage().body
  }
}
