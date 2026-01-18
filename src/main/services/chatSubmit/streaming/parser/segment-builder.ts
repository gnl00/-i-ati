/**
 * Segment 构建器
 * 负责智能合并和创建 MessageSegment
 */

import type { SegmentBuilder as ISegmentBuilder } from './types'

export class SegmentBuilder implements ISegmentBuilder {
  /**
   * 追加 segment 到 segments 数组
   * 智能合并：如果最后一个 segment 类型相同，则合并；否则创建新 segment
   */
  appendSegment(
    segments: MessageSegment[],
    delta: string,
    type: 'text' | 'reasoning'
  ): MessageSegment[] {
    // 过滤空白内容
    if (!delta || delta.trim().length === 0) {
      return segments
    }

    const lastSegment = segments[segments.length - 1]

    // 如果最后一个 segment 类型相同，合并内容
    if (lastSegment?.type === type) {
      return [
        ...segments.slice(0, -1),
        {
          ...lastSegment,
          content: (lastSegment.content || '') + delta
        }
      ]
    } else {
      // 创建新 segment
      return [
        ...segments,
        {
          type,
          content: delta,
          timestamp: Date.now()
        }
      ]
    }
  }
}
