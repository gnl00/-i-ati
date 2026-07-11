# Agent v2 统一架构设计

> 状态：讨论中（Draft）
> 日期：2026-06-07
> 目标：设计一套同时兼容主 Agent（流式、事件、budget）和轻量 Agent（title、compression）的统一架构

---

## 1. 问题：当前的双系统分裂

当前项目存在两套独立的 Agent 实现：

| | 轻量 `agent()` | 完整 `AgentRuntime` |
|---|---|---|
| 位置 | `src/main/agent/agent.ts`（277 行） | `src/main/agent/runtime/`（12+ 文件） |
| 使用场景 | Title、Compression 等后台小任务 | 主聊天 Agent / Subagent |
| 执行方式 | `while(true)` 简单循环 | `AgentLoop` 状态机 + wiring |
| 停止策略 | `!loop → stop` / `round≥25 → stop` | `budgetPolicy`: soft 25 / hard 80 / extend +5 |
| Dispatch | `unifiedChatRequest` 非流式 | 流式 dispatch + events + transcript |
| 返回值 | `AgentResult`（type + toolCalls） | `AgentLoopResult`（status + transcript + step） |
| 循环代码 | 手写，与 Full 重复 | 写死在 AgentLoop 中 |

**核心问题**：两套系统的循环骨架几乎一样，但因设计时间不同、入口不同，导致代码分叉、心智负担加重。

---

## 2. 新架构：三层模型

所有 Agent 场景统一为：

```
AgentRequest ──► AgentCore ──► AgentResponse<T>
                    │
        ┌───────────┼───────────┐
        │           │           │
  DispatchStrategy  LoopPolicy  ResponseBuilder<T>
```

**组成要素**：

| 层 | 职责 | 说明 |
|---|---|---|
| **AgentRequest** | 输入 | context、prompt、tools、model 配置。与 mode 无关 |
| **AgentCore** | 处理 | 唯一的 while(true) 循环。工具执行、消息注入、usage 累计 |
| **AgentResponse\<T\>** | 输出 | loop 结束后的确定性输出。泛型 T 由 ResponseBuilder 决定 |

---

## 3. AgentCore — 唯一的循环

AgentCore 是 **concrete class**，不靠继承。差异通过构造函数注入三种策略：

```typescript
class AgentCore<TResponse> {
  constructor(
    private dispatch: DispatchStrategy,
    private loopPolicy: LoopPolicy,
    private responseBuilder: ResponseBuilder<TResponse>
  ) {}

  async run(request: AgentRequest): Promise<TResponse> {
    let messages = [...request.messages]
    let round = 0
    let totalUsage: ITokenUsage | undefined
    const allToolCalls: ToolCallResult[] = []

    while (true) {
      // 1. 构建请求
      const req = buildUnifiedRequest(request, messages)
      
      // 2. dispatch — 子类不知道流式/非流式差异
      const result = await this.dispatch.dispatch(req)
      totalUsage = accumulateUsage(totalUsage, result.usage)

      // 3. 工具调用？
      if (result.toolCalls.length > 0) {
        const executed = await executeTools(result.toolCalls)
        allToolCalls.push(...executed)

        // 4. 停止策略 — 由注入的 LoopPolicy 决策
        const decision = this.loopPolicy.evaluate(round, allToolCalls)
        if (decision === 'stop') {
          return this.responseBuilder.buildIntermediate(allToolCalls, totalUsage)
        }

        // 5. 注入工具结果，继续
        injectToolResults(messages, result.toolCalls, executed)
        round++
        continue
      }

      // 6. 文本输出 — 结束
      return this.responseBuilder.buildComplete(result.content, totalUsage)
    }
  }
}
```

### 循环体中的共享实现（AgentCore 私有方法）

| 方法 | 说明 |
|---|---|
| `buildUnifiedRequest(request, messages)` | 将 AgentRequest + 当前 messages 拼成 `UnifiedRequest` |
| `executeTools(toolCalls)` | 参数解析 → handler 查找 → 执行 → 结果包装 |
| `injectToolResults(messages, toolCalls, results)` | 将 tool_call + tool result 追加到 messages 数组 |
| `accumulateUsage(base, delta)` | Token 累计 |

---

## 4. 三种注入策略

### 4.1 DispatchStrategy

```typescript
interface DispatchStrategy {
  dispatch(req: UnifiedRequest): Promise<{
    content: string
    toolCalls: IToolCall[]
    usage: ITokenUsage
  }>
}
```

| 实现 | 内部行为 |
|---|---|
| **NonStreamingDispatch** | 直接调用 `unifiedChatRequest(req, null, noop, noop)`，等待完整响应。零副作用 |
| **StreamingDispatch** | 流式 dispatch。内部处理 chunk 回调（emit events、record transcript），流结束拼出完整 response 返回 |

**关键**：AgentCore 不需要知道 dispatch 内部是流式还是非流式，它只拿到 `Promise<{ content, toolCalls, usage }>`。

### 4.2 LoopPolicy

```typescript
interface LoopPolicy {
  evaluate(round: number, toolResults: ToolCallResult[]): 'continue' | 'stop'
}
```

| 实现 | 逻辑 |
|---|---|
| **SimpleLoopPolicy** | `!loop → stop` / `round >= maxRounds → stop` / 否则 `continue`。配置: `{ maxRounds: number, loop: boolean }` |
| **BudgetLoopPolicy** | soft 25（可续）/ hard 80（硬停）。每次 progress 扩 5。配置: `{ soft: number, hard: number, extend: number }` |

### 4.3 ResponseBuilder\<T\>

```typescript
interface ResponseBuilder<T> {
  buildComplete(content: string, usage: ITokenUsage): T
  buildIntermediate(toolCalls: ToolCallResult[], usage: ITokenUsage): T
}
```

| 实现 | `buildComplete` | `buildIntermediate` |
|---|---|---|
| **LiteResponseBuilder** | `{ type: 'text', content, usage }` | `{ type: 'tool_call', toolCalls, usage }` |
| **FullResponseBuilder** | `{ status: 'completed', content, usage, transcript, timings }` | `{ status: 'stopped', toolCalls, usage, reason: 'budget' }` |

---

## 5. AgentRequest — 唯一入口

```typescript
interface AgentRequest {
  // 身份
  name: string

  // 上下文
  systemPrompt: string
  messages: UnifiedRequestMessage[]

  // 工具（已解析，由调用方负责从 registry 查或直接传 ToolDefinition[]）
  tools: ToolDefinition[]

  // 模型连接
  model: {
    pluginId: string
    baseUrl: string
    apiKey: string
    modelId: string
    modelType: string
  }

  // 请求配置
  overrides?: RequestOverrides
  extensions?: PayloadExtensions
  maxTokens?: number
  thinking?: { enabled: boolean }
}
```

**没有 `mode` 字段。** mode 不是 request 的属性。同一个 `AgentRequest` 可以交给 LiteAgent 或 FullAgent 跑——结果形状不同，但输入一样。差异由构造 AgentCore 时注入的策略决定。

---

## 6. 两种标准配置

```typescript
// ─── LiteAgent — 一行工厂 ───
function createLiteAgent(maxRounds = 25, loop = false): AgentCore<LiteResult> {
  return new AgentCore(
    new NonStreamingDispatch(),
    new SimpleLoopPolicy({ maxRounds, loop }),
    new LiteResponseBuilder()
  )
}

// ─── FullAgent — 需要外部 wiring ───
function createFullAgent(deps: {
  dispatcher: StreamingDispatcher
  events: EventEmitter
  transcript: TranscriptManager
  budget: { soft: number; hard: number; extend: number }
}): AgentCore<FullResult> {
  return new AgentCore(
    new StreamingDispatch(deps.dispatcher, deps.events, deps.transcript),
    new BudgetLoopPolicy(deps.budget),
    new FullResponseBuilder(deps.transcript)
  )
}
```

---

## 7. 运行时全景

```
时间线 ──────────────────────────────────────────────────────────────►

  用户消息到达
       │
       ▼
  ┌─────────────────────────────────────────┐
  │  MainAgent (FullAgent 实例)              │
  │  AgentCore.run(request)                 │
  │                                         │
  │  dispatch ──► streaming chunk ──► UI    │
  │       │                                 │
  │       ▼                                 │
  │  tool_call? ──► execute ──► inject      │
  │       │                                 │
  │       ▼                                 │
  │  loopPolicy.evaluate ──► continue/stop   │
  │       │                                 │
  │       ▼                                 │
  │  FullResponse ──► caller                │
  └─────────────────────────────────────────┘
       │
       │  ┌─────────────────────────────┐
       ├──► TitleAgent.run(titleReq)    │  ← 并行，短生命周期
       │   └──► LiteResult              │
       │                                │
       │  ┌─────────────────────────────┐
       └──► CompressionAgent.run(comp)  │  ← 并行，短生命周期
           └──► LiteResult              │
       │
       ▼
  返回用户
```

---

## 8. 与旧架构的对应（迁移路径）

| 旧概念 | 新位置 | 说明 |
|---|---|---|
| `agent.ts` (277 行) | AgentCore + NonStreamingDispatch + SimpleLoopPolicy + LiteResponseBuilder | 循环体提取；dispatch/policy/builder 各归其位 |
| `AgentRuntime` + `AgentLoop` | AgentCore + StreamingDispatch + BudgetLoopPolicy + FullResponseBuilder | 策略不同，核心相同 |
| `AgentRuntimeContext` (12+ wiring) | StreamingDispatch 构造参数 | wiring 封在 dispatch 内部，不暴露给 core |
| `requestSpecSource` / `runDescriptorSource` / `loopInputBootstrapper` | StreamingDispatch 内部实现 | 不再需要独立的 wiring step |
| `AgentLoopDependencies` | AgentCore 内部 `executeTools()` 方法 | 工具执行回归 core，不再外挂 |

### 不再需要的东西

- `mode: 'lite' | 'full'` 参数 → 策略注入代替
- `AbstractAgent` 类继承 → AgentCore 是 concrete class
- 两个 `while(true)` 循环 → 只有一个，在 AgentCore
- 两个独立入口 → 唯一入口 `agentCore.run(request)`

---

## 9. 后续讨论方向

- [ ] AgentRequest 字段冻结：确认覆盖 Lite 和 Full 的完整需求
- [ ] DispatchStrategy 细化：NonStreamingDispatch 和 StreamingDispatch 的具体接口与构造函数
- [ ] LoopPolicy 细化：SimpleLoopPolicy 的 `loop` 参数语义；BudgetLoopPolicy 的 extend 触发条件
- [ ] ResponseBuilder 细化：LiteResult 与 FullResult 的精确类型定义
- [ ] AgentCore 实现细节：`buildUnifiedRequest` 和 `executeTools` 的精确签名
- [ ] 迁移计划：先实现 AgentCore 框架 → 替换 agent.ts → 替换 AgentRuntime
- [ ] 测试策略：AgentCore 的 mock dispatch/policy/builder 测试
