# request

这一层定义一次模型请求所需的稳定请求规格。

它回答的问题是：

- 这一轮要用哪个模型
- 走哪个 base URL，用哪份认证信息
- 带哪些 system prompt / user instruction
- 开哪些 tools
- 带哪些 stream / options / request overrides

## 这一层负责什么

- 定义与单次模型请求绑定的稳定请求维度
- 给 `AgentLoopInput` 提供一等的 request contract
- 给 `RequestMaterializer` 提供明确的请求规格输入

关键定位：

- `AgentRequestSpec` 是整轮 run 共享的一份 immutable spec
- runtime 应在 run 启动时 resolve 好它，再交给 loop 使用
- 如果未来需要不同 step 使用不同规格，应显式产生新的 spec，而不是在原对象上原地修改
- 认证维度也应在这里显式提供，不允许下游再偷偷补一份 request auth context
- `RequestMaterializer` 会消费这份 spec，但产出的是协议层请求结果，不直接承诺等同于现有 `IUnifiedRequest`
- 协议层请求中的 user message 需要保留 typed content parts，不允许在 request 侧丢失多模态输入

## 这一层不负责什么

- 不保存 transcript
- 不保存运行中的 mutable state
- 不直接承载 host-facing output

## 文件说明

- `AgentRequestSpec.ts`
  - 单次模型请求所需的稳定请求规格

## 和 loop / transcript 的关系

- `loop/`
  - 持有这次 run 要使用的 `AgentRequestSpec`
- `transcript/`
  - 提供历史事实
- `RequestMaterializer`
  - 基于 `AgentTranscript + AgentRequestSpec` 生成下一次模型请求

一句话：

- `AgentRequestSpec` 负责“这次请求按什么规格发”
- `AgentTranscript` 负责“这次请求基于哪些历史发”
