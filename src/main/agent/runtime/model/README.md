# model

这一层定义当前 runtime 和模型调用设施之间的桥接 contract。

它显式解决两段转换：

1. `MaterializedProtocolRequest` 如何适配成当前可发的请求
2. 当前可发请求如何真正执行成规范化 `ModelResponseStream`
3. `ModelResponseStream` 如何转成 loop 可消费的 step facts

## 这一层负责什么

- 定义协议请求到可执行请求的适配 contract
- 定义可执行请求如何被真正发送并返回规范化响应流
- 定义规范化响应流到 step facts 的解析 contract
- 定义 parser state 如何在连续 chunk 之间显式传递
- 定义 typed user content parts 如何映射到当前 `IUnifiedRequest` / `ChatMessage[]` 形态
- 区分 parser 输出中的单条 tool call delta 和累计后的 tool call snapshot
- 定义 tool call 拼接状态如何在连续 chunk 之间显式传递
- 定义 tool call 从“开始出现名字”到“完整可执行”这两个稳定节点

## 这一层不负责什么

- 不定义 transcript
- 不定义 host output
- 不改写 loop 的状态机语义
- 不把多模态输入先退化成字符串再留给下游猜回去
- 不把累计 `toolCalls` snapshot 伪装成单条 delta 事实
- 不把 tool call arguments 拼接状态偷偷藏回 parser 私有实现而不写入 contract
- 不把 tool call 对外事实退化成无边界的 `argumentsDelta` 流

一句话：

- `transcript/RequestMaterializer` 负责“协议请求长什么样”
- `runtime/model` 负责“怎么接到当前可执行设施上、怎么真正执行请求、怎么把 provider 响应规范化，以及怎么把响应流变成 step facts”
- typed content parts 到当前统一请求消息格式的保真映射，也属于这一层
- think tag 状态和 tool call 拼接状态，也都属于这一层的显式 parser state
- `ModelStreamExecutor` 应把当前 `IUnifiedResponse | IUnifiedStreamResponse` 规范化成 `ModelResponseChunk`
- `ModelResponseParser` 只依赖 `ModelResponseChunk`，不直接依赖 provider/unified response union
- `ModelResponseParser` 的 think-tag 词法状态应由 `runtime/model` 自己定义，不再直接借用 legacy parser state
- `tool_call_started` 和 `tool_call_ready` 之间的拼接过程，应由 parser state 管理
- `tool_call_ready` 不要求前面必须已有 `tool_call_started`
- 如果 parser 在同一个 chunk 同时拿到名字和完整参数，可以直接产出 `tool_call_ready`
- 如果同时选择把 started 也发出来，语义顺序仍应按 started -> ready 解释
