/**
 * Content 解析器
 * 处理普通内容和推理内容
 */

/**
 * Content 解析器
 * 分配 content/reasoning 到正确的类别
 */
export class ContentParser {
  /**
   * 解析 content
   * @param chunk 响应 chunk
   * @param isInThinkTag 当前是否在 think tag 中
   * @returns { contentDelta, reasoningDelta }
   */
  parse(
    chunk: IUnifiedResponse,
    isInThinkTag: boolean
  ): { contentDelta: string; reasoningDelta: string } {
    const contentDelta: string[] = []
    const reasoningDelta: string[] = []

    // 处理 reasoning 字段（直接作为推理内容）
    if (chunk.reasoning) {
      reasoningDelta.push(chunk.reasoning)
    }

    // 处理 content 字段
    if (chunk.content) {
      if (isInThinkTag) {
        // 在 think tag 内，content 作为推理内容
        reasoningDelta.push(chunk.content)
      } else {
        // 不在 think tag 内，content 作为普通文本
        contentDelta.push(chunk.content)
      }
    }

    return {
      contentDelta: contentDelta.join(''),
      reasoningDelta: reasoningDelta.join('')
    }
  }
}
