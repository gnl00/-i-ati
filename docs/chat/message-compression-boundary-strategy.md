# Message Compression Boundary Strategy

## 背景

2026-05-14，`chatUuid=6f5e43be-6ad1-4117-a165-7220134d5469` 出现一次上下文脱节：

1. 用户要求基于已建好的产品上新去重表创建 plan。
2. assistant 创建了一个 7 步 plan，并询问“要开始执行吗？”。
3. `plan_create` 工具结果显示 plan 为 `pending`，步骤为 `todo`。
4. 之后触发 message compression，压缩摘要把“计划已创建、等待执行”写成“计划已执行完成、编译通过”。
5. 下一轮用户说“开始执行 plan”时，请求上下文中原始 plan 消息已被错误 summary 替代，模型回答“之前的计划已经全部完成了”。

这次问题的根因是压缩边界和压缩提示词都缺少工具事实保护。`role=tool` 的结果是事实来源，特别是 `plan_*`、`todo_*`、`schedule_*` 这类状态工具；当这些 tool output 被摘要模型错误改写后，后续请求会继承错误状态。

## 当前已完成的修复

### 结构化压缩输入

`src/main/orchestration/chat/maintenance/CompressionTranscriptBuilder.ts` 已接管 summary 输入构建。`src/main/orchestration/chat/maintenance/MessageCompressionService.ts` 进入 summary 模型的新消息由简单的 `role: content` 改为结构化消息块：

```text
<assistant id="4938">
计划已建好，7 步。要开始执行吗？

<tool name="plan_create" call_id="call-plan-create">
<param>
{
  "goal": "完成新品去重代码落地",
  "status": "pending",
  "steps": [
    {
      "id": "1",
      "title": "创建 NewProductRecord.java 实体",
      "status": "todo"
    }
  ]
}
</param>
<result message_id="4941">
{
  "success": true,
  "plan": {
    "id": "plan-1",
    "status": "pending",
    "steps": [
      {
        "id": "1",
        "title": "创建 NewProductRecord.java 实体",
        "status": "todo"
      }
    ]
  }
}
</result>
</tool>
</assistant>
```

这样 summary 模型能看到 `toolCallId`、tool name、tool args 和 tool response 的配对关系。

### 保留窗口

当前阶段实现目标：

```text
RECENT_MESSAGE_PAIRS_TO_KEEP = 3
```

触发压缩时，`uncompressedMessages` 按 message id 排序：

```text
older message pairs -> messagesToCompress
latest 3 message pairs -> messagesToKeep
```

只有 `messagesToCompress` 进入 summary 模型，最近 3 个 message pairs 保持原文，继续在下一轮请求中出现。

message pair 是一个连续语义单元：

```text
user message
  + assistant message
  + assistant toolCalls
  + paired tool result messages
  + assistant continuation after tools
```

目标效果：

```text
older message pairs -> messagesToCompress
latest 3 pairs      -> messagesToKeep
```

这样最近对话中的 user intent、assistant action、tool facts 和后续解释会作为一个整体保留。

### 压缩 prompt 状态保真规则

`src/shared/prompts/compression.ts` 已增加状态保真规则：

```text
- Stateful tools include plan_*, todo_*, schedule_*, work_context_*, task/workflow tools, approval tools, notification tools, and automation run tools.
- Stateful tool results are source-of-truth records. Preserve entity ids, status, step status, currentStepId, activeStepId, failureReason, error, timestamps, owner, assignee, dependencies, and schedule times verbatim.
- For plans and todos, preserve every visible step/item id, title, status, dependsOn, owner/assignee, currentStepId, and failureReason.
- pending、todo、doing、in_progress、pending_review、blocked 表示仍有后续动作；摘要写成“计划已创建/等待执行/正在执行/阻塞中”，并放入 Pending Tasks。
- done、completed、success、failed、cancelled 需要引用明确事实来源：tool result、command output、test output、or explicit user confirmation.
- If assistant text conflicts with a stateful tool result, use the tool result as the state source in Tool Facts and Pending Tasks.
- assistant 的计划、设想、准备执行、询问确认，摘要写成意图或待执行事项。
- 工具调用和工具结果需要配对描述；工具结果里的 success=true 只代表该工具调用成功。
```

## 当前压缩数据流

```text
DB messages for chatUuid
  ORDER BY id ASC
        |
        v
RunEnvironmentService.loadHistoryMessages()
        |
        v
StepBootstrapService
  messageBuffer =
    historyMessages
    + current user message
        |
        v
ChatAgentAdapter
  postRunInput.messageBuffer =
    messageBuffer
    + finalized assistant message
        |
        v
CompressionJobService
  messages = postRunInput.messageBuffer
        |
        v
MessageCompressionService.compress()
  existingSummaries = active compressed_summaries
  compressedIds = all ids in existingSummaries.messageIds
  uncompressedMessages = messages where id not in compressedIds
        |
        v
if token threshold reached:
  messagesToCompress = all but latest 3 message pairs
  messagesToKeep = latest 3 message pairs
        |
        v
generateSummary(messagesToCompress, previousSummary)
        |
        v
save new compressed_summaries row
```

下一轮请求形态：

```text
systemPrompt
messages:
  1. user: [Previous conversation summary (... messages compressed)]
  2. user: hidden skills context
  3. user: hidden knowledgebase context
  4. user: hidden awake state
  5. uncompressed live messages, including latest 3 kept message pairs
  6. latest user message
```

## 结构化压缩输入

当前结构化压缩输入已经从平铺的 `role: content` 升级到 message block，保留 `message id`、`toolCalls`、`toolCallId`、tool name、tool args 和 tool result。

目标输入格式继续升级为按 turn / message pair 聚合。目标格式保持如下：

```text
<user id="">
content block
</user>
<assistant id="">
content blocks
<tool name="yyy">
<param>...</param>
<result>...</result>
</tool>
<tool name="xxx">
<param>...</param>
<result>...</result>
</tool>
</assistant>
...
```

这个结构把 assistant 的自然语言、tool 调用参数和 tool 结果放在同一个 assistant block 内。summary 模型看到的是有顺序的语义单元，结构比 `assistant -> tool -> assistant -> tool` 平铺消息更稳定。

目标效果：

```text
user intent
  -> assistant action
  -> tool params
  -> tool results
  -> assistant continuation
```

设计约束：

1. DB 仍保存原始 message entity。
2. 结构化压缩输入只在 compression 阶段 materialize。
3. `role=tool` 在配对成功时并入对应 assistant block。
4. 无法配对的 tool result 保留为独立异常块，供 summary 记录 orphan tool fact。
5. 原始 toolCallId 可作为调试字段保留，但 summary 模型理解配对主要依赖结构。

和 latest 3 message pairs 的关系：

```text
CompressionTranscriptBuilder
  -> group messages into message pairs / turns
  -> older pairs materialize into structured compression input
  -> latest 3 pairs stay as live original messages
```

已引入专门 builder：

```text
CompressionTranscriptBuilder
  input: MessageEntity[]
  output: structured transcript string
```

它负责：

当前职责：

1. 输出 `<user>`、`<assistant>`、`<tool>`、`<result>` 结构化块。
2. 把 assistant toolCalls 和后续连续 `role=tool` result 配对。
3. 将 paired tool result 嵌入 assistant block。
4. 将无法配对的 tool result 输出为 orphan block。

后续职责：

1. 为高噪声 tool result 接入 compact hook。
2. 根据 tool 类型和距离最新消息的距离选择原文、结构化事实或 compact 结果。

## 压缩边界原则

压缩策略按三层处理。

### Layer 1: 保留窗口

```text
保留最新 3 个未压缩 message pairs 原文
```

message pair aware 的保留窗口：

```text
base keep:
  latest 3 message pairs

repair keep:
  如果保留了 role=tool
    同时保留它对应的 assistant toolCall message

  如果保留了 assistant toolCalls
    同时保留紧随其后的 tool result messages
```

后续可配置项：

```text
recentPairsToKeep = 3
nearbyToolResultDistance = 5 or 7
```

### Layer 2: Role 策略

```text
role=user:
  可进入 summary 压缩。
  用户明确约束、需求变更、纠错反馈、安全约束需要完整保留语义。

role=assistant:
  普通解释和过程可压缩。
  toolCalls 需要保留 tool name、args、toolCallId。
  assistant 的计划、准备执行、询问确认属于意图或待执行状态。

role=tool:
  作为事实来源处理。
  根据工具类型、距离最新消息的远近、response 体积决定原文保留、结构化事实保留或降噪 compact。
```

### Layer 3: Tool 策略

```text
small structured result:
  原文保留。

stateful fact tools:
  状态字段高保真。

large/noisy tools:
  可做结构化 compact。

nearby tool results:
  原文保留，避免刚发生的工具事实被 summary 模型改写。
```

## Role=Tool 策略矩阵

| Tool 类型 | 近距离 | 远距离 | 说明 |
| --- | --- | --- | --- |
| `plan_*` | 原文 | 原文或结构化事实 | `status`、`step.status`、`currentStepId`、`failureReason` 是事实来源 |
| `todo_*` | 原文 | 原文或结构化事实 | action item 的状态和归属需要高保真 |
| `schedule_*` | 原文 | 原文或结构化事实 | 时间、执行状态、失败原因需要高保真 |
| `work_context_*` | 原文 | 原文或结构化事实 | 当前目标、决策、进行中事项需要高保真 |
| `execute_command` | 原文或 compact | compact | 保留 command、cwd、exit_code、pass/fail、错误片段 |
| `read` | 原文或 compact | compact | 保留 path、range、truncated、关键内容片段 |
| `grep` / `log_search` / `history_search` | 原文或 compact | compact | 保留 query、count、path、line、snippet |
| `ls` / `tree` / `glob` | 原文或 compact | compact | 保留 path、count、entries 概览 |
| `memory_*` / `user_info_*` / `emotion_report` | 原文 | 原文 | 体积通常较小，语义密度高 |

## Tool Output Compact 的位置

当前讨论结论：

1. compact 是高噪声工具的降噪能力。
2. 小型结构化 tool response 直接保留原文。
3. `plan_*` 示例中，把原始结构包装成 `summary + facts` 会增加内容体积，也会引入额外解释层。
4. compact 方法应支持“无需 compact”的结果。

建议接口：

```ts
export type ToolResultCompactInput = {
  toolName: string
  toolCallId?: string
  args?: unknown
  result: unknown
  distanceFromLatestMessage: number
}

export type ToolResultCompactOutput = {
  kind: 'compact_tool_result'
  toolName: string
  content: unknown
}

export type ToolResultCompactor = (
  input: ToolResultCompactInput
) => ToolResultCompactOutput | undefined
```

数据流：

```text
tool message content
        |
        v
find toolName by toolCallId
        |
        v
toolCompactor exists?
        |
        +-- no:
        |     keep raw content
        |
        +-- yes:
              compactor(rawContent, args, distance)
                    |
                    +-- undefined:
                    |     keep raw content
                    |
                    +-- compactResult:
                          use compactResult.content
```

## 压缩 Prompt 优化方向

用户提供的 partial compaction prompt 价值点：

1. 明确 summary 的使用位置：summary 会放到 continuing session 开头，后面会接新的消息。
2. 要求 chronological analysis，逐段分析每条消息和每个阶段。
3. 明确保留用户显式请求、技术决策、文件、代码片段、错误与修复、用户反馈。
4. 要求列出所有非 tool result 的用户消息。
5. 明确保留 security-relevant instructions 和约束。
6. 输出结构分成 `Primary Request and Intent`、`Key Technical Concepts`、`Files and Code Sections`、`Errors and fixes`、`Problem Solving`、`All user messages`、`Pending Tasks`、`Work Completed`、`Context for Continuing Work`。

当前 `compression.ts` prompt 已向这个方向优化：

```text
1. 先声明 summary 的后续用途：
   This summary will be placed before newer messages in a continuing session.

2. 要求按时间顺序整理：
   Chronologically analyze user requests, assistant actions, tool calls, tool results, errors, and fixes.

3. 增加固定输出结构：
   - Primary Request and Intent
   - Key Technical Concepts
   - Files and Code Sections
   - Tool Facts
   - Errors and Fixes
   - All User Messages
   - Pending Tasks
   - Work Completed
   - Context for Continuing Work

4. 强化 user messages：
   List all non-tool user messages, especially corrections and constraints.

5. 强化 tool facts：
   Tool result status fields are source-of-truth facts.
   success=true means the tool call succeeded.
   Stateful tools include plan_*, todo_*, schedule_*, work_context_*.
   State fields include ids, status, step/item status, currentStepId, activeStepId, failureReason, owner/assignee, dependencies, and schedule times.
   Open states must be recorded in Pending Tasks.

6. 压缩 tool output：
   For noisy tool outputs, keep pass/fail, paths, counts, ids, errors, and excerpts needed for decisions.
```

## 压缩观测方法

新增手动观测测试：

```text
src/main/orchestration/chat/maintenance/__tests__/CompressionObservation.observe.test.ts
```

默认执行时该测试会 skip，避免常规测试读取真实数据库或调用真实模型。

手动观测命令：

```bash
RUN_COMPRESSION_OBSERVATION=1 \
COMPRESSION_OBSERVATION_PROVIDER_NAME=Xiaomi \
COMPRESSION_OBSERVATION_MODEL_ID=mimo-v2.5 \
pnpm exec vitest run src/main/orchestration/chat/maintenance/__tests__/CompressionObservation.observe.test.ts --reporter=verbose
```

可选参数：

```text
COMPRESSION_OBSERVATION_DB_PATH=/path/to/chat.db
COMPRESSION_OBSERVATION_ACCOUNT_ID=<provider_accounts.id>
COMPRESSION_OBSERVATION_PROVIDER_NAME=<provider_definitions.display_name>
COMPRESSION_OBSERVATION_MODEL_ID=<provider_models.model_id>
```

观测逻辑：

```text
1. 读取真实 chat.db 中 update_time 最新的 3 个 chat。
2. 读取每个 chat 的 messages 和 active compressed_summaries。
3. 使用 MessageCompressionService.analyzeCompressionStrategy() 计算压缩边界。
4. 输出 chatUuid、message count、active summary count、messagesToCompress、messagesToKeep、model。
5. 如果当前策略会触发压缩，生成 incremental_compression_preview。
6. 如果当前策略不触发压缩但已有 active summary，输出 existing_active_summary。
7. 如果当前策略不触发压缩且没有 active summary，生成 full_range_preview。
8. 测试以 readonly 方式读取数据库，不写入 compressed_summaries。
```

2026-05-14 使用 Xiaomi / `mimo-v2.5` 观测结果：

```text
1. ECS服务器ID查询命令
   mode: incremental_compression_preview
   messages: 21
   activeSummaries: 1
   messagesToCompress: 4
   messagesToKeep: 6
   result: 新 prompt 能按结构输出 Tool Facts、Pending Tasks、Context for Continuing Work。

2. bgrs-chat
   chatUuid: 6f5e43be-6ad1-4117-a165-7220134d5469
   mode: existing_active_summary
   messages: 183
   activeSummaries: 1
   messagesToCompress: 0
   messagesToKeep: 0
   result: 现有 active summary 仍是历史错误摘要，内容把 NewProductRecord 计划写成已完成并通过 mvn compile。

3. 分析聊天并行支持
   mode: full_range_preview
   messages: 15
   activeSummaries: 0
   messagesToCompress: 0
   messagesToKeep: 15
   result: 短会话 summary 质量正常，能保留代码路径、工具事实、用户纠错和最终结论。
```

## 待讨论问题

1. message pair 的精确定义：是否以 user message 作为 pair 起点。
2. tool result 归属：多轮 toolCalls 和 assistant continuation 的 pair 归并规则。
3. role=tool 的近距离阈值使用 5 条还是 7 条。
4. `plan_*`、`todo_*`、`schedule_*` 的远距离保留策略。
5. `execute_command` compact 的关键行提取规则。
6. `read` / `grep` / `log_search` compact 的截断和引用格式。
7. summary 输出是否保留所有 user messages 的原文或精简原文。

## 后续开发计划

### 阶段 1: 边界修复

- 保留最新 3 条原文。
- 压缩输入保留 toolCallId、tool name、args、tool result 配对关系。
- 增加状态保真 prompt。
- 回归测试覆盖 `plan_create pending/todo`。

当前状态：已完成。

### 阶段 2: 文档驱动讨论

- 本文档作为压缩边界和策略讨论的来源。
- 新增讨论结论先更新本文档。
- 后续代码实现以本文档为需求依据。

当前状态：进行中。

### 阶段 3: Message-pair aware 保留窗口

- 将保留窗口升级为 latest 3 message pairs。
- 以 pair 为单位保留最近 user intent、assistant action、tool facts、assistant continuation。
- 距离最新消息较近的 tool result 原文保留。
- 为 role=tool 距离计算预留后续接入点。

当前状态：已完成 latest 3 message pairs 保留窗口；role=tool 距离计算进入后续 Tool Output Compact 阶段。

### 阶段 4: Prompt 结构化升级

- 将 current prompt 升级为 partial-compaction 风格。
- 输出固定结构。
- 强制保留用户纠错、约束、错误与修复、工具事实。

### 阶段 5: 高噪声 Tool Output Compact

- 先覆盖 `execute_command`、`read`、`grep`、`log_search`。
- 小型结构化结果保留原文。
- compact 方法返回 `undefined` 时保留原文。

## 当前推荐结论

当前策略可行：

```text
1. 保留窗口目标为最新 3 个 message pairs。
2. role=user 和 role=assistant 文本进入 summary。
3. assistant.toolCalls 必须保留 tool name、args、toolCallId。
4. role=tool 是事实来源。
5. 距离最新消息较近的 tool result 原文保留。
6. 状态型工具优先保真。
7. 高噪声工具在距离较远或体积过大时 compact。
8. 压缩 prompt 升级为结构化 continuing-session summary。
```
