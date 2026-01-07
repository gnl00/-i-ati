详细的事件设计是更优的方案。

1. UI 响应的精确性

// 详细设计：Hook 可以精确控制每个阶段
eventBus.on(ChatEventType.MESSAGE_RECEIVE, ({ delta }) => {
// 只更新文本内容，不影响其他状态
updateMessageContent(delta)
})

eventBus.on(ChatEventType.MESSAGE_COMPLETE, ({ message }) => {
// 显示完成后的 UI（如重试按钮、复制按钮等）
showMessageActions(message)
})

eventBus.on(ChatEventType.TOOL_CALL_START, ({ toolName }) => {
// 显示工具调用状态
showToolProgress(toolName, 'executing')
})

eventBus.on(ChatEventType.TOOL_CALL_PROGRESS, ({ progress, message }) => {
// 更新进度条
updateProgress(progress, message)
})

对比简化设计：所有信息都混在 streaming.chunk 中，UI 需要自己解析和判断。

2. 易于扩展和测试

// 未来添加新功能：音频播放
eventBus.on(ChatEventType.MESSAGE_RECEIVE, ({ delta }) => {
updateText(delta)
// 播放打字音效
playTypingSound()
})

// 未来添加新功能：分析工具调用耗时
eventBus.on(ChatEventType.TOOL_CALL_START, ({ toolCallId }) => {
timingStore.start(toolCallId)
})

eventBus.on(ChatEventType.TOOL_CALL_COMPLETE, ({ toolCallId }) => {
const duration = timingStore.end(toolCallId)
analytics.track('tool_duration', { duration })
})

3. 责任分离

- MESSAGE_RECEIVE：StreamingOrchestrator 发出（低层）
- MESSAGE_UPDATE：MessageService 发出（中层）
- MESSAGE_COMPLETE：ChatSubmissionService 发出（高层）

不同层次的服务发出不同的事件，职责清晰。

---
当前设计的改进建议

让我先检查现有的代码结构，看看是否有一些事件需要调整：

⏺ Search(pattern: "MESSAGE_RECEIVE|MESSAGE_UPDATE|MESSAGE_COMPLETE", path: "src/renderer/src")
⎿  Found 2 files (ctrl+o to expand)

⏺ Read(src/renderer/src/hooks/chatSubmit/streaming/orchestrator.ts)
⎿  Read 341 lines

⏺ 基于现有代码分析，我发现当前的事件设计存在一些问题。让我提出一个更详细的改进版本：

改进的事件类型设计

// src/renderer/src/domain/events/ChatEvents.ts

/**
* 聊天相关事件类型
*/
export enum ChatEventType {
// ==================== 消息事件 ====================
/** 消息创建（用户消息或助手消息占位符） */
MESSAGE_CREATED = 'message.created',

/** 收到文本片段（流式传输中的增量） */
MESSAGE_TEXT_DELTA = 'message.text.delta',

/** 收到推理片段 */
MESSAGE_REASONING_DELTA = 'message.reasoning.delta',

/** 消息更新（通用更新，如状态变化） */
MESSAGE_UPDATED = 'message.updated',

/** 消息完成（流式传输结束） */
MESSAGE_COMPLETED = 'message.completed',

/** 消息失败（如网络错误） */
MESSAGE_FAILED = 'message.failed',

// ==================== 流式处理事件 ====================
/** 开始流式请求 */
STREAMING_REQUEST_START = 'streaming.request.start',

/** 流式请求结束（成功或失败） */
STREAMING_REQUEST_END = 'streaming.request.end',

/** 流式处理被中止 */
STREAMING_ABORTED = 'streaming.aborted',

// ==================== 工具调用事件 ====================
/** 检测到工具调用（在 chunk 中发现） */
TOOL_CALL_DETECTED = 'tool.call.detected',

/** 工具调用开始执行 */
TOOL_CALL_STARTED = 'tool.call.started',

/** 工具调用进度更新 */
TOOL_CALL_PROGRESS = 'tool.call.progress',

/** 工具调用完成 */
TOOL_CALL_COMPLETED = 'tool.call.completed',

/** 工具调用失败 */
TOOL_CALL_FAILED = 'tool.call.failed',

/** 工具调用结果已添加到消息 */
TOOL_CALL_RESULT_ADDED = 'tool.call.result.added',

// ==================== 会话事件 ====================
/** 会话创建 */
SESSION_CREATED = 'session.created',

/** 会话更新（如标题生成） */
SESSION_UPDATED = 'session.updated',

// ==================== 状态事件 ====================
/** 请求周期状态变化 */
REQUEST_STATE_CHANGED = 'request.state.changed',
}

/**
* 事件数据接口
*/
export interface ChatEventData {
// ==================== 消息事件数据 ====================
[ChatEventType.MESSAGE_CREATED]: {
    message: MessageEntity
    source: 'user' | 'assistant' | 'system'
}

[ChatEventType.MESSAGE_TEXT_DELTA]: {
    messageId: string
    delta: string                    // 增量文本
    accumulated: string              // 累积文本
    timestamp: number
}

[ChatEventType.MESSAGE_REASONING_DELTA]: {
    messageId: string
    delta: string                    // 增量推理内容
    accumulated: string              // 累积推理内容
    timestamp: number
}

[ChatEventType.MESSAGE_UPDATED]: {
    messageId: string
    updates: Partial<MessageEntity>
    reason?: string                  // 更新原因
}

[ChatEventType.MESSAGE_COMPLETED]: {
    messageId: string
    message: MessageEntity
    duration: number                 // 完成耗时
    hasToolCalls: boolean            // 是否包含工具调用
}

[ChatEventType.MESSAGE_FAILED]: {
    messageId: string
    error: Error
    phase: 'request' | 'parsing' | 'streaming'
}

// ==================== 流式处理事件数据 ====================
[ChatEventType.STREAMING_REQUEST_START]: {
    requestId: string
    model: string
    hasTools: boolean
}

[ChatEventType.STREAMING_REQUEST_END]: {
    requestId: string
    success: boolean
    duration: number
    chunksProcessed: number
    error?: Error
}

[ChatEventType.STREAMING_ABORTED]: {
    requestId: string
    reason: 'user_cancel' | 'timeout' | 'error'
}

// ==================== 工具调用事件数据 ====================
[ChatEventType.TOOL_CALL_DETECTED]: {
    messageId: string
    toolCalls: Array<{
    id: string
    name: string
    args: any
    }>
}

[ChatEventType.TOOL_CALL_STARTED]: {
    messageId: string
    toolCallId: string
    toolName: string
    args: any
    concurrent: number              // 当前并发数
}

[ChatEventType.TOOL_CALL_PROGRESS]: {
    messageId: string
    toolCallId: string
    toolName: string
    phase: 'executing' | 'fetching' | 'processing'
    message?: string
}

[ChatEventType.TOOL_CALL_COMPLETED]: {
    messageId: string
    toolCallId: string
    toolName: string
    result: any
    duration: number
    cost?: number
}

[ChatEventType.TOOL_CALL_FAILED]: {
    messageId: string
    toolCallId: string
    toolName: string
    error: Error
    duration: number
}

[ChatEventType.TOOL_CALL_RESULT_ADDED]: {
    messageId: string
    toolCallId: string
    toolName: string
    formattedResult: string
}

// ==================== 会话事件数据 ====================
[ChatEventType.SESSION_CREATED]: {
    chatId: number
    chatUuid: string
    chatEntity: ChatEntity
}

[ChatEventType.SESSION_UPDATED]: {
    chatId: number
    updates: Partial<ChatEntity>
    trigger: 'title_generated' | 'settings_changed' | 'manual'
}

// ==================== 状态事件数据 ====================
[ChatEventType.REQUEST_STATE_CHANGED]: {
    requestId: string
    from: 'idle' | 'preparing' | 'requesting' | 'streaming' | 'tool_executing' | 'finalizing'
    to: 'idle' | 'preparing' | 'requesting' | 'streaming' | 'tool_executing' | 'finalizing'
}
}

关键改进点

1. 消息事件更细粒度

// 旧设计：只有 MESSAGE_RECEIVE
[ChatEventType.MESSAGE_RECEIVE]: {
messageId: string
content: string      // 混合了文本和推理
delta: string
}

// 新设计：区分文本和推理
[ChatEventType.MESSAGE_TEXT_DELTA]: {
messageId: string
delta: string
accumulated: string
}

[ChatEventType.MESSAGE_REASONING_DELTA]: {
messageId: string
delta: string
accumulated: string
}

好处：
- UI 可以分开渲染推理内容和正文内容
- 支持折叠/展开推理内容
- 便于分析推理过程

2. 工具调用事件更详细

// 检测到工具调用（但还没执行）
TOOL_CALL_DETECTED

// 开始执行
TOOL_CALL_STARTED

// 执行中（可以有多次进度更新）
TOOL_CALL_PROGRESS

// 执行完成
TOOL_CALL_COMPLETED

// 结果添加到消息
TOOL_CALL_RESULT_ADDED

好处：
- UI 可以显示工具调用的完整生命周期
- 支持动画效果（如检测到 → 执行中 → 完成）
- 便于调试工具调用流程

3. 明确的状态机

type RequestState =
| 'idle'           // 空闲
| 'preparing'      // 准备（构建请求）
| 'requesting'     // 发送请求
| 'streaming'      // 流式传输
| 'tool_executing' // 执行工具
| 'finalizing'     // 收尾（保存、生成标题）

[ChatEventType.REQUEST_STATE_CHANGED]: {
from: RequestState
to: RequestState
}

好处：
- UI 可以精确显示当前状态
- 便于实现状态机图
- 调试时可以追踪状态流转

4. 元数据丰富

每个事件都包含足够的上下文信息：

[ChatEventType.MESSAGE_COMPLETED]: {
messageId: string
message: MessageEntity
duration: number          // 新增：耗时
hasToolCalls: boolean     // 新增：是否包含工具调用
tokens?: {               // 新增：token 统计
    input: number
    output: number
}
}

与现有代码的映射

// StreamingOrchestrator.applyParseResult()
private applyParseResult(result: ParseResult): void {
// 原有逻辑...

// 发出事件
if (result.reasoningDelta.trim()) {
    this.eventBus.emit(ChatEventType.MESSAGE_REASONING_DELTA, {
    messageId: this.messageId,
    delta: result.reasoningDelta,
    accumulated: this.accumulatedReasoning,
    timestamp: Date.now()
    })
}

if (result.contentDelta.trim()) {
    this.eventBus.emit(ChatEventType.MESSAGE_TEXT_DELTA, {
    messageId: this.messageId,
    delta: result.contentDelta,
    accumulated: this.accumulatedContent,
    timestamp: Date.now()
    })
}
}

// StreamingOrchestrator.executeToolCalls()
private async executeToolCalls(): Promise<void> {
const executor = new ToolExecutor({
    onProgress: (progress) => {
    if (progress.phase === 'started') {
        this.eventBus.emit(ChatEventType.TOOL_CALL_STARTED, {
        messageId: this.messageId,
        toolCallId: progress.id,
        toolName: progress.name,
        args: progress.args,
        concurrent: executor.runningCount
        })
    } else if (progress.phase === 'completed') {
        this.eventBus.emit(ChatEventType.TOOL_CALL_COMPLETED, {
        messageId: this.messageId,
        toolCallId: progress.id,
        toolName: progress.name,
        result: progress.result,
        duration: progress.cost,
        cost: progress.result?.cost
        })
    }
    }
})
}

潜在问题和解决方案

问题 1：事件过多导致性能问题

解决方案：
- 使用事件节流/防抖
- 高频事件（如 MESSAGE_TEXT_DELTA）使用 requestAnimationFrame 批处理
- 提供"精简模式"配置

// 配置选项
interface EventBusConfig {
throttleHighFrequency?: boolean    // 节流高频事件
batchDeltaUpdates?: boolean         // 批处理增量更新
enableDebugLogging?: boolean        // 调试日志
}

问题 2：事件订阅管理复杂

解决方案：
- 提供 Hook 封装常用事件组合
- 提供 EventWatcher 工具类

// 封装常用订阅组合
function useMessageEvents(messageId: string, callbacks: {
onTextDelta?: (delta: string) => void
onReasoningDelta?: (delta: string) => void
onComplete?: (message: MessageEntity) => void
}) {
useEffect(() => {
    const unsubs = []

    if (callbacks.onTextDelta) {
    unsubs.push(
        eventBus.on(ChatEventType.MESSAGE_TEXT_DELTA, ({ messageId, delta }) => {
        if (messageId === messageId) callbacks.onTextDelta!(delta)
        })
    )
    }

    // ... 其他事件

    return () => unsubs.forEach(fn => fn())
}, [messageId])
}

---