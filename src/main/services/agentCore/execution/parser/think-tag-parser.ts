/**
 * Think Tag 解析器
 * 专门处理 <think> 标签的解析
 */

import { ParserState, ThinkTagMode } from './parser-state'
import { ParserError } from './errors'
import { parserLogger } from './logger'
import type { SegmentDelta } from './types'

/**
 * Think Tag 解析器
 *
 * 这是一个面向流式 chunk 的轻量 tokenizer：
 * - 输入：当前 chunk 文本 + 可变 ParserState
 * - 输出：按原始顺序排列的 segment deltas
 *
 * 设计约束：
 * - 只把第一个完整的 think block 视为 reasoning
 * - 后续再出现的 <think> 标签按普通文本处理
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

    for (let length = maxPrefixLength; length > 0; length -= 1) {
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

  private pushSegment(
    segmentDeltas: SegmentDelta[],
    type: SegmentDelta['type'],
    content: string
  ): void {
    if (!content) {
      return
    }

    const lastSegment = segmentDeltas[segmentDeltas.length - 1]
    if (lastSegment?.type === type) {
      lastSegment.content += content
      return
    }

    segmentDeltas.push({ type, content })
  }

  private tokenizeInsideThink(input: string, state: ParserState, segmentDeltas: SegmentDelta[]): string {
    const thinkEndIndex = input.indexOf(ThinkTagParser.THINK_END)

    if (thinkEndIndex !== -1) {
      this.pushSegment(segmentDeltas, 'reasoning', input.slice(0, thinkEndIndex))
      state.thinkTagMode = ThinkTagMode.Outside
      state.hasClosedThinkTag = true
      return input.slice(thinkEndIndex + ThinkTagParser.THINK_END.length)
    }

    const { stableContent, pendingPrefix } = this.extractTrailingTagPrefix(
      input,
      ThinkTagParser.THINK_END
    )
    this.pushSegment(segmentDeltas, 'reasoning', stableContent)
    state.pendingThinkTagPrefix = pendingPrefix
    return ''
  }

  /**
   * 解析 think tag
   * @param content 文本内容
   * @param state Parser 状态（会被修改）
   * @returns 按原始顺序排列的 segment 增量
   */
  parse(
    content: string | undefined,
    state: ParserState
  ): SegmentDelta[] {
    try {
      if (!content) {
        return []
      }

      let input = state.pendingThinkTagPrefix + content
      state.pendingThinkTagPrefix = ''

      const segmentDeltas: SegmentDelta[] = []

      while (input) {
        if (state.thinkTagMode === ThinkTagMode.Inside) {
          input = this.tokenizeInsideThink(input, state, segmentDeltas)
          continue
        }

        // 当前策略：只接受第一个完整 think block。
        if (state.hasClosedThinkTag) {
          this.pushSegment(segmentDeltas, 'text', input)
          break
        }

        const thinkStartIndex = input.indexOf(ThinkTagParser.THINK_START)
        if (thinkStartIndex === -1) {
          const { stableContent, pendingPrefix } = this.extractTrailingTagPrefix(
            input,
            ThinkTagParser.THINK_START
          )
          this.pushSegment(segmentDeltas, 'text', stableContent)
          state.pendingThinkTagPrefix = pendingPrefix
          break
        }

        this.pushSegment(segmentDeltas, 'text', input.slice(0, thinkStartIndex))
        input = input.slice(thinkStartIndex + ThinkTagParser.THINK_START.length)
        state.thinkTagMode = ThinkTagMode.Inside
      }

      return segmentDeltas
    } catch (error) {
      parserLogger.error('Failed to parse think tag', error as Error)
      throw new ParserError('Think tag parsing failed', { content, error: (error as Error).message })
    }
  }
}
