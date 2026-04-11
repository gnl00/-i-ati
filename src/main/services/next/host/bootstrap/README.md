# bootstrap

这一层定义外部宿主输入如何被规范化成 `AgentLoopInput`。

它解决的不是 host 如何显示结果，而是：

- chat / telegram / 其他宿主的原始输入长什么样
- 这些输入如何被转换成 loop 可接受的启动 contract

## 这一层负责什么

- 定义宿主侧原始请求 contract
- 定义从 host request 到 `AgentLoopInput` 的 bootstrap contract
- 消费外部已生成的单次 run 标识
- 消费显式的稳定标识/时间来源
- 明确首条 user record 如何进入 transcript
- 消费外部已解析好的 `AgentRequestSpec`
- 装配 loop 启动所需的稳定执行配置
- 保留用户输入的 typed content parts，而不是把图片/文件压扁成字符串
- 通过显式 materializer 生成首条 `user` record 和初始 `AgentTranscript`
- 这些 bootstrap materializer 应作为显式 runtime wiring 依赖注入，而不是隐藏在 bootstrap 实现内部

## 这一层不负责什么

- 不执行 `AgentLoop`
- 不改写 loop 语义
- 不负责 host output

一句话：

- `host/bootstrap` 负责“怎么进入 loop”
- `host/output` 负责“怎么离开 loop”

补充约束：

- `LoopRunDescriptor` 的生成/分配不属于 bootstrap
- bootstrap 只消费它，并把它带进 `AgentLoopInput`
- bootstrap 不应偷偷调用 `Date.now()` / `uuid()` 生成起始 transcript 或首条 user record
- 起始 `transcriptId` / `recordId` / `createdAt` / `updatedAt` / `timestamp` 应来自显式的 `RuntimeInfrastructure`
- 首条 `user` record 应通过显式 `UserRecordMaterializer` 生成
- 初始 `AgentTranscript` 应通过显式 `InitialTranscriptMaterializer` 生成
- `InitialTranscriptMaterializer` 的 `updatedAt` 应显式输入，而不是隐式假定为 `createdAt`
