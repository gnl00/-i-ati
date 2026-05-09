# Message Compression Token Strategy

## Current Behavior

消息压缩从消息数量阈值升级为 token 比例阈值。每次 run 完成后，post-run job 会检查压缩配置，并在达到阈值时生成新的滚动摘要。

当前触发公式：

```ts
usedTokenCount / contextWindowTokens >= triggerTokenRatio
```

默认值：

- `triggerTokenRatio`: `0.7`
- `contextWindowTokens`: 来自 `provider_models.context_window_tokens`
- `usedTokenCount`: 当前 active summary 尚未覆盖的消息 `tokens` 累计值

`messages.tokens` 由 run usage 写入 assistant message，当前值是 agent loop 多 step 的 API usage 累计 `totalTokens`。

## Runtime Flow

1. Chat run 完成，finalize 阶段保存 assistant message，并写入 `tokens`。
2. Post-run plan 判断 compression 是否 enabled + autoCompress。
3. `CompressionJobService` 触发 `MessageCompressionService.execute()`。
4. 压缩服务读取当前 chat 的 active summaries。
5. 已被 active summary 覆盖的 `messageIds` 会从本轮候选消息中排除。
6. 统计剩余消息的 `tokens`，计算 token ratio。
7. ratio 达到阈值后，本轮所有未压缩消息进入摘要生成。
8. 新摘要保存为 `active`；旧 active summary 标记为 `superseded`。
9. 新摘要的 `messageIds` 是累积集合，覆盖历史 summary 和本轮新增消息。

Skills context is reconstructed outside the compressed summary path. Active skills are tracked in `chat_skills`; request preparation rebuilds their `SKILL.md` content into a hidden `MESSAGE_SOURCE.SKILLS_CONTEXT` user message after applying the active summary. This keeps full skill documents out of compression summaries while preserving active skill instructions after compacting.

## Stored Fields

`compressed_summaries` 关键字段：

- `message_ids`: 被当前摘要覆盖的消息 ID JSON 数组
- `start_message_id`: 覆盖范围最小 message ID
- `end_message_id`: 覆盖范围最大 message ID
- `used_token_count_at_compression`: 触发本次压缩时的 token 累计值
- `original_token_count`: 被压缩消息文本的估算 token
- `summary_token_count`: 摘要文本的估算 token
- `compression_ratio`: `summary_token_count / original_token_count`
- `compression_model`: 生成摘要的模型 ID
- `status`: `active | superseded | invalid`

`provider_models.context_window_tokens` 是压缩阈值的模型窗口来源。

## Log Event

每次压缩策略评估都会写入 app log：

```json
{
  "scope": "MessageCompressionService",
  "msg": "compression.strategy.evaluated",
  "context": {
    "chatId": 190,
    "chatUuid": "e84efba9-8e14-439d-8685-0787eb6ebf4f",
    "modelId": "mimo-v2.5",
    "messageCount": 38,
    "activeSummaryCount": 0,
    "compressedMessageCount": 0,
    "uncompressedMessageCount": 37,
    "messagesToCompressCount": 37,
    "usedTokenCount": 764618,
    "contextWindowTokens": 1000000,
    "triggerTokenRatio": 0.7,
    "thresholdTokenCount": 700000,
    "tokenUsageRatio": 0.764618,
    "runPromptTokens": 75822,
    "runCompletionTokens": 2064,
    "runTotalTokens": 77886,
    "decisionBasis": "historical_uncompressed_message_tokens",
    "shouldCompress": true,
    "decisionReason": "threshold_reached"
  }
}
```

这个日志用于快速回答三类问题：

- 当前 chat 是否触发压缩
- 触发时 token ratio 是多少
- 模型 context window 和阈值配置是否存在

`decisionBasis` 记录当前判断口径，后续切换为 context occupancy 时可直接对比新旧行为。

## UI Display

`ConfigPanel` 的 compression 区域展示当前 token 消耗进度。展示口径与当前后端策略一致，使用历史累计 token 与模型 context window 的比例，帮助用户理解自动压缩触发点。

## Compact Instructions

摘要生成 prompt 明确保留优先级：

1. 架构决策保持完整表达
2. 已修改文件和关键变更
3. 验证状态，包含 pass/fail
4. 未解决 TODO 和回滚笔记
5. 工具输出保留 pass/fail 结论

标识符保持原样：UUID、hash、IP、端口、URL、文件名、PR 编号、commit hash。

## Verification Snapshot

2026-05-01 验证 chat：

- `chatUuid`: `e84efba9-8e14-439d-8685-0787eb6ebf4f`
- `chat_id`: `190`
- `model`: `mimo-v2.5`
- `contextWindowTokens`: `1000000`
- `triggerTokenRatio`: `0.7`
- `usedTokenCountAtCompression`: `764618`
- `tokenUsageRatio`: `76.46%`
- `summaryId`: `111`
- `status`: `active`
- covered messages: `37/37`

上一次检查为 `686732 / 1000000 = 68.67%`，结果为 `No need to compress`。下一轮达到 `76.46%` 后生成 active summary，流程符合当前策略。

## Next Improvement

更精确的 context-window 判断口径建议升级为：

```ts
contextOccupancyTokens / contextWindowTokens >= triggerTokenRatio
```

`contextOccupancyTokens` 建议由这些部分组成：

- active summary 的估算 token
- 当前仍会发送给模型的未压缩消息估算 token
- hidden skills context 的估算 token
- system prompt、tools schema、work context、attachments 的估算 token
- 输出预留预算，例如 `maxTokens` 或模型默认输出上限

历史累计 usage 继续用于成本趋势和 UI 消耗展示；压缩触发使用 context occupancy 可以更贴近模型单次请求窗口。
