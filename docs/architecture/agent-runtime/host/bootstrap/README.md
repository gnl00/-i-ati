# Bootstrap

Source: [实现目录](../../../../../src/main/agent/runtime/host/bootstrap/)<br>
Documentation: [Agent runtime](../../README.md)

Bootstrap 将 Host 请求、已解析的 `AgentRequestSpec`、run 标识及执行配置转成 `AgentLoopInput`。
输入直接包含 `records: ContextRecord[]`，没有 seed 或 live transcript 的中转容器。
Chat / CLI 的 `MainAgentLoopInputBootstrapper` 调用一次 `mapChatContext`；通用 subagent bootstrap
用 `createUserContextRecord` 建立 typed 用户输入。时间、record ID 来自 `RuntimeInfrastructure`。

Bootstrap 不运行 Loop、不访问模型、不决定预算、不保存 Host UI 状态。ContextManager 由 Loop 创建，
并在每次模型发送时负责历史选择和压缩。输入 media parts 保留类型，图像策略由请求投影处理。

## Submission intent

Desktop submits `RunToolSelection` (web-search toggle and connected MCP/explicit
names), rather than executable schemas. Chat preparation resolves definitions from
Main registries and applies capability requirements once. A disconnected selected
tool fails preparation explicitly. Hosts without selection retain their existing
tool defaults. The resulting request names also restrict ToolExecutor; an unknown
or excluded call is rejected before approval. A run can change its approval mode
without expanding this resolved executable set.

Chat instruction precedence is explicit `chatUserInstruction` (including empty),
then persisted Chat instruction. Per-run `userInstruction` is appended, with exact
duplicates removed; scheduled runs add the schedule execution policy. These are
request context and do not rewrite historical messages or user preferences.

## Preparation cancellation

RunPreparationOptions carries the same run AbortSignal through environment setup,
vision observation and request assembly. Cancellation stops waiting for asynchronous
context providers and prevents subsequent snapshots, observation messages and model
dispatch. The already-persisted user input remains available. Local operations that
cannot cancel may finish in the background; they cannot commit a late request snapshot.
Vision timeout remains a failed observation; user cancellation is an aborted run.

Main admission resolves an existing conversation before preparation and rejects a
second primary run with `CHAT_RUN_BUSY`. The registry retains ownership through Stop
cleanup, then permits the next submit. ID-only and UUID-only submissions share the
same ownership. New conversations omit both fields; stale identities fail explicitly.

## Preparation scheduling and measurements

Environment resolution captures one application-config snapshot. Model selection,
vision slot, capability conditions, user runtime context and knowledgebase policy use
that snapshot. Skill content remains a separately read service snapshot and existing
approval-mode updates remain live.

After the user input is persisted, vision/bootstrap and request-context preparation
overlap. System prompt, loaded skills, user profile, knowledgebase and Awake context
are independent concurrent work. Final assembly waits for both branches, preserves
message order and writes the request snapshot once. Failure aborts the sibling branch
and waits for its cancellation boundary before returning.

`ChatPreparation` logs `preparation.measured` with submission ID, terminal status and
monotonic environment/bootstrap/context/assembly/total milliseconds. It records no
prompt bodies or credentials. Deterministic fixtures with 80ms vision and 120ms context
complete in 120ms, demonstrating overlap; these are simulated timings, not provider or
real-device latency claims.
