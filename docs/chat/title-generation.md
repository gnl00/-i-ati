# Title Generation — Title Agent 方案

> **状态**: 设计稿 · **最后更新**: 2026-06-06
> **本文作为此功能的唯一参考文档，后续讨论和优化都以此为准**

---

## 1. 问题

### 1.1 现状

当前标题生成由 `TitleJobService`（post‑run）调用 `TitleGenerationService.generateTitle()` 完成：

```
TitleJobService.run()
  └─ generateTitle(content)
       └─ API call: { messages: [{ role: "user", content: args.content }], maxTokens: 32 }
```

`args.content` 是**用户最后一条消息**，不包含完整对话历史。

### 1.2 根因

- **上下文不足**: 模型只看最后一条用户消息，看不到 assistant 回复、过往轮次、对话方向
- **Token 限制**: `maxTokens: 32` 对 DeepSeek V4 Flash 非流式模式过紧
- **Payload 冲突**: `RequestPayloadExtensionPipeline` 自动注入 `thinking.type: disabled` 导致部分模型空返回
- 之前尝试的 `maxTokens: 32 → 128` 修复只是表面缓解，没有解决单条消息的根本限制

### 1.3 目标

- 模型看到完整对话上下文后生成标题（质量提升）
- 标题不再依赖单条消息截断
- 主 agent 保留自主设标题能力（可选项）
- 架构干净，不引入额外复杂度

---

## 2. 解决方案概览

引入 **Title Agent** — 一个轻量级 post‑run agent，替代现有的 `generateTitle()` 单次 API 调用。

```
用户发送消息
  │
  ├─ Main Agent（tools[] 包含 chat_set_title）
  │    └─ 可自主调用设置标题（可选，非强制）
  │
  └─ Post‑run: Title Agent
       ├─ 上下文：完整对话消息
       ├─ Tool: chat_set_title
       ├─ Prompt: 标题生成专业指令
       └─ 模型自主调用 chat_set_title → DB 写入 → emitChatUpdated → UI 更新
```

### 2.1 与现有方案对比

| 维度 | 当前（generateTitle） | Title Agent |
|------|----------------------|-------------|
| 模型上下文 | 仅最后一条用户消息 | 完整对话（含 assistant 回复） |
| 质量上限 | 受限于上下文 | 上下文完整 |
| 额外延迟 | ~1s/次 | ~1-2s/次（一次额外 model call） |
| 工具支持 | 无 | chat_set_title + 模型自主决策 |
| 新增基础设施 | 无 | 轻量级单轮 agent |
| 主 agent 侵入 | 无 | 无（只注册 chat_set_title tool） |

---

## 3. 架构

### 3.1 组件职责

| 组件 | 职责 |
|------|------|
| `chat_set_title` tool（定义 + handler） | 写入 DB + 返回 tool result。复用现有实现 |
| `TitleJobService` | 触发条件判断（`shouldRun`），构建 Title Agent 请求，处理响应 |
| `Title Agent（新增）` | 非实体组件，指代 `TitleJobService` 内部发起的带 tool 的 model call 请求 |
| 主 agent | 可选调 `chat_set_title`，完全自主决策 |

### 3.2 组件间关系

```
TitleJobService.run()
  │
  ├─ shouldRun() → title === "NewChat" && titleGenerateEnabled
  │     └─ 不改，保持现有判断逻辑
  │
  ├─ 构建 Title Agent 请求
  │    ├─ systemPrompt: title 生成专业指令
  │    ├─ messages: 完整对话上下文
  │    ├─ tools: [chat_set_title]
  │    └─ tool_choice: auto
  │
  ├─ 发送 API 请求（可配置模型，默认 post‑run 使用的 title 模型）
  │
  ├─ 解析响应（agent() 返回纯 AgentResult）
  │    ├─ type === 'tool_call' → 标题已设 ✅
  │    ├─ type === 'text'      → skip（下轮重试）
  │    └─ type === 'error'     → log + skip
  │
  └─ emitChatUpdated → UI 更新
```

### 3.3 Title Agent 输入构造

**System Prompt**:
```
You are a title generation agent. Your only task is to set a concise, descriptive title 
for this conversation by calling the `chat_set_title` tool.

Guidelines:
- Chinese: ≤18 characters. English: ≤12 words.
- Use a noun phrase or task phrase that summarizes the topic.
- The title should reflect what the user is trying to accomplish.
- Call chat_set_title when you have enough context from the conversation.

If the conversation is very short or unclear, you may skip calling the tool.
The next run will retry if the title is still unset.
```

**Messages**: 完整对话消息序列（system prompt + 历史消息 + 最新 assistant 回复）

**Tools**: `[chat_set_title]`（与主 agent 看到的同一工具定义）

---

## 4. 处理流程

### 4.1 正常流程

```
1. 用户发送消息
2. Main Agent 正常运行（完全不知道 title agent 存在）
   └─ tools[] 包含 chat_set_title → 可偶发调用
3. RunFinalizer 发射 COMPLETED
4. Post‑run: TitleJobService.shouldRun()
   ├─ titleGenerateEnabled === false? → skip
   ├─ title !== "NewChat"? → skip（包括已通过 chat_set_title 设过的情况）
   └─ 通过
5. TitleJobService.run() 构建 Title Agent 请求
   ├─ 系统提示 + 完整消息
   └─ 发起 model call
6. 模型返回 tool_call(chat_set_title, { title: "xxx" })
7. TitleJobService 处理 tool result
   ├─ chatSessionStore.updateChatTitle()
   └─ chatEventMapper.emitChatUpdated()
8. UI 侧边栏刷新标题
```

### 4.2 无 tool_call 路径

```
5b. 模型返回无 tool_call（空/文本/不合法响应）
    └─ TitleJobService 不做额外处理（title 仍是 NewChat，下一轮 shouldRun() 重试）
```

### 4.3 主 agent 调用 chat_set_title 的并发场景

```
主 agent 在运行过程中调用了 chat_set_title → DB 中 title 已不为 NewChat
  └─ TitleJobService.shouldRun() → isDefaultChatTitle === false → skip
```

主 agent 和 Title Agent 不需要互斥锁。后运行的 TitleJobService 检查 DB 发现标题已设，自动跳过。

---

## 5. 实施计划

### Phase 1 — Title Agent 核心

| 步骤 | 修改文件 | 内容 |
|------|---------|------|
| 1 | `src/main/orchestration/chat/postRun/TitleJobService.ts` | 修改 `run()`：构建 agent 请求替代 `generateTitle()` |
| 2 | `src/shared/prompts/title.ts`（新增） | 提取 Title Agent 系统提示词 |
| 3 | `TitleJobService.ts` | 处理 tool_call 响应：写入 DB、emit 事件 |
| 4 | `TitleJobService.ts` | 无 tool_call 时不处理（title 仍是 NewChat，下轮重试） |

### Phase 2 — 配置与调优

| 步骤 | 修改文件 | 内容 |
|------|---------|------|
| 5 | `IAppConfig` types | 确认 titleGenerateModel / titleGenerateEnabled 配置项 |
| 6 | `TitleJobService.ts` | Title Agent 使用可配置模型 |

### Phase 3 — 测试

| 步骤 | 测试 | 验证点 |
|------|------|--------|
| 7 | TitleJobService.test.ts | Tool call 路径 + 无 tool_call 路径 |
| 8 | 手动测试 | 实际对话观察标题质量 |

---

## 6. chat_set_title 工具

### 6.1 状态

✅ 已实现并全链路注册。

| 文件 | 内容 |
|------|------|
| `src/shared/tools/title/definitions.ts` | 工具定义（name, description, parameters） |
| `src/shared/tools/title/metadata.ts` | 工具元数据（capability: chat, riskLevel: none） |
| `src/main/tools/title/TitleToolsProcessor.ts` | handler：`DatabaseService.updateChat()` |
| `src/shared/tools/metadata-types.ts` | 新增 `'chat'` capability 类型 |
| `src/shared/tools/metadata.ts` | 注册 `titleToolMetadata` |
| `src/shared/tools/definitions/index.ts` | 注册 `titleTools` |
| `src/main/tools/index.ts` | 注册 `chat_set_title` handler |

### 6.2 工具定义（schema）

```json
{
  "name": "chat_set_title",
  "description": "Set a concise, descriptive title for this conversation. Call when the conversation topic is sufficiently clear. Chinese titles should be ≤18 characters, English ≤12 words.",
  "parameters": {
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "Concise title for this conversation."
      }
    },
    "required": ["title"]
  }
}
```

### 6.3 可见性

- **Main Agent tools[]**: ✅ 常驻（不移除）
- **Title Agent tools[]**: ✅ 注入
- **list_tools**: ✅ 对所有用户可见

---

## 7. 边界情况与注意事项

### 7.1 主 agent 提前设了标题

```
流程: 主 agent 调 chat_set_title → DB 更新
      → Post‑run TitleJobService.shouldRun() → title 已设 → skip
```
✅ 无冲突，TitleJobService 的 `shouldRun` 天然防重复。

### 7.2 Title Agent 很慢

Title Agent 是一个额外的 model call。优化建议：
- 使用轻量模型（与现有 `titleGenerateModel` 配置一致）
- 消息数量大的对话：截取最后 N 轮（如 5-10 轮）作为上下文
- 超时保护：设置 `timeout`，超时后降级到 `generateTitle()`

### 7.3 模型不调 tool_call

任何模型都可能返回纯文本而非 tool_call。TitleJobService 需检测：
- 有 tool_call(`chat_set_title`) → 正常处理
- 无 tool_call → 降级调用 `generateTitle()`

### 7.4 多次调用的防抖

Title Agent 是 post‑run 单次调用，天然不重复。主 agent 在多步（multi‑step）运行中多次调用 `chat_set_title` 是预期行为——标题随对话进化自然更新。

### 7.5 和 TitleGenerationService 的关系

| 场景 | 行为 |
|------|------|
| Title Agent 正常返回 tool_call → chat_set_title | TitleGenerationService 不调用 |
| Title Agent 无 tool_call | 降级调用 TitleGenerationService.generateTitle() |
| titleGenerateEnabled = false | 都不调用 |

---

## 8. 已完成的改动

| 文件 | 操作 | 备注 |
|------|------|------|
| `src/shared/tools/title/definitions.ts` | +新增 | chat_set_title 工具定义 |
| `src/shared/tools/title/metadata.ts` | +新增 | tool metadata |
| `src/main/tools/title/TitleToolsProcessor.ts` | +新增 | DB 写入 handler |
| `src/shared/tools/definitions/index.ts` | +修改 | 注册 titleTools |
| `src/shared/tools/metadata-types.ts` | +修改 | 添加 'chat' capability |
| `src/shared/tools/metadata.ts` | +修改 | 注册 titleToolMetadata |
| `src/main/tools/index.ts` | +修改 | 注册 handler |
| `src/main/orchestration/chat/maintenance/TitleGenerationService.ts` | maxTokens 改回 32 | 回退方案 A |
| `src/main/orchestration/chat/maintenance/__tests__/generateTitle.test.ts` | maxTokens 改回 32 | 回退方案 A |

## 9. 待实现的改动

| 文件 | 操作 | 内容 |
|------|------|------|
| `src/main/orchestration/chat/postRun/TitleJobService.ts` | 修改 run() | 构建 Title Agent 请求替代 generateTitle() |
| `src/shared/prompts/title.ts` | +新增 | Title Agent 专属系统提示词 |
| `src/main/orchestration/chat/postRun/__tests__/TitleJobService.test.ts` | 更新 | 验证 tool_call 路径 + 降级路径 |
