/**
 * Parser 状态管理
 *
 * 职责：
 * - 集中管理所有 Parser 相关的状态
 * - 提供状态重置和克隆方法
 * - 建立单一数据源（Single Source of Truth）
 */

/**
 * Think Tag 状态枚举
 */
export enum ThinkTagState {
  NoThink = 'noThink',       // not in think tag
  InThink = 'inThink',       // inside think tag
  EndThink = 'endThink'      // think tag closed
}

/**
 * Parser 状态类
 * 集中管理所有 Parser 相关的状态
 */
export class ParserState {
  // Think Tag 解析状态
  thinkTagState: ThinkTagState = ThinkTagState.NoThink
  thinkTagBuffer: string = ''

  /**
   * 重置所有状态
   */
  reset(): void {
    this.thinkTagState = ThinkTagState.NoThink
    this.thinkTagBuffer = ''
  }

  /**
   * 克隆当前状态
   */
  clone(): ParserState {
    const newState = new ParserState()
    newState.thinkTagState = this.thinkTagState
    newState.thinkTagBuffer = this.thinkTagBuffer
    return newState
  }

  /**
   * 检查是否在 think tag 中
   */
  get isInThinkTag(): boolean {
    return this.thinkTagState === ThinkTagState.InThink
  }
}

/**
 * 创建初始 Parser 状态
 */
export function createInitialParserState(): ParserState {
  return new ParserState()
}
