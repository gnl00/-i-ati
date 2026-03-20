/**
 * Think Tag 解析器
 * 专门处理  标签的解析
 */

import { ParserState, ThinkTagState } from './parser-state'
import { ParserError } from './errors'
import { parserLogger } from './logger'

/**
 * Think Tag 解析器
 * 处理跨 chunk 的 think tag 解析
 *
 * 注意：状态由外部的 ParserState 管理
 */
export class ThinkTagParser {
  private static readonly THINK_START = '<think>'
  private static readonly THINK_END = '</think>'

  /**
   * 提取内容尾部可能是半截标签的前缀。
   *
   * 这里不能把这部分直接作为 text/reasoning delta 吐出去，
   * 否则像 "<thi" / "</thi" 这种跨 chunk 的标签会被错误当成正文。
   */
  private extractTrailingTagPrefix(
    content: string,
    tag: string
  ): { stableContent: string; pendingPrefix: string } {
    const maxPrefixLength = Math.min(tag.length - 1, content.length)

    for (let length = maxPrefixLength; length > 0; length--) {
      const suffix = content.slice(-length)
      if (tag.startsWith(suffix)) {
        return {
          stableContent: content.slice(0, -length),
          pendingPrefix: suffix
        }
      }
    }

    return { stableContent: content, pendingPrefix: '' }
  }

  private parseInsideThink(
    content: string,
    state: ParserState
  ): { reasoningDelta: string; textDelta: string } {
    const combinedContent = state.thinkTagBuffer + content
    state.thinkTagBuffer = ''

    const thinkEndIndex = combinedContent.indexOf(ThinkTagParser.THINK_END)

    if (thinkEndIndex !== -1) {
      // 只返回本次累计内容里 </think> 前的新增部分，不能把整个历史 reasoning 重放一遍。
      const reasoningDelta = combinedContent.substring(0, thinkEndIndex)
      const textDelta = combinedContent.substring(thinkEndIndex + ThinkTagParser.THINK_END.length)
      state.thinkTagState = ThinkTagState.EndThink
      return { reasoningDelta, textDelta }
    }

    const { stableContent, pendingPrefix } = this.extractTrailingTagPrefix(
      combinedContent,
      ThinkTagParser.THINK_END
    )
    state.thinkTagBuffer = pendingPrefix
    state.thinkTagState = ThinkTagState.InThink

    return { reasoningDelta: stableContent, textDelta: '' }
  }

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

      let textDelta = ''

      if (state.thinkTagState === ThinkTagState.EndThink) {
        return { reasoningDelta: '', textDelta: content }
      }

      if (state.thinkTagState === ThinkTagState.InThink) {
        return this.parseInsideThink(content, state)
      }

      const combinedContent = state.thinkTagBuffer + content
      state.thinkTagBuffer = ''
      const thinkStartIndex = combinedContent.indexOf(ThinkTagParser.THINK_START)

      if (thinkStartIndex === -1) {
        const { stableContent, pendingPrefix } = this.extractTrailingTagPrefix(
          combinedContent,
          ThinkTagParser.THINK_START
        )
        state.thinkTagBuffer = pendingPrefix
        return { reasoningDelta: '', textDelta: stableContent }
      }

      textDelta = combinedContent.substring(0, thinkStartIndex)
      const afterThinkStart = combinedContent.substring(
        thinkStartIndex + ThinkTagParser.THINK_START.length
      )
      state.thinkTagState = ThinkTagState.InThink

      if (!afterThinkStart) {
        return { reasoningDelta: '', textDelta }
      }

      // <think> 起始 chunk 中，标签后的内容本身就是首段 reasoning 增量，必须立刻吐出，
      // 否则会出现首段 thinking 文本丢失的问题。
      const insideThinkResult = this.parseInsideThink(afterThinkStart, state)
      return {
        reasoningDelta: insideThinkResult.reasoningDelta,
        textDelta: textDelta + insideThinkResult.textDelta
      }
    } catch (error) {
      parserLogger.error('Failed to parse think tag', error as Error)
      throw new ParserError('Think tag parsing failed', { content, error: (error as Error).message })
    }
  }
}
