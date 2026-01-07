  Streaming 状态机机制与数据流向文档

  一、概述

  streaming.ts 实现了一个基于状态机的流式对话处理系统，支持流式响应、推理标签（think tag）解析、工具调用等功能。

  二、状态机机制

  2.1 状态定义

  type StreamingPhase = 'idle' | 'receiving' | 'toolCall' | 'completed'

  四种状态：

  | 状态      | 说明             |
  |-----------|------------------|
  | idle      | 初始状态（默认） |
  | receiving | 正在接收流式响应 |
  | toolCall  | 正在处理工具调用 |
  | completed | 流式处理完成     |

  2.2 状态转换图

  ┌─────────────────────────────────────────────────────────────┐
  │                    StreamingSessionMachine                   │
  ├─────────────────────────────────────────────────────────────┤
  │                                                              │
  │   ┌────────┐     ┌──────────┐     ┌──────────┐             │
  │   │  idle  │────▶│ receiving│────▶│toolCall  │             │
  │   └────────┘     └──────────┘     └──────────┘             │
  │                         │                   │               │
  │                         │                   │               │
  │                         ▼                   ▼               │
  │                    ┌─────────┐       ┌──────────┐          │
  │                    │completed│◀──────│  (loop)  │          │
  │                    └─────────┘       └──────────┘          │
  │                                                              │
  └─────────────────────────────────────────────────────────────┘

  2.3 状态转换逻辑 (transition 方法)

  private transition(phase: StreamingPhase) {
    if (this.phase === phase) return  // 防止重复转换
    this.phase = phase

    if (phase === 'receiving') {
      this.callbacks?.onStateChange('streaming')
    } else if (phase === 'toolCall') {
      this.callbacks?.onStateChange('toolCall')
    } else if (phase === 'completed') {
      this.deps.setShowLoadingIndicator(false)
    }
  }

  状态转换触发点：

  1. idle → receiving: 在 runSingleRequest() 开始时触发
  2. receiving → toolCall: 当检测到工具调用时，在 start() 方法中触发
  3. toolCall → receiving: 工具调用完成后，循环回 runSingleRequest()
  4. receiving → completed: 没有更多工具调用时，在 start() 方法中触发

  三、核心数据结构

  3.1 StreamingState (流式状态)

  interface StreamingState {
    gatherContent: string           // 收集的文本内容
    gatherReasoning: string         // 收集的推理内容
    isContentHasThinkTag: boolean   // 是否包含 <think> 标签
    tools: {
      hasToolCall: boolean          // 是否有工具调用
      toolCalls: ToolCallItem[]     // 工具调用列表
      toolCallResults: any[]        // 工具调用结果
    }
  }

  3.2 StreamingContext (流式上下文)

  interface StreamingContext {
    request: PreparedRequest        // 请求配置
    session: SessionState           // 会话状态
    control: { signal: AbortSignal }// 中断控制
    meta: { model: Model }          // 元数据
    streaming: StreamingState       // 流式状态
  }

  四、数据流向

  4.1 完整数据流程图

  ┌─────────────────────────────────────────────────────────────────┐
  │                         启动流程                                 │
  └─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                      ┌─────────────────┐
                      │ createStreamingV2│
                      └────────┬────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ StreamingSessionMachine│
                    │       .start()        │
                    └──────────┬───────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
               ▼                               ▼
      ┌─────────────────┐           ┌─────────────────┐
      │ runSingleRequest│           │   工具调用循环    │
      └────────┬────────┘           └────────┬────────┘
               │                              │
               ▼                              │
      ┌─────────────────┐                     │
      │ 状态: receiving  │                     │
      └────────┬────────┘                     │
               │                              │
               ├────────────┬─────────────────┤
               │            │                 │
               ▼            ▼                 ▼
        ┌──────────┐  ┌──────────┐    ┌──────────┐
        │流式响应   │  │非流式响应 │    │检测到工具 │
        │处理      │  │处理      │    │调用      │
        └────┬─────┘  └────┬─────┘    └────┬─────┘
             │             │               │
             ▼             ▼               │
      ┌─────────────────────────┐          │
      │ handleStreamingChunk     │          │
      └──────────┬──────────────┘          │
                 │                         │
                 ├─────────────┬───────────┤
                 │             │           │
                 ▼             ▼           ▼
           ┌─────────┐   ┌─────────┐  状态: toolCall
           │文本内容  │   │推理内容  │      │
           │处理     │   │处理     │      ▼
           └────┬────┘   └────┬────┘  ┌─────────────┐
                │            │        │handleToolCalls│
                │            │        └──────┬────────┘
                │            │               │
                └────────────┴───────────────┤
                                           │
                      ┌────────────────────┘
                      │
                      ▼
            ┌─────────────────────┐
            │ 检查是否还有工具调用  │
            └──────────┬──────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
      ┌─────────┐           ┌──────────┐
      │ 继续循环  │           │ 状态:     │
      │ (发起新  │           │ completed │
      │  请求)  │           └──────────┘
      └─────────┘

  4.2 数据处理详细流程

  4.2.1 流式响应处理

  IUnifiedResponse (chunk)
         │
         ├────► toolCalls?
         │      │
         │      └──▶ 累积到 toolRuntime.toolCalls
         │
         ├────► content (有 <think> 标签?)
         │      │
         │      ├─ 是 ─▶ gatherReasoning (累积推理内容)
         │      │         │
         │      │         └─ 检测 </think> ─▶ 切换回文本模式
         │      │
         │      └─ 否 ─▶ gatherContent (累积文本内容)
         │                │
         │                └─ 检测 <think> ─▶ 切换到推理模式
         │
         └────► reasoning?
                │
                └──▶ gatherReasoning (直接累积推理内容)

  4.2.2 消息分段 (Segments) 处理

  Delta 内容
        │
        ├─ reasoningDelta ─▶ 更新/创建 reasoning segment
        │
        └─ textDelta ───────▶ 更新/创建 text segment

  Segment 合并策略:
    - 如果最后一个 segment 类型相同 → 合并内容
    - 否则 → 创建新 segment

  4.2.3 工具调用处理

  检测到工具调用
        │
        ▼
  flushToolCallPlaceholder (创建 assistant toolCall 消息)
        │
        ▼
  handleToolCalls (遍历 toolCalls)
        │
        ├─ 判断: embedded tool?
        │      │
        │      ├─ 是 ─▶ embeddedToolsRegistry.execute()
        │      │
        │      └─ 否 ─▶ invokeMcpToolCall()
        │
        ▼
  创建 tool role 消息 (包含执行结果)
        │
        ▼
  更新消息列表
        │
        ▼
  继续循环 → 发起下一次请求

  五、关键功能点

  5.1 Think 标签解析

  支持 <think>...</think> 推理标签的解析：

  - 检测到 <think> → 进入推理模式，内容收集到 gatherReasoning
  - 检测到 </think> → 退出推理模式，后续内容收集到 gatherContent

  5.2 工具调用循环

  状态机通过以下逻辑实现工具调用的循环处理：

  async start(): Promise<StreamingContext> {
    while (true) {
      await this.runSingleRequest()      // 1. 发起请求

      if (this.context.streaming.tools.hasToolCall &&
          this.context.streaming.tools.toolCalls.length > 0) {
        this.transition('toolCall')       // 2. 切换到工具调用状态
        await this.handleToolCalls()      // 3. 执行工具
      } else {
        break                             // 4. 无工具调用，退出循环
      }
    }

    this.transition('completed')
    return this.context
  }

  5.3 消息分段 (Segment-based)

  使用 segments 数组存储不同类型的内容：

  - reasoning: 推理内容
  - text: 文本内容
  - toolCall: 工具调用结果

  六、数据存储位置

  | 数据            | 存储位置                                | 用途                         |
  |-----------------|-----------------------------------------|------------------------------|
  | gatherContent   | context.streaming.gatherContent         | 累积普通文本内容             |
  | gatherReasoning | context.streaming.gatherReasoning       | 累积推理内容                 |
  | toolCalls       | context.streaming.tools.toolCalls       | 待执行的工具调用列表         |
  | toolCallResults | context.streaming.tools.toolCallResults | 工具调用执行结果             |
  | messageEntities | context.session.messageEntities         | 消息实体列表                 |
  | chatMessages    | context.session.chatMessages            | 聊天消息列表 (用于 API 请求) |

  七、外部依赖

  - Store: useChatStore - 获取当前消息状态
  - Request: unifiedChatRequest - 统一的聊天请求接口
  - Tools: embeddedToolsRegistry, invokeMcpToolCall - 工具执行
  - Utils: formatWebSearchForLLM, normalizeToolArgs - 工具调用辅助函数