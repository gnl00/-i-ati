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
