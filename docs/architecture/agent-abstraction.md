# Agent Abstraction Layer

> **状态**: 设计稿 · **最后更新**: 2026-06-06
> **本文定义 `agent()` 抽象层的设计，作为所有轻量级 agent 调用的统一入口**

---

## 1. 动机

### 1.1 当前问题

当前代码中有多处需要独立发送模型请求的场景，每个场景都在重复相同的流程：

```
                  generateTitle()         MessageCompression      未来场景 N
                  ┌──────────────┐        ┌──────────────────┐    ┌──────────┐
adapter 路由      │ resolveModel │        │ resolveModel     │    │ ...      │
                  ├──────────────┤        ├──────────────────┤    │          │
override 过滤     │ filterTitles │        │ filterOverrides  │    │ 重复     │
                  ├──────────────┤        ├──────────────────┤    │          │
请求构建          │ createReq    │        │ createReq        │    │ 相同     │
                  ├──────────────┤        ├──────────────────┤    │          │
请求发送          │ sendRequest  │        │ sendRequest      │    │ 模式     │
                  ├──────────────┤        ├──────────────────┤    │          │
响应解析          │ parseResp    │        │ parseResp        │    │          │
                  └──────────────┘        └──────────────────┘    └──────────┘
```

每次都在重复：
- **adapter 路由**: 从 model + account + providerDefinition 解析 adapterPluginId
- **override 过滤**: thinking/reasoning 等字段的过滤和 sanitize
- **请求构建**: `createUnifiedRequest` / `createUnifiedTextRequest`
- **请求发送**: `unifiedChatRequest`
- **响应解析**: 手动解析 response.content / tool_calls

更重要的是：**工具支持完全缺失**。每一个独立场景如果要使用工具，都得自己实现工具注入、工具调用执行、结果回注的完整循环。

### 1.2 目标

- 提供一个 `agent()` 函数，封装「构建请求 → 发送 → 处理工具调用 → 返回结果」的通用流程
- **工具调用**作为一等公民，内置支持
- 调用方只需提供：**身份、提示词、工具列表、输入消息**
- 让 Title Agent 成为第一个消费者，后续可扩展到压缩、研究等场景

---

## 2. The `agent()` Function

### 2.1 函数签名

```typescript
export async function agent(
  name: string,
  systemPrompt: string,
  tools: string[],
  messages: UnifiedRequestMessage[],
  loop?: boolean,
  options?: AgentOptions
): Promise<AgentResult>
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | `string` | — | Agent 标识，用于日志/追踪/调试 |
| `systemPrompt` | `string` | — | 系统级提示词，定义 agent 行为边界 |
| `tools` | `string[]` | — | 工具名称列表，从 `embeddedToolsRegistry` 解析定义 |
| `messages` | `UnifiedRequestMessage[]` | — | 输入消息序列（不含 system prompt） |
| `loop` | `boolean` | `false` | `true` = 回注工具结果继续轮询；`false` = 执行工具后即返回 |
| `options` | `AgentOptions` | — | 可选：model、account、providerDefinition 等 |

### 2.2 AgentOptions

```typescript
interface AgentOptions {
  /** 模型标识（从 config 解析）。不传则调用方必须提供 account + providerDefinition */
  model?: AccountModel

  /** Provider 账号 */
  account?: ProviderAccount

  /** Provider 定义（含 adapter 路由信息） */
  providerDefinition?: ProviderDefinition

  /** requestOverrides 过滤函数。不传则全部透传 */
  sanitizeOverrides?: (overrides: ProviderDefinition['requestOverrides']) => ProviderDefinition['requestOverrides']

  /** 额外的 unified request options */
  requestOptions?: {
    maxTokens?: number
    thinking?: UnifiedRequestThinkingOption
  }
}
```

### 2.3 返回值

```typescript
interface AgentResult {
  /** 响应类型 */
  type: 'tool_call' | 'text' | 'error'

  /** 文本响应（无 tool_call 时 / 最后一轮的文本） */
  content?: string

  /** 已执行的工具调用结果列表 */
  toolCalls?: AgentToolCallResult[]

  /** Token 用量（所有轮次累计） */
  usage?: ITokenUsage

  /** 错误信息（type === 'error' 时） */
  error?: string
}

interface AgentToolCallResult {
  name: string
  args: Record<string, any>
  result: any
  success: boolean
}
```

---

## 3. The `loop` Parameter

### 3.1 设计思路

`loop` 是 boolean，控制 agent 在工具调用后的行为。

> `loop: 0`（数字）不需要——`tools: []` 已表达「纯文本模式」。

| `loop` | 行为 | 说明 |
|--------|------|------|
| `false`（默认） | 一轮 model call → 有 tool_call 则执行 → **不回注** → 返回 | Title Agent：模型一次调用 `chat_set_title` 即完成 |
| `true` | 一轮 → 有 tool_call → 执行 + **回注结果到 messages** → 继续，直到模型不再调工具 | Research Agent：搜索 → 读页面 → 综合 |
| `tools: []` | 不注入工具，模型只返回文本 | 纯文本生成 |

### 3.2 安全限制

`loop: true` 时模型可能无限循环调工具。实现中加入硬上限：

```
MAX_ROUNDS = 25  // loop: true 时最多 25 轮
```

超过上限时强制退出，返回已收集的所有 tool_call 结果。

### 3.3 循环流程

```
agent(name, prompt, tools, messages, false)
  │
  ├─ buildRequest(messages + tools)
  ├─ send(request) → response
  │
  ├─ if tool_calls:
  │    └─ 执行所有 tool_call
  │    └─ loop 是 false? → 不回注 → 返回 { type: 'tool_call' }
  │
  └─ else: → 返回 { type: 'text', content }
```

```
agent(name, prompt, tools, messages, true)
  │
  ├─ round = 0
  │
  ├─ while round < MAX_ROUNDS:
  │    ├─ buildRequest(messages + tools)
  │    ├─ send(request) → response
  │    │
  │    ├─ if tool_calls:
  │    │    ├─ 执行所有 tool_call
  │    │    ├─ round++
  │    │    ├─ 回注 tool results 到 messages
  │    │    └─ continue
  │    │
  │    └─ else: → break
  │
  └─ 返回 { type: 'tool_call' | 'text', ... }
```

### 3.4 关键细节

**`loop: false`（默认）且工具被调用**：
```
Model call → chat_set_title({ title: "xxx" })
  → Execute handler → DB 写入 ✅
  → loop === false → 不回注 → 返回 { type: 'tool_call' }
```
工具副作用已完成（DB 有了新标题）。不需要回注继续。

**`loop: true` 且模型需要多次调用**：
```
Round 1:
  → Model call → search({ query: "..." })
  → Execute → 回注结果到 messages
  → continue

Round 2:
  → Model call（上下文包含搜索结果）
  → 返回文本分析 → 无 tool_call
  → break → 返回 { type: 'text', content }
```

---

## 4. 内部流程

### 4.1 步骤分解

```typescript
const MAX_LOOP_ROUNDS = 25

async function agent(
  name: string,
  systemPrompt: string,
  tools: string[],
  messages: UnifiedRequestMessage[],
  loop = false,
  options: AgentOptions = {}
): Promise<AgentResult> {
  // 1. 解析工具定义
  const toolDefinitions = tools.length > 0
    ? embeddedToolsRegistry.getTools(tools)
    : []

  // 2. 构建消息队列（system prompt + 输入消息）
  const agentMessages: UnifiedRequestMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ]

  // 3. 解析模型上下文（从 options 或 config）
  const modelContext = resolveModelContext(options)

  // 4. 构建 request + override 过滤
  const requestOverrides = options.sanitizeOverrides
    ? options.sanitizeOverrides(modelContext.providerDefinition.requestOverrides)
    : modelContext.providerDefinition.requestOverrides

  // 5. 进入请求循环
  let round = 0
  const allToolCalls: AgentToolCallResult[] = []
  let lastTextContent: string | undefined

  while (true) {
    const req = createUnifiedRequest({
      adapterPluginId: modelContext.providerDefinition.adapterPluginId,
      baseUrl: modelContext.account.apiUrl,
      apiKey: modelContext.account.apiKey,
      model: modelContext.model.id,
      messages: agentMessages,
      tools: toolDefinitions,
      stream: false,
      payloadExtensions: modelContext.providerDefinition.payloadExtensions,
      requestOverrides,
      options: options.requestOptions
    })

    const response = await unifiedChatRequest(req, null, () => {}, () => {})

    if (response.tool_calls?.length > 0 && loop) {
      // loop: true → 执行 + 回注 + 继续
      for (const tc of response.tool_calls) {
        const handler = embeddedToolsRegistry.getHandler(tc.function.name)
        const args = JSON.parse(tc.function.arguments)
        try {
          const result = await handler(args)
          allToolCalls.push({ name: tc.function.name, args, result, success: true })
          agentMessages.push({ role: 'assistant', content: null, tool_calls: [tc] })
          agentMessages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
        } catch (err) {
          allToolCalls.push({ name: tc.function.name, args, result: null, success: false })
        }
      }

      round++
      if (round >= MAX_LOOP_ROUNDS) break  // 安全上限

    } else if (response.tool_calls?.length > 0 && !loop) {
      // loop: false → 执行工具（不回注），立即返回
      for (const tc of response.tool_calls) {
        const handler = embeddedToolsRegistry.getHandler(tc.function.name)
        const args = JSON.parse(tc.function.arguments)
        try {
          const result = await handler(args)
          allToolCalls.push({ name: tc.function.name, args, result, success: true })
        } catch (err) {
          allToolCalls.push({ name: tc.function.name, args, result: null, success: false })
        }
      }
      break

    } else {
      // 模型未调用工具 → 结束
      lastTextContent = response.content
      break
    }
  }

  // 6. 返回结果
  if (allToolCalls.length > 0) {
    return { type: 'tool_call', toolCalls: allToolCalls, usage: response?.usage }
  }
  return { type: 'text', content: lastTextContent ?? '', usage: response?.usage }
}
```

### 4.2 边界处理

| 场景 | 行为 |
|------|------|
| `tools` 为空数组 | 不注入工具，模型只返回文本 |
| 工具不存在于 registry | 跳过（不注入该工具） |
| handler 抛出异常 | `success: false`，不阻断循环 |
| API 返回错误 | `type: 'error'`，携带 error 信息 |
| 空响应/无内容 | `type: 'text'`, `content: ''` |
| `loop: true` 超过 25 轮 | 强制退出，返回已收集的 tool_call 结果 |

---

## 5. Title Agent 作为第一个消费者

### 5.1 调用方式

```typescript
// TitleJobService.run()
const result = await agent(
  'title-generator',
  titleGenerationPrompt,
  ['chat_set_title'],
  [
    ...historyMessages,
    latestAssistantMessage,
    userMessage
  ],
  false,  // loop: false → 单轮，不回注
  {
    model: resolvedModel,
    account: resolvedAccount,
    providerDefinition: resolvedProvider,
    sanitizeOverrides: sanitizeTitleOverrides,
    requestOptions: { maxTokens: 32 }
  }
)

// TitleJobService 收到纯 result，业务逻辑在调用侧：
if (result.type === 'tool_call') {
  // 标题已通过 handler 写入 DB，无需额外操作
} else if (result.type === 'text') {
  // agent 未调工具 → 跳过（title 仍是 NewChat，下轮重试）
} else if (result.type === 'error') {
  // API 错误 → log 即可
}
```

### 5.2 对比

| 维度 | 当前（generateTitle） | agent() 方案 |
|------|----------------------|-------------|
| 消息 | 1 条用户消息 | 完整对话历史 |
| 工具 | 无 | chat_set_title（模型自主调用） |
| 降级 | 无 | 无 tool_call → 跳过（下轮重试） |
| 系统提示 | generateTitlePrompt(content) | 完整 title agent 系统提示 |
| 代码量 | 100 行（TitleGenerationService.ts） | ~10 行 agent() 调用 |

---

## 6. 实施计划

### Phase 1 — agent() 核心

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1 | `src/main/agent/agent.ts`（新增） | 实现 `agent()` 函数 |
| 2 | `src/main/agent/index.ts`（新增） | 导出 `agent` |
| 3 | 验证编译 + 单元测试 | `npx tsc --noEmit` |

### Phase 2 — Title Agent 迁移

| 步骤 | 文件 | 内容 |
|------|------|------|
| 4 | `src/main/orchestration/chat/postRun/TitleJobService.ts` | `run()` 中调用 `agent()` 替代 `generateTitle()` |
| 5 | `src/shared/prompts/title-agent.ts`（新增） | Title Agent 系统提示词 |
| 6 | 更新 `docs/chat/title-generation.md` | 引用 agent 抽象层 |

### Phase 3 — 测试

| 步骤 | 文件 | 内容 |
|------|------|------|
| 7 | `src/main/agent/__tests__/agent.test.ts`（新增） | 测试 agent() 核心流程 |
| 8 | 更新 `TitleJobService.test.ts` | 验证工具调用路径 + 纯文本路径 |

---

## 7. 架构影响

### 7.1 改动范围

| 新增文件 | 说明 |
|---------|------|
| `src/main/agent/agent.ts` | `agent()` 函数实现 |
| `src/main/agent/index.ts` | 导出 |
| `src/shared/prompts/title-agent.ts` | Title Agent 提示词 |
| `src/main/agent/__tests__/agent.test.ts` | 单元测试 |

| 修改文件 | 说明 |
|---------|------|
| `src/main/orchestration/chat/postRun/TitleJobService.ts` | 调用 `agent()` |

### 7.2 不涉及改动的

- `embeddedToolsRegistry` — 直接引用，不修改
- `createUnifiedRequest` / `unifiedChatRequest` — 内部使用，不修改
- `IUnifiedRequest` — 已有 `tools?: any[]`，无需改动
- `ToolListBuilder` — 主 agent 的工具列表不受影响
- `TitleGenerationService.generateTitle()` — 保留作为降级路径

### 7.3 与现有 AgentRuntime 的关系

```
┌──────────────────────────────────────────────────────────┐
│                     Main Agent Loop                       │
│  AgentRuntime → AgentLoop → ToolExecutor                  │
│  多轮、复杂、有状态、带 context management                  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                     agent() 抽象层                         │
│  单轮/有限轮次、无状态、轻量                                │
│  适用: Title Agent, 压缩, 研究, 代码审查                     │
└──────────────────────────────────────────────────────────┘
```

两者是不同层级的抽象，`agent()` 比 AgentRuntime 更轻量，不共享同一套基础设施。

---

## 8. 使用示例

### Title Agent（loop: false）

```typescript
const result = await agent(
  'title-generator',
  titleGenerationPrompt,
  ['chat_set_title'],
  conversationMessages,
  false  // loop: 默认值，可不传
)

// 调用方业务逻辑：
// result.type === 'tool_call' → 标题已通过 handler 写入 DB ✅
// result.type === 'text'      → skip（title 仍是 NewChat，下轮重试）
// result.type === 'error'     → log（API 错误）
```

### 搜索研究（loop: true）

```typescript
const result = await agent(
  'research',
  'Search and synthesize information about the given topic.',
  ['web_search', 'web_fetch'],
  [{ role: 'user', content: 'Latest AI chip developments' }],
  true  // loop → 回注继续，直到模型不再调工具
)
// 模型可以: 搜索 → 读页面 → 再搜索 → 综合分析
```

### 纯文本生成（tools: []）

```typescript
const result = await agent(
  'summarizer',
  'Summarize the following conversation.',
  [],  // 无工具 → 纯文本
  conversationMessages
)
// result.type === 'text'
```
