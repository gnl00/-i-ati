# AgentLoop 空终态响应恢复记录

Archived: 2026-08-04<br>
Reason: Completed incident investigation and implementation record<br>
Original path: `docs/work/investigations/agent-loop-empty-terminal-response-recovery.md`<br>
Replaced by: [Chat runtime architecture](../../../architecture/chat-runtime-architecture-current.md#empty-terminal-response-recovery)

## 范围

本记录描述一次 chat agent 运行在工具调用完成后收到推理内容、正文为空的流式响应时，将任务标记为完成的故障。当前行为由
`src/main/agent/runtime/loop/AgentLoop.ts`、OpenAI 兼容请求适配器和 chat run finalizer 共同决定。

## 发现

用户观察到最新 chat 会话在连续网页工具调用后停留在“重新查”的旧助手文本，工具结果已经产生，任务状态却结束。

日志与持久化事件还原出以下顺序：

1. 运行持续执行多轮工具调用，最后一个工具结果进入 active transcript。
2. 后续模型请求正常发出，流返回 1,043 个字符的 `reasoning_content`。
3. 该流的正文长度为 0，原始 SSE 未提供 `finish_reason`，随后发送 `[DONE]`。
4. 运行事件写入 `run.completed`，并将上一个已持久化的助手草稿作为最终消息。

调度任务记录在该时间窗内已经独立完成，因此故障边界位于 chat agent 的模型终态处理。

## 排查

排查从 app 日志、request 日志和 `chat_run_events` 开始，再沿以下链路阅读代码：

```text
unifiedChatRequest
  -> OpenAIAdapter / BaseAdapter
  -> ModelStreamExecutor
  -> ModelResponseParser
  -> AgentLoop
  -> RunFinalizer
  -> ChatAgentAdapter.finalizeRun
```

发现两个条件共同产生了错误完成：

1. `BaseAdapter` 会将缺失的流式 `finishReason` 补成 `stop`，`OpenAIAdapter` 也会在每个未携带原始终态字段的分片上调用该默认映射。推理分片因此具备了伪造的终态信息。
2. `AgentLoop` 在流迭代结束后只依据 `toolCalls.length` 决定续跑。空工具调用分支直接 materialize step 并返回 `completed`，正文是否为空没有参与终态判断。

这条路径没有抛出请求异常，因此 `ModelStreamExecutor` 的网络重试不参与处理。chat finalizer 随后取得当前 assistant draft，旧文本便被再次收口。

## 修复

实现保留了 provider 与 runtime 的职责边界：

1. `IUnifiedResponse.finishReason` 改为可选字段。
2. `BaseAdapter`、`OpenAIAdapter` 和 `OpenAIImage1Adapter` 将缺失的流式终态字段保持为 `undefined`。显式终态继续通过原有映射归一化。
3. `AgentLoop` 将“零工具调用且零 trimmed 正文”识别为不完整模型响应。首次命中只记录 `response.incomplete_retry_scheduled`，以同一 transcript 重试一次，不追加 transcript record，也不发出 step 或 loop 的 completed 事件。
4. 第二次命中返回 `IncompleteModelResponseError`，错误码为 `INCOMPLETE_MODEL_RESPONSE`。`RunFinalizer` 进入失败分支，旧助手草稿保持原持久化状态。

一次恢复上限控制工具密集会话的额外请求量。重试成功后走原有正文完成路径，工具调用、steering 和正常 `stop` 响应保持原有语义。

## 回归保护

自动化用例覆盖以下场景：

- OpenAI SSE 推理分片缺失 `finish_reason` 时，适配器保留 `undefined`。
- OpenAI SSE 显式 `stop` 时，适配器保留归一化后的 `stop`。
- 工具调用后出现 think-only 响应时，运行使用相同 transcript 完成一次恢复，空响应不进入持久化 transcript。
- 两次空终态响应返回 `INCOMPLETE_MODEL_RESPONSE`，不发出 `loop.completed`。
- run orchestration 在 runtime failed 结果下保持 finalizer 的失败分支。

验证命令：

```bash
pnpm run typecheck:node
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/main/request/adapters/__tests__/openai.adapter.test.ts \
  src/main/agent/runtime/model/__tests__/ModelStreamExecutor.test.ts \
  src/main/agent/runtime/model/__tests__/ModelResponseParser.test.ts \
  src/main/agent/runtime/__tests__/AgentRuntime.test.ts
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/main/orchestration/chat/run/runtime/__tests__/AgentRun.test.ts \
  src/main/orchestration/chat/run/runtime/__tests__/AgentRun.runtime.integration.test.ts
pnpm run check:main-boundaries
git diff --check
```

聚焦验证结果：类型检查通过，运行时与适配器测试 33 项通过，run orchestration 测试 9 项通过，主进程边界检查通过。

## 运行时验收

Electron 验收路径：触发包含工具调用的会话，让后续 provider 流只返回 reasoning 后结束。首轮应保持运行状态并发起一次续答；第二次同类结果应显示明确失败状态，历史正文保持上一条已提交回复。
