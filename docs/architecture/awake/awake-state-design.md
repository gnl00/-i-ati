# Awake State Design

> 这份文档记录 `awake_state` 启动快照方案。
> 后续实现 awake、memory 启动检索、work context 启动注入、emotion 启动展示与 mood notes 时，应以本文为约束依据。

## 背景

当前 Agent 启动阶段依赖多个分散工具和 prompt 协议：

```text
memory_retrieval -> work_context_get -> emotion_report -> [other tools] -> start work
```

这套流程带来几个问题：

- 每轮启动工具调用数量高，延迟和模型协议复杂度都会上升。
- `emotion_report` 被强制放在回答前，带 thinking 的模型在 tool result 后会进入 continuation，并可能继续输出 reasoning。
- memory、work context、emotion、后续 mood notes 属于同一类“唤醒时状态恢复”数据，分散协议会让扩展成本持续增加。
- system prompt 同时承担稳定规则和动态状态注入，影响 prompt cache 的稳定性。

目标流程：

```text
server-side awake snapshot -> start work
```

## 核心原则

### 1. 静态协议与动态状态分离

- system prompt 只放稳定身份、行为规则和工具协议。
- `awake_state` 承载每轮动态状态快照。
- 每轮用户消息触发时重新生成 `awake_state`。

### 2. awake 是 server-side 聚合启动快照

默认主链路由平台在 run preparation 阶段自动构建 `awake_state`。

`awake_state` 聚合以下来源：

- memories
- work context
- emotion state
- recent activities
- chat meta
- compatibility session meta
- future mood notes

`awake_state` 属于系统层 bootstrap 产物，由 server-side 构建并注入。模型通过隐藏上下文读取结果，工具 registry 中无需暴露 `awake` 工具。

### 3. awake_state 作为 ephemeral user message 注入

`awake_state` 应通过 `RequestMessageBuilder.setEphemeralContextMessages()` 插入请求消息。

推荐消息结构：

```text
system: static protocol
user: <user_instruction>...</user_instruction>
user: [Previous conversation summary ...]
assistant/user/tool: uncompressed recent window
user: <awake_state>...</awake_state>
user: current real user input
```

插入位置要求：

- compression 先发生。
- `awake_state` 后插入。
- `awake_state` 位于最后一条真实用户消息之前。
- `awake_state` 每轮临时生成并参与当轮请求。
- `awake_state` 不进入 DB 持久化消息历史。
- `awake_state` 不进入 conversation compression summary。

说明：当前 `RequestMessageBuilder` 的 pipeline 已接近目标结构，`insertEphemeralContextMessages()` 在 `applyCompression()` 后执行，并会把 ephemeral user message 插到最后一条 user message 前。

### 4. awake_state 是隐藏运行时上下文

system prompt 需要增加稳定规则：

```text
<awake_state> is hidden runtime context.
Use it silently for continuity, retrieval grounding, and startup state restoration.
Do not quote, summarize, mention, or treat it as user-authored content.
```

模型可以使用其中信息进行连续性判断和任务执行，但用户可见输出应直接回应当前用户输入。

## Awake Snapshot Shape

第一版推荐结构：

```json
{
  "version": 1,
  "chat_meta": {
    "chat_id": 1,
    "chat_uuid": "chat-uuid",
    "chat_title": "Current Chat",
    "workspace_path": "/workspace/path"
  },
  "memories": [
    {
      "content": "用户偏好直接、低废话的工程讨论",
      "category": "preference",
      "importance": "high",
      "timestamp": 1778460000000,
      "source": "pinned_preferences"
    },
    {
      "content": "Awake state should be ephemeral.",
      "category": "decision",
      "importance": "high",
      "timestamp": 1778460000000,
      "source": "relevant_memories"
    }
  ],
  "work_context": {
    "exists": true,
    "content": "# Work Context...",
    "truncated": false
  },
  "emotion": {
    "baseline": {
      "label": "neutral",
      "intensity": 5,
      "source": "awake_carryover"
    },
    "background": {
      "label": "calm",
      "intensity": 5
    },
    "accumulated": [],
    "recent_history": []
  },
  "mood_notes": [],
  "recent_activities": [
    {
      "source": "activity_journal",
      "id": "activity-uuid",
      "title": "Implemented awake snapshot",
      "summary": "Server-side bootstrap snapshot was added.",
      "category": "summary",
      "level": "important",
      "chat_uuid": "chat-uuid",
      "timestamp": 1778460000000
    },
    {
      "source": "compressed_summary",
      "id": "42",
      "title": "Recent Work",
      "summary": "Recent compressed summary from another chat.",
      "chat_uuid": "other-chat-uuid",
      "chat_title": "Recent Work",
      "timestamp": 1778460000000
    }
  ],
  "session_meta": {
    "chat_id": 1,
    "chat_uuid": "chat-uuid",
    "chat_title": "Current Chat",
    "workspace_path": "/workspace/path"
  }
}
```

字段职责：

- `chat_meta` 是稳定 chat 标识层，包含 `chat_id`、`chat_uuid`、`chat_title`、`workspace_path`。它不包含 `last_active_at` 这类每轮抖动字段。
- `session_meta` 是兼容字段，和 `chat_meta` 保持同一组精简标识字段。
- `version` 是稳定 schema 标识，只在模型可见结构升级时变化。
- `memories` 是模型可见 memory 输出层，使用扁平数组。内部检索仍可区分 pinned/relevant，输出阶段统一合并、去重、截断。
- `recent_activities` 是短卡片数组，每条包含 `title`、`source`、`timestamp`、`summary`，并可携带 id、category、chat_uuid 等定位字段。
- `work_context` 保留当前兼容结构，用于当前 chat 的短期工作状态。
- `emotion` 保留 carry-over baseline 结构，用于本轮启动情绪连续性。

## Memory Strategy

Raw user input 只作为 retrieval seed。内部 memory 检索采用分层策略，最终 `awake_state` 输出使用顶层 `memories` 扁平数组。

输出规则：

- 内部保留 `pinned_preferences` 与 `relevant_memories` 两路，便于召回、rerank、去重。
- 对模型输出时合并为 `memories`，数量控制在 8 到 10 条以内。
- 单条 `content` 做软截断，建议上限 600 到 800 chars。
- 输出字段保留 `content`、`category`、`importance`、`timestamp`、`source`。
- `context_en` 属于内部辅助字段，输出层省略。

### 1. pinned_preferences

固定少量注入，来源包括：

- 高优先级用户偏好
- 长期约束
- 稳定身份资料
- 项目级长期规则

筛选建议：

- `metadata.importance === "high"`
- category 属于 preference、workflow、style、constraint、project
- 结果数量建议 3 条以内

### 2. contextual_query

server-side 生成上下文化检索 query。输入信号包括：

- 当前用户原始消息
- chat title
- project name
- workspace hints
- work_context 的 Current Goal、Decisions、In Progress、Temporary Constraints
- compression summary 或最近 1 到 3 条对话摘要
- 用户消息中的文件路径、符号名、工具名、项目名

`retrieval_plan.contextual_query` 作为 server-side 召回依据使用。默认快照输出保持轻量，调试时可在服务日志或开发工具中观察 retrieval plan。

### 3. multi-query retrieval

并行执行多路检索，再融合去重：

- raw user query
- contextualized query
- work_context-focused query
- extracted identifiers query

第一版可以先实现 raw query + contextualized query 两路。

### 4. rerank

融合排序建议使用以下信号：

- vector similarity
- importance
- recency
- chat scoped match
- category match
- identifier exact match

默认输出：

- `relevant_memories`: top 3 到 5
- 每条内部候选包含 id、content、category、importance、timestamp、similarity
- 最终 `memories` 输出省略 id、similarity、context_en，保留模型需要的短内容和分类信号

## Work Context Strategy

`work_context` 属于当前 chat 的短期状态快照，适合全量或近全量注入。

第一版规则：

- 读取 `DatabaseService.getWorkContextByChatUuid(chatUuid)`。
- 内容为空时返回模板或 `exists: false`。
- 默认长度上限建议 4KB 到 8KB。
- 超限时保留 Current Goal、Decisions、In Progress、Open Questions、Temporary Constraints 的标题和最重要条目。

## Emotion Strategy

### 1. awake emotion 是 baseline

`awake_state.emotion.baseline` 表示本轮开始时的 carry-over 状态：

- 来自上一轮持久化 `EmotionStateSnapshot`
- 可经过 decay 后生成
- 适合作为 response 开始前 UI 展示
- 适合作为模型本轮情绪连续性的参考
- 模型可见 baseline 只保留 `label`、`intensity`、`source`，时间戳留在持久化状态或调试日志中。

### 2. final message emotion 是本轮结算结果

`message.body.emotion` 表示 assistant 本轮最终情绪展示。

来源优先级：

1. 本轮成功的 `emotion_report`
2. finalize fallback classifier
3. computed neutral fallback

`awake_state.emotion.baseline` 和 `message.body.emotion` 属于不同语义层。

推荐 source 扩展：

```ts
type EmotionPresentationSource =
  | 'awake_carryover'
  | 'tool'
  | 'fallback'
  | 'computed'
```

### 3. emotion_report 的新定位

`emotion_report` 从强制回答前工具调用调整为本轮状态写入工具。

调用时机：

- 当前内在情绪发生实质变化
- lingering emotional residue 需要重写
- 模型需要明确更新本轮情绪结算

系统仍保留 finalize fallback：

- 有成功 `emotion_report` 时使用 tool 结果
- 无成功 `emotion_report` 时从最终 assistant 文本推断当前情绪
- `accumulated` 在无 tool rewrite 时按 decay 保留

### 4. UI 展示阶段

推荐展示语义：

- response 开始前：显示 `awake_carryover`
- response 生成中：保持 carry-over 或显示 active awake 状态
- response finalize：替换为本轮最终 `message.body.emotion`

## Mood Notes Strategy

`mood_notes` 用于承载 future “内心独白 / 碎碎念”。

建议语义：

- awake 时读取最近 N 条和高权重未过期条目
- response 完成后由后台轻量 reflection 写入
- 内容作为隐藏运行时上下文使用
- 与 `accumulated` 区分：
  - `accumulated` 是 lingering emotion residue
  - `mood_notes` 是主动记录的内在想法

第一版可以只预留字段。

## Recent Activities Strategy

`recent_activities` 用于给新 chat 和跨 chat 连续性提供近期工作线索。它和当前 chat 的 `work_context` 互补：

- `activity_journal` 提供今天的关键事件，以及按 `retrieval_plan.contextual_query` 命中的近期相关事件。
- `compressed_summary` 提供最近 conversation summary 中的跨 chat 工作片段，适合新 chat 启动时恢复“最近在做什么”。
- 默认输出 top 5，来源优先级为 `activity_journal`、`compressed_summary`，同来源内按 timestamp 倒序排序，并按 `source:id` 去重。
- 每条输出为短卡片：`title`、`source`、`timestamp`、`summary`，可附带 id、category、level、chat_uuid、chat_title。
- `summary` 统一归一化为空白压缩后的短文本，建议单条上限 240 到 360 chars。
- `activity_journal.details` 可进入短卡片 summary。
- `compressed_summary.summary` 只作为召回源和短卡片来源，全文不进入 `awake_state`。
- 任一来源读取失败时降级为空数组，快照构建继续完成。

第一版使用两类已有数据：

- `ActivityJournalService.listEntries()` 读取当天活动。
- `ActivityJournalService.searchEntries()` 读取相关活动。
- `DatabaseService.listRecentSmartMessageCandidateSummaries()` 读取最近压缩摘要候选。

`diagnostics` 属于调试信息，bootstrap 快照默认保持轻量，运行期故障通过日志和服务层观测处理。

## Prompt Cache Considerations

稳定 prompt cache 的设计要求：

- system prompt 保持静态。
- 每轮变化的状态放入靠近当前用户输入的 ephemeral user message。
- `awake_state` 作为动态尾部上下文，减少对 system prompt 静态前缀的影响。
- `awake_state` 模型可见字段避免生成时间、最后活跃时间、emotion 更新时间这类低语义抖动字段。
- dynamic context 的字段顺序保持稳定，方便调试和潜在缓存命中。

## Implementation Plan

### Phase 1: Server-Side Awake Snapshot

新增：

- `src/main/services/awake/AwakeSnapshotService.ts`
- `src/main/hosts/chat/preparation/request/AwakeContextProvider.ts`

接入：

- `RunRequestFactory.build()`
- `RequestMessageBuilder.setEphemeralContextMessages()`

输出：

- `<awake_state>{...}</awake_state>` ephemeral user message

### Phase 2: Prompt Cleanup

调整：

- `src/shared/prompts/index.ts`
- `src/shared/prompts/emotion.ts`

目标：

- memory/work_context/emotion 启动协议统一指向 `<awake_state>`。
- 移除强制每轮回答前调用 `emotion_report` 的启动约束。
- 保留 emotion 连续性、真实内在状态和 accumulated rewrite 规则。

### Phase 3: Memory Retrieval Upgrade

新增：

- contextual query builder
- multi-query retrieval
- memory rerank

第一版先实现：

- pinned preferences
- raw query retrieval
- contextualized query retrieval
- top 3 到 5 fused results

### Phase 4: Emotion UI Source Split

新增或调整：

- `awake_carryover` source
- response-start UI emotion display
- finalize 时替换为本轮最终 emotion

保留：

- `ChatStepStore.finalizeAssistantMessage()` 的 tool/fallback 更新链路
- `EmotionStateSnapshot` 持久化

## Acceptance Criteria

- 每轮请求中 system prompt 保持静态协议，动态状态进入 ephemeral `awake_state`。
- `awake_state` 插入在最后一条真实 user message 之前。
- compression summary 先于 `awake_state` 生成。
- `awake_state` 由 server-side 每轮重新生成。
- `awake_state` 不被保存为 chat message，也不被压缩进历史摘要。
- memory 内部使用 pinned + contextual retrieval + rerank，输出层为顶层 `memories` 扁平数组。
- work context 从当前 chat 读取，并受长度上限约束。
- recent activities 从 activity journal 和 compressed summary 中聚合，输出短卡片，支持新 chat 的近期工作连续性。
- `compressed_summary` 全文作为召回源使用，`awake_state` 中只保留短摘要卡片。
- `chat_meta` 和兼容 `session_meta` 保留稳定 chat 标识字段，省略 `last_active_at`。
- emotion baseline 与本轮 final emotion 明确分离。
- `emotion_report` 成为可选状态写入工具。
- thinking 模型在普通回答结束前无需因强制 emotion tail-call 进入额外 continuation。
- mood notes 字段预留，后续可接入独立存储和后台 reflection。
- `awake` 作为 server-side bootstrap 行为实现，模型可见 tool registry 中不注册 `awake`。
