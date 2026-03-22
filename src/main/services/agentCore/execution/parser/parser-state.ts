/**
 * Parser 状态管理
 *
 * 职责：
 * - 集中管理所有 Parser 相关的状态
 * - 提供状态重置和克隆方法
 * - 建立单一数据源（Single Source of Truth）
 */

/**
 * Think Tag 词法状态。
 *
 * 只表示当前 tokenizer 是否位于 think tag 内部，
 * 不再把“只接受第一个 think tag”这种业务策略混进状态枚举。
 */
export enum ThinkTagMode {
  Outside = 'outside',
  Inside = 'inside'
}

/**
 * Parser 状态类
 * 集中管理所有 Parser 相关的状态
 */
export class ParserState {
  // Think Tag 词法状态
  thinkTagMode: ThinkTagMode = ThinkTagMode.Outside
  // 用于跨 chunk 拼接半截标签前缀，例如 "<thi" / "</thi"
  pendingThinkTagPrefix = ''
  // 当前策略：只有第一个完整 think block 会被当作 reasoning
  hasClosedThinkTag = false

  /**
   * 重置所有状态
   */
  reset(): void {
    this.thinkTagMode = ThinkTagMode.Outside
    this.pendingThinkTagPrefix = ''
    this.hasClosedThinkTag = false
  }

  /**
   * 克隆当前状态
   */
  clone(): ParserState {
    const newState = new ParserState()
    newState.thinkTagMode = this.thinkTagMode
    newState.pendingThinkTagPrefix = this.pendingThinkTagPrefix
    newState.hasClosedThinkTag = this.hasClosedThinkTag
    return newState
  }

  /**
   * 检查是否在 think tag 中
   */
  get isInThinkTag(): boolean {
    return this.thinkTagMode === ThinkTagMode.Inside
  }
}

/**
 * 创建初始 Parser 状态
 */
export function createInitialParserState(): ParserState {
  return new ParserState()
}
