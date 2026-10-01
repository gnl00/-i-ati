# Runtime type checklist

## 所有权

| Contract | Owner | Consumer |
| --- | --- | --- |
| AgentRuntimeRunInput / HostRunRequest | Host ingress | Runtime sources / bootstrap |
| AgentRequestSpec | Request source | ContextManager / model adapter |
| AgentLoopInput.records | Bootstrap | ContextManager |
| ContextRecord | Context | Loop / request projection |
| AgentStep / ToolResultFact | Stable execution facts | Context record functions |
| MaterializedProtocolRequest | ContextManager | ExecutableRequestAdapter |
| IUnifiedRequest / ModelResponseStream | Model bridge | Provider / Loop parser |
| ContextSnapshot / AgentLoopResult | Loop terminal | Host / CLI artifacts |

ContextManager 保存唯一 live records，`prepare()` 生成预算内请求视图，`snapshot()` 复制完整记录数组。
Host 仅通过 `agent/contracts` 公开入口消费核心类型；数据库消息映射留在 `hosts/chat`。
运行时无 initial seed、初始容器 materializer、append/snapshot 包装服务，也无 assistant body 步骤字段。

## 审查约束

- 当前用户目标、steering、有效运行上下文与未消费调用/结果完整保护。
- 所有模型入口都在每次发送前经过同一 manager；计量使用最终 adapter body。
- 原始工具 content 与稳定 modelContent 分开，budget 不改写持久化结果。
- 只有稳定 AgentStep 入 records；进度/确认/UI patch 走事件。
- 失败/取消终态导出完整已确认事实，不发送缺失工具结果的 continuation。
- snapshot records 只读数组，不承诺深不可变。
- 认证、tools、overrides 来自显式 request spec；manager 无数据库、UI、宿主身份依赖。

See [Context](context/README.md), [Loop](loop/README.md), [Scenarios](scenarios.md).
