# Bootstrap

Source: [实现目录](../../../../../src/main/agent/runtime/host/bootstrap/)<br>
Documentation: [Agent runtime](../../README.md)

Bootstrap 将 Host 请求、已解析的 `AgentRequestSpec`、run 标识及执行配置转成 `AgentLoopInput`。
输入直接包含 `records: ContextRecord[]`，没有 seed 或 live transcript 的中转容器。
Chat / CLI 的 `MainAgentLoopInputBootstrapper` 调用一次 `mapChatContext`；通用 subagent bootstrap
用 `createUserContextRecord` 建立 typed 用户输入。时间、record ID 来自 `RuntimeInfrastructure`。

Bootstrap 不运行 Loop、不访问模型、不决定预算、不保存 Host UI 状态。ContextManager 由 Loop 创建，
并在每次模型发送时负责历史选择和压缩。输入 media parts 保留类型，图像策略由请求投影处理。
