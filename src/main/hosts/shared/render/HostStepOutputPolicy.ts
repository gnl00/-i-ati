/**
 * HostStepOutputPolicy
 *
 * 集中「单个 step 的 runtime 事实 -> 外部宿主可见性」的规则。
 *
 * 归属：
 * - 这一层是 host-facing output policy，合法归属在 `hosts/`（不在 core runtime）。
 * - 它回答"某个 tool / segment 是否对外可见 / 是否只做 tool-activity 展示"。
 *
 * 背景（P1）：
 * - 此前 hidden-tool 规则在两处硬编码重复：
 *   - AgentRenderSegmentMapper 的 DEFAULT_HIDDEN_TOOL_NAMES
 *   - TelegramRenderResponder 的 TELEGRAM_HIDDEN_TOOL_MESSAGES
 * - 现在两个 host 共用同一份 HostStepOutputPolicy，避免规则漂移。
 */

/**
 * 默认对外隐藏的 tool 名单。
 *
 * 这些 tool 的执行是运行时事实，但不应作为可见 transcript / 宿主消息呈现
 * （例如 emotion_report 只用于驱动情绪状态，不是用户可见回答的一部分）。
 */
export const DEFAULT_HIDDEN_TOOL_NAMES: ReadonlySet<string> = new Set(['emotion_report'])

export type HostStepOutputPolicyInput = ReadonlySet<string> | string[]

export class HostStepOutputPolicy {
  private readonly hiddenToolNames: ReadonlySet<string>

  constructor(hiddenToolNames: HostStepOutputPolicyInput = DEFAULT_HIDDEN_TOOL_NAMES) {
    this.hiddenToolNames = Array.isArray(hiddenToolNames)
      ? new Set(hiddenToolNames)
      : hiddenToolNames
  }

  /**
   * 该 tool 是否对外隐藏（不生成可见 segment / 不发送宿主消息）。
   */
  isToolHidden(toolName: string): boolean {
    return this.hiddenToolNames.has(toolName)
  }
}
