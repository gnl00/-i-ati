/**
 * 消息管理器
 * 统一管理消息状态，消除手动同步
 */
import type { MessageManager as IMessageManager, MessageUpdater } from '../types'

/**
 * 消息管理器实现
 * 自动同步 messageEntities、chatMessages 和 request.messages
 */
export class MessageManager implements IMessageManager {
  private _messageEntities: MessageEntity[]
  private _requestMessages: ChatMessage[]
  private readonly _setMessages: (msgs: MessageEntity[]) => void

  constructor(
    messageEntities: MessageEntity[],
    requestMessages: ChatMessage[],
    setMessages: (msgs: MessageEntity[]) => void
  ) {
    this._messageEntities = messageEntities
    this._requestMessages = requestMessages
    this._setMessages = setMessages
  }

  /**
   * 获取消息实体列表
   */
  get messageEntities(): MessageEntity[] {
    return this._messageEntities
  }

  /**
   * 设置消息实体列表
   */
  set messageEntities(messages: MessageEntity[]) {
    this._messageEntities = messages
    this._setMessages(messages)
  }

  /**
   * 获取聊天消息列表（自动从 messageEntities 转换）
   */
  get chatMessages(): ChatMessage[] {
    return this._messageEntities.map(msg => msg.body)
  }

  /**
   * 获取请求消息列表
   */
  get requestMessages(): ChatMessage[] {
    return this._requestMessages
  }

  /**
   * 更新最后一条消息
   * @param updater 更新函数
   */
  updateLastMessage(updater: MessageUpdater): void {
    const updated = [...this._messageEntities]
    const lastIndex = updated.length - 1
    if (lastIndex >= 0) {
      updated[lastIndex] = updater(updated[lastIndex])
      this.messageEntities = updated
    }
  }

  /**
   * 添加消息到请求历史
   * @param message 聊天消息
   */
  appendMessageToRequest(message: ChatMessage): void {
    this._requestMessages.push(message)
  }

  /**
   * 添加工具调用消息到请求历史
   * @param toolCalls 工具调用列表
   * @param content 文本内容
   */
  appendToolCallMessage(
    toolCalls: any[],
    content: string = ''
  ): void {
    const message: ChatMessage = {
      role: 'assistant',
      content,
      toolCalls,
      segments: []
    }
    this.appendMessageToRequest(message)
  }

  /**
   * 添加工具响应消息到请求历史
   * @param toolName 工具名称
   * @param toolCallId 工具调用 ID
   * @param content 响应内容
   */
  appendToolResponseMessage(
    toolName: string,
    toolCallId: string,
    content: string
  ): void {
    const message: ChatMessage = {
      role: 'tool',
      name: toolName,
      toolCallId,
      content,
      segments: []
    }
    this.appendMessageToRequest(message)
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage(): MessageEntity | undefined {
    return this._messageEntities[this._messageEntities.length - 1]
  }
}
