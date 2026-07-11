# Token Usage Cache Persistence Plan

Owner: Chat runtime maintainers<br>
Status: Active<br>
Started: 2026-07-11<br>
Target: Persist and restore token usage cache safely<br>
Exit criteria: Implementation and focused tests pass; durable behavior is documented<br>
Related specs: [Documentation governance](../../../specs/documentation-governance.md)<br>
Related implementation: `src/main`, `src/renderer/src`

## Context

2026-05-16 的 app log 已经能从 OpenAI-compatible 最终 stream usage chunk 里读到 prompt cache 细项：

```json
{
  "usage": {
    "prompt_tokens": 468136,
    "completion_tokens": 145,
    "total_tokens": 468281,
    "prompt_tokens_details": {
      "cached_tokens": 467968
    },
    "completion_tokens_details": {
      "reasoning_tokens": 18
    },
    "prompt_cache_hit_tokens": 467968,
    "prompt_cache_miss_tokens": 168
  }
}
```

当前 runtime 会请求 `stream_options.include_usage = true`，并把最终 usage 传入 agent loop。标准化后的 `ITokenUsage` 字段集合为：

```ts
interface ITokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
```

最终落库时，`ChatStepStore.finalizeAssistantMessage()` 把 `usage.totalTokens` 写入 `messages.tokens`。这支持压缩触发和粗粒度用量展示。缓存命中、缓存未命中、reasoning token 等细项当前来源位于原始日志。

## Goals

1. 在 `ITokenUsage` 里保留 prompt cache hit/miss/write 细项。
2. 在消息持久化层保存每条 assistant message 的 usage 明细。
3. 保持 `messages.tokens` 作为历史总 token 口径，继续服务压缩策略和现有 UI。
4. 支持 OpenAI-compatible 与 Claude-style provider 的字段归一化。
5. 给后续统计页、成本估算、缓存命中率诊断提供稳定数据源。

V1 范围聚焦前向写入、运行链路透传和 compression 日志观测。Backfill 进入后续专项。

## Current Flow

```text
provider stream chunk
  -> request adapter extractUsage()
  -> IUnifiedStreamResponse.usage
  -> ModelResponseParser usage_delta
  -> AgentStepDraft.snapshot.usage
  -> AgentStep.usage
  -> AgentLoop mergeUsage()
  -> ChatAgentAdapter result.usage
  -> ChatFinalizeService
  -> ChatStepStore.finalizeAssistantMessage()
  -> MessageEntity.tokens
  -> messages.tokens
```

关键代码位置：

- `src/main/request/index.ts`: 注入 `stream_options.include_usage = true`
- `src/main/request/adapters/openai/OpenAIAdapter.ts`: OpenAI-compatible usage 解析
- `src/main/request/adapters/claude.ts`: Claude usage 解析
- `src/main/agent/runtime/loop/AgentLoop.ts`: 多 step usage 汇总
- `src/main/hosts/chat/persistence/ChatStepStore.ts`: assistant message finalize
- `src/main/db/core/Database.ts`: `messages` schema
- `src/main/db/dao/MessageDao.ts`: message row 读写
- `src/main/db/mappers/MessageMapper.ts`: `MessageEntity` 和 `MessageRow` 映射

## Data Model

### `ITokenUsage`

推荐把细项作为可选字段加入全局类型：

```ts
declare interface ITokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  promptCacheHitTokens?: number
  promptCacheMissTokens?: number
  promptCacheWriteTokens?: number
  reasoningTokens?: number
}
```

字段语义：

- `promptTokens`: provider 报告的输入 token 总数。
- `completionTokens`: provider 报告的输出 token 总数。
- `totalTokens`: provider 报告或本地计算的总 token。
- `promptCacheHitTokens`: 本次请求输入中命中 prompt cache 的 token。
- `promptCacheMissTokens`: 本次请求输入中进入常规计费或常规处理路径的 token。
- `promptCacheWriteTokens`: 本次请求写入 prompt cache 的 token，Claude-style provider 常见。
- `reasoningTokens`: provider 报告的 reasoning / thinking 输出 token。

`promptCacheHitTokens + promptCacheMissTokens` 理想情况下等于 `promptTokens`。部分 provider 会把 cache creation 与 regular input 分开报告，因此汇总和展示层应以 provider 原始语义为准。

### `MessageEntity`

推荐给消息实体增加 usage 明细字段：

```ts
declare interface MessageEntity {
  id?: number
  chatId?: number
  chatUuid?: string
  body: ChatMessage
  tokens?: number
  tokenUsage?: ITokenUsage
}
```

`tokens` 继续保存 `tokenUsage.totalTokens` 的快捷值，服务现有压缩策略和列表展示。`tokenUsage` 保存完整明细，服务统计和诊断。

### `messages` table

推荐增加一个 JSON 列保存明细：

```sql
ALTER TABLE messages ADD COLUMN token_usage TEXT;
```

`token_usage` 示例：

```json
{
  "promptTokens": 468136,
  "completionTokens": 145,
  "totalTokens": 468281,
  "promptCacheHitTokens": 467968,
  "promptCacheMissTokens": 168,
  "reasoningTokens": 18
}
```

选择 JSON 列的原因：

- provider usage 字段会继续扩展，JSON 列便于保留新增细项。
- 当前查询路径主要按 message 读取，cache 字段索引可以留到统计页阶段追加。
- `messages.tokens` 已覆盖压缩策略所需的整数聚合。

若后续需要高频统计全局 cache hit rate，可以追加派生列或独立 daily aggregate 表。

## Provider Mapping

### OpenAI-compatible

`OpenAIAdapter.extractUsage()` 增加字段归一化：

```ts
const promptCacheHitTokens =
  usage.prompt_cache_hit_tokens
  ?? usage.prompt_tokens_details?.cached_tokens

const promptCacheMissTokens =
  usage.prompt_cache_miss_tokens
  ?? (
    typeof promptCacheHitTokens === 'number'
      ? usage.prompt_tokens - promptCacheHitTokens
      : undefined
  )

const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens
```

映射结果：

- `prompt_tokens` -> `promptTokens`
- `completion_tokens` -> `completionTokens`
- `total_tokens` -> `totalTokens`
- `prompt_cache_hit_tokens` 或 `prompt_tokens_details.cached_tokens` -> `promptCacheHitTokens`
- `prompt_cache_miss_tokens` 或 `prompt_tokens - promptCacheHitTokens` -> `promptCacheMissTokens`
- `completion_tokens_details.reasoning_tokens` -> `reasoningTokens`

### Claude-style

Claude Messages API 常见字段：

```json
{
  "usage": {
    "input_tokens": 1200,
    "output_tokens": 80,
    "cache_creation_input_tokens": 600,
    "cache_read_input_tokens": 400
  }
}
```

映射结果：

- `input_tokens` -> `promptTokens`
- `output_tokens` -> `completionTokens`
- `input_tokens + output_tokens` -> `totalTokens`
- `cache_read_input_tokens` -> `promptCacheHitTokens`
- `cache_creation_input_tokens` -> `promptCacheWriteTokens`
- `input_tokens - cache_read_input_tokens - cache_creation_input_tokens` -> `promptCacheMissTokens`

`promptCacheMissTokens` 计算时做下限保护：

```ts
Math.max(0, inputTokens - cacheReadInputTokens - cacheCreationInputTokens)
```

### Request-adapter plugins

插件 API 文档里的 `ITokenUsage` 同步更新。插件返回标准化字段，宿主负责聚合和落库。

## Runtime Aggregation

`AgentLoop.mergeUsage()` 当前累加三项。扩展后使用 helper 统一处理可选字段：

```ts
const addOptional = (a?: number, b?: number): number | undefined => {
  if (a === undefined) return b
  if (b === undefined) return a
  return a + b
}

const mergeUsage = (
  previous: ITokenUsage | undefined,
  next: ITokenUsage | undefined
): ITokenUsage | undefined => {
  if (!previous) return next
  if (!next) return previous
  return {
    promptTokens: previous.promptTokens + next.promptTokens,
    completionTokens: previous.completionTokens + next.completionTokens,
    totalTokens: previous.totalTokens + next.totalTokens,
    promptCacheHitTokens: addOptional(previous.promptCacheHitTokens, next.promptCacheHitTokens),
    promptCacheMissTokens: addOptional(previous.promptCacheMissTokens, next.promptCacheMissTokens),
    promptCacheWriteTokens: addOptional(previous.promptCacheWriteTokens, next.promptCacheWriteTokens),
    reasoningTokens: addOptional(previous.reasoningTokens, next.reasoningTokens)
  }
}
```

多 step agent run 的最终 usage 是 step usage 的加总。cache hit/miss/write 也按 step 加总，这符合成本统计口径。

## Persistence Plan

### Schema

在 `Database.initialize()` 的 messages schema 后加入迁移：

```ts
this.ensureColumn('messages', 'token_usage', 'TEXT')
```

新库通过 `CREATE TABLE` 创建 `token_usage TEXT`，旧库通过 `ensureColumn` 补列。

### DAO

`MessageRow` 增加：

```ts
token_usage: string | null
```

`insertMessage` 与 `updateMessage` SQL 增加 `token_usage`：

```sql
INSERT INTO messages (chat_id, chat_uuid, body, tokens, token_usage)
VALUES (?, ?, ?, ?, ?)
```

```sql
UPDATE messages
SET chat_id = ?, chat_uuid = ?, body = ?, tokens = ?, token_usage = ?
WHERE id = ?
```

### Mapper

`MessageMapper` 增加 JSON 序列化和容错解析：

```ts
const parseTokenUsage = (value: string | null): ITokenUsage | undefined => {
  if (!value) return undefined
  try {
    const usage = JSON.parse(value) as ITokenUsage
    if (
      typeof usage.promptTokens !== 'number'
      || typeof usage.completionTokens !== 'number'
      || typeof usage.totalTokens !== 'number'
    ) {
      return undefined
    }
    return usage
  } catch {
    return undefined
  }
}
```

写入规则：

- `message.tokenUsage` 存在时写入 `token_usage`。
- `message.tokens` 继续写入 `tokens`。
- Legacy message 读取时 `tokenUsage` 为空，`tokens` 保持原值。

### Finalize

`ChatStepStore.finalizeAssistantMessage()` 在 usage 存在时同时写入：

```ts
{
  tokens: usage.totalTokens,
  tokenUsage: usage
}
```

这样新消息拥有完整 usage 明细，现有消费方继续读取 `tokens`。

## Logging and Observability

`MessageCompressionService` 当前日志记录：

- `runPromptTokens`
- `runCompletionTokens`
- `runTotalTokens`

推荐补充：

- `runPromptCacheHitTokens`
- `runPromptCacheMissTokens`
- `runPromptCacheWriteTokens`
- `runReasoningTokens`

新增日志能直接回答：

- 本轮 run 的 prompt cache 命中率
- 压缩触发前后 cache 命中是否下降
- 大上下文场景中 miss token 来源是否异常

## Future Backfill

历史日志里存在完整 usage chunk，数据库当前字段为 `messages.tokens`。可选 backfill 策略：

1. 读取 app log 中带 `prompt_cache_hit_tokens` 的最终 usage chunk。
2. 按时间顺序提取 `id/model/time/usage`。
3. 读取同日 assistant messages，按 `createdAt` 时间窗口匹配。
4. 匹配成功后写入 `messages.token_usage`。
5. 未匹配记录输出报告，人工确认。

首版实现前向写入。backfill 独立做一次性脚本，主迁移保持简洁。

## Testing Plan

### Adapter tests

OpenAI-compatible：

- 解析 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`。
- 当 payload 提供 `prompt_tokens_details.cached_tokens` 时计算 miss。
- 解析 `completion_tokens_details.reasoning_tokens`。

Claude：

- 解析 `cache_read_input_tokens`。
- 解析 `cache_creation_input_tokens`。
- 计算 `promptCacheMissTokens`。

### Runtime tests

`AgentLoop.mergeUsage()` 覆盖：

- 单 step usage 原样返回。
- 多 step 三项总数累加。
- 多 step cache hit/miss/write/reasoning 累加。
- 部分 step 的可选字段为空时保留已有值。

### Persistence tests

`ChatStepStore.test.ts`：

- finalize 写入 `tokens = usage.totalTokens`。
- finalize 写入 `tokenUsage = usage`。

`MessageMapper.test.ts`：

- `MessageEntity.tokenUsage` 写入 `MessageRow.token_usage`。
- `MessageRow.token_usage` 读回 `MessageEntity.tokenUsage`。
- legacy row 的 `token_usage = null` 正常读回。
- malformed JSON 场景返回空 usage，并保留 message 主体。

`MessageRepository` / DAO tests：

- insert/update SQL 覆盖 `token_usage`。
- Legacy database 迁移后存在 `token_usage` 列。

## Rollout Steps

1. 扩展 `ITokenUsage` 和 `MessageEntity` 类型。
2. 更新 OpenAI-compatible 与 Claude adapter 的 `extractUsage()`。
3. 更新 `AgentLoop.mergeUsage()`。
4. 更新 messages schema、DAO、mapper。
5. 更新 `ChatStepStore.finalizeAssistantMessage()`。
6. 更新插件 API 文档中的 `ITokenUsage`。
7. 补充 adapter、runtime、mapper、finalize、migration 测试。
8. 运行 `pnpm test:run`，必要时运行 `pnpm build`。
9. 用一次真实 stream 请求确认 app log、message row、compression log 三处 usage 一致。

## Example Query

SQLite 中统计 prompt cache 命中率：

```sql
SELECT
  SUM(json_extract(token_usage, '$.promptCacheHitTokens')) AS cache_hit_tokens,
  SUM(json_extract(token_usage, '$.promptCacheMissTokens')) AS cache_miss_tokens,
  ROUND(
    1.0 * SUM(json_extract(token_usage, '$.promptCacheHitTokens'))
    / NULLIF(SUM(json_extract(token_usage, '$.promptTokens')), 0),
    4
  ) AS prompt_cache_hit_rate
FROM messages
WHERE token_usage IS NOT NULL;
```

按 chat 统计：

```sql
SELECT
  chat_uuid,
  SUM(json_extract(token_usage, '$.promptTokens')) AS prompt_tokens,
  SUM(json_extract(token_usage, '$.promptCacheHitTokens')) AS cache_hit_tokens,
  SUM(json_extract(token_usage, '$.promptCacheMissTokens')) AS cache_miss_tokens,
  SUM(json_extract(token_usage, '$.totalTokens')) AS total_tokens
FROM messages
WHERE token_usage IS NOT NULL
GROUP BY chat_uuid
ORDER BY total_tokens DESC;
```

## Open Questions

1. UI 需要展示 run 级 cache hit rate，还是 chat/day 级聚合。
2. 成本估算是否需要 provider/model 价格表区分 cached input、uncached input、cache write。
3. `token_usage` 是否需要同步写入 hidden assistant messages；当前建议所有带 usage 的 assistant message 统一写入。
