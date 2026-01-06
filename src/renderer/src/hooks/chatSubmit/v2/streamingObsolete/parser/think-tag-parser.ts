/**
 * Think Tag 解析器
 * 专门处理 <think>...</think> 标签的解析
 */

/**
 * Think Tag 状态
 */
enum ThinkTagState {
  NoThink = 'noThink',       // not think
  InThink = 'inThink',     // think 输出中 
  EndThink = 'endThink'  // think 结束
}

/**
 * Think Tag 解析器
 * 处理跨 chunk 的 think tag 解析
 */
export class ThinkTagParser {
  private state = ThinkTagState.NoThink
  private buffer = ''

  /**
   * 解析 think tag
   * @param content 文本内容
   * @param hasThinkTag 当前是否在 think tag 中
   * @returns 解析结果：{ reasoningDelta, textDelta, hasThinkTag }
   */
  parse(
    content: string | undefined,
    hasThinkTag: boolean
  ): { reasoningDelta: string; textDelta: string; hasThinkTag: boolean } {
    if (!content) {
      return { reasoningDelta: '', textDelta: '', hasThinkTag }
    }

    // 根据当前状态更新解析器状态
    if (hasThinkTag && this.state === ThinkTagState.NoThink) {
      this.state = ThinkTagState.InThink
    }

    let reasoningDelta = ''
    let textDelta = ''

    // 处理 <think> 标签
    if (this.state === ThinkTagState.NoThink || this.state === ThinkTagState.EndThink) {
      const thinkStartIndex = content.indexOf('<think>')
      if (thinkStartIndex !== -1) {
        // 找到 <think> 标签
        textDelta = content.substring(0, thinkStartIndex)
        const afterThinkStart = content.substring(thinkStartIndex + 7) // 7 = '<think>'.length
        this.buffer = afterThinkStart
        this.state = ThinkTagState.InThink
        return { reasoningDelta, textDelta, hasThinkTag: true }
      } else {
        // 没有 think tag，全部作为普通文本
        textDelta = content
        return { reasoningDelta, textDelta, hasThinkTag: false }
      }
    }

    // 处理 think tag 内部内容
    if (this.state === ThinkTagState.InThink) {
      this.buffer += content

      // 检查是否有 </think> 标签
      const thinkEndIndex = this.buffer.indexOf('</think>')
      if (thinkEndIndex !== -1) {
        // 找到 </think> 标签
        reasoningDelta = this.buffer.substring(0, thinkEndIndex)
        const afterThinkEnd = this.buffer.substring(thinkEndIndex + 8) // 8 = '</think>'.length
        this.buffer = ''
        this.state = ThinkTagState.EndThink
        return {
          reasoningDelta,
          textDelta: afterThinkEnd,
          hasThinkTag: false
        }
      } else {
        // 仍在 think tag 内，全部作为推理内容
        reasoningDelta = content
        return { reasoningDelta, textDelta: '', hasThinkTag: true }
      }
    }

    // TagClosed 状态，继续检查是否有新的 <think>
    if (this.state === ThinkTagState.EndThink) {
      const thinkStartIndex = content.indexOf('<think>')
      if (thinkStartIndex !== -1) {
        // 找到新的 <think> 标签
        textDelta = content.substring(0, thinkStartIndex)
        const afterThinkStart = content.substring(thinkStartIndex + 7)
        this.buffer = afterThinkStart
        this.state = ThinkTagState.InThink
        return { reasoningDelta: '', textDelta, hasThinkTag: true }
      } else {
        // 没有 think tag，全部作为普通文本
        textDelta = content
        this.state = ThinkTagState.NoThink
        return { reasoningDelta: '', textDelta, hasThinkTag: false }
      }
    }

    return { reasoningDelta, textDelta, hasThinkTag: this.state === ThinkTagState.InThink }
  }

  /**
   * 重置解析器状态
   */
  reset(): void {
    this.state = ThinkTagState.NoThink
    this.buffer = ''
  }
}
