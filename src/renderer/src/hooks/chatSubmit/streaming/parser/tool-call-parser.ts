/**
 * Tool Call 解析器
 * 累积 tool call 参数
 */

import type { ToolCall } from '../../types'
import { ParserError } from '../../errors'
import { logger } from '../../logger'
import { v4 as uuidv4 } from 'uuid'

/**
 * Tool Call 解析器
 * 处理流式响应中的 tool calls
 */
export class ToolCallParser {
  /**
   * 解析 tool calls
   * @param toolCalls 响应中的 tool calls
   * @param existingToolCalls 已累积的 tool calls
   * @returns 更新后的 tool calls 列表
   */
  parse(
    toolCalls: IUnifiedResponse['toolCalls'],
    existingToolCalls: ToolCall[]
  ): ToolCall[] {
    try {
      if (!toolCalls || toolCalls.length === 0) {
        return existingToolCalls
      }

      const updated = [...existingToolCalls]

      toolCalls.forEach(tc => {
        // 查找已存在的 tool call（通过 index 或 id 匹配）
        const existing = updated.find(
          t =>
            (tc.index !== undefined && t.index === tc.index) ||
            (tc.id && t.id === tc.id)
        )

        if (existing) {
          // 更新已存在的 tool call
          if (tc.function?.name) {
            existing.name = tc.function.name
          }
          if (tc.function?.arguments) {
            existing.args += tc.function.arguments
          }
        } else {
          // 创建新的 tool call（状态为 pending）
          updated.push({
            id: tc.id || `call_${uuidv4()}`,
            index: tc.index,
            name: tc.function?.name || '',
            args: tc.function?.arguments || '',
            status: 'pending'
          })
        }
      })

      return updated
    } catch (error) {
      logger.error('Failed to parse tool calls', error as Error)
      throw new ParserError('Tool call parsing failed', { toolCalls, error: (error as Error).message })
    }
  }
}
