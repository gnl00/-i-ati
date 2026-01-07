/**
 * Think Tag 解析器
 * 专门处理  标签的解析
 */

import { ParserState, ThinkTagState } from './parser-state'
import { ParserError } from '../../errors'
import { logger } from '../../logger'

/**
 * Think Tag 解析器
 * 处理跨 chunk 的 think tag 解析
 *
 * 注意：状态由外部的 ParserState 管理
 */
export class ThinkTagParser {

  /**
   * 解析 think tag
   * @param content 文本内容
   * @param state Parser 状态（会被修改）
   * @returns 解析结果：{ reasoningDelta, textDelta }
   */
  parse(
    content: string | undefined,
    state: ParserState
  ): { reasoningDelta: string; textDelta: string } {
    try {
      if (!content) {
        return { reasoningDelta: '', textDelta: '' }
      }

      let reasoningDelta = ''
      let textDelta = ''

      // 处理 <think> 标签
      if (state.thinkTagState === ThinkTagState.NoThink || state.thinkTagState === ThinkTagState.EndThink) {
        const thinkStartIndex = content.indexOf('<think>')

        if (thinkStartIndex !== -1) {
          // 找到 <think> 标签
          textDelta = content.substring(0, thinkStartIndex)
          const afterThinkStart = content.substring(thinkStartIndex + 7) // 7 = '<think>'.length
          state.thinkTagBuffer = afterThinkStart
          state.thinkTagState = ThinkTagState.InThink
          return { reasoningDelta, textDelta }
        } else {
          // 没有 think tag，全部作为普通文本
          textDelta = content
          return { reasoningDelta, textDelta }
        }
      }

      // 处理 think tag 内部内容
      if (state.thinkTagState === ThinkTagState.InThink) {
        state.thinkTagBuffer += content

        // 检查是否有 </think> 标签
        const thinkEndIndex = state.thinkTagBuffer.indexOf('</think>')

        if (thinkEndIndex !== -1) {
          // 找到 </think> 标签
          reasoningDelta = state.thinkTagBuffer.substring(0, thinkEndIndex)
          const afterThinkEnd = state.thinkTagBuffer.substring(thinkEndIndex + 8) // 8 = '</think>'.length
          state.thinkTagBuffer = ''
          state.thinkTagState = ThinkTagState.EndThink
          return { reasoningDelta, textDelta: afterThinkEnd }
        } else {
          // 仍在 think tag 内，全部作为推理内容
          reasoningDelta = content
          return { reasoningDelta, textDelta: '' }
        }
      }

      // EndThink 状态，不再检查新的 <think> 标签
      // 只有第一个 think 标签中的内容才是推理过程
      if (state.thinkTagState === ThinkTagState.EndThink) {
        // 全部作为普通文本
        textDelta = content
        return { reasoningDelta: '', textDelta }
      }

      return { reasoningDelta, textDelta }
    } catch (error) {
      logger.error('Failed to parse think tag', error as Error)
      throw new ParserError('Think tag parsing failed', { content, error: (error as Error).message })
    }
  }
}
