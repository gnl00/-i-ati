# transcript

这一层定义给模型继续推理用的内部协议历史。

这里的 transcript 不是 chat transcript，而是 runtime 协议历史。

## 这一层负责什么

- 保存 user / assistant step / tool result 的内部历史
- 为下一次模型请求构造 request messages
- 为 loop 回放和调试提供完整上下文
- 承载 `AgentStep` 在 transcript 中的包装记录

更具体地说，这一层内部有两个不同职责：

- `AgentTranscript`
  - 负责保存 runtime 内部历史
  - 回答“当前 loop 已经积累了哪些协议事实”
- `AgentTranscriptSnapshot`
  - 负责表达 loop 结束时稳定冻结下来的 transcript 快照
  - 回答“这一轮 run 最终留下了哪份协议历史”
- `RequestMaterializer`
  - 负责把这份内部历史连同 `AgentRequestSpec` 一起物化成下一次模型请求
  - 回答“基于当前 transcript，下一次该发给模型的协议请求长什么样”

## 这一层不负责什么

- 不直接暴露为用户消息
- 不直接落库
- 不携带 host UI 状态
- 不把 request materialization 和 transcript mutation 混成一个对象

## 文件说明

- `AgentTranscript.ts`
  - runtime 内部协议历史容器，以及终态 transcript snapshot 定义
- `AgentContentPart.ts`
  - runtime 内部用于表达 typed user input 的内容块定义
- `AgentTranscriptRecord.ts`
  - transcript 内的单条记录定义
- `UserRecordMaterializer.ts`
  - 把首条用户输入物化成稳定的 `user` record
- `InitialTranscriptMaterializer.ts`
  - 把首批 records 物化成初始 live transcript
- `AgentTranscriptAppender.ts`
  - 把稳定 records 追加进 live transcript
- `AgentTranscriptSnapshotMaterializer.ts`
  - 把 live transcript 物化成终态 `AgentTranscriptSnapshot`
- `AssistantStepRecordMaterializer.ts`
  - 把 `AgentStep` 物化成稳定的 `assistant_step` record
- `ToolResultRecordMaterializer.ts`
  - 把 `ToolResultFact` 物化成稳定的 `tool_result` record
- `RequestMaterializer.ts`
  - 从 transcript 构造协议层请求 contract

## 和 RequestMaterializer 的关系

- `AgentTranscript`
  - 是 source of truth
  - 持有按顺序排列的内部 records
- `UserRecordMaterializer`
  - 负责 `AgentContentPart[] -> AgentTranscriptUserRecord`
- `InitialTranscriptMaterializer`
  - 负责 `AgentTranscriptRecord[] -> AgentTranscript`
  - 用于 bootstrap 生成初始 transcript
- `AgentTranscriptAppender`
  - 负责把稳定 records 追加进 live transcript，并推进 `updatedAt`
- `AgentTranscriptSnapshot`
  - 是终态只读快照
  - 用于 `AgentLoopResult` 暴露最终 transcript
- `AgentTranscriptSnapshotMaterializer`
  - 负责 `AgentTranscript -> AgentTranscriptSnapshot`
  - 用于 loop terminal 收口
- `RequestMaterializer`
  - 是只读消费者
  - 读取 `AgentTranscript` 和 `AgentRequestSpec`，生成协议层请求结果

关键约束：

- `RequestMaterializer` 不负责修改 transcript
- `AgentTranscript` 不负责直接生成 provider request payload
- `UserRecordMaterializer` 不负责初始 transcript 容器生成
- `InitialTranscriptMaterializer` 不负责 record 生成
- `InitialTranscriptMaterializer` 的 `updatedAt` 应显式输入，不应在内部默默假定 `updatedAt = createdAt`
- `AgentTranscriptAppender` 不负责生成 records
- `AgentTranscriptSnapshotMaterializer` 不负责 live transcript mutation
- `AgentTranscriptSnapshot` 不是 live mutable transcript container
- `AgentTranscriptSnapshot` 当前表达的是“快照语义 + records 数组只读”，不是深不可变对象
- transcript 的保存职责和 request 的组装职责必须分开
- 请求规格应来自显式的 `AgentRequestSpec`，而不是临时 request bag
- 认证信息也应来自显式的 `AgentRequestSpec`，不允许在 materialize 之后再偷偷补
- materialize 结果是协议层 contract，不等价于现有主线的 `IUnifiedRequest`
- user 输入内容必须保留 typed content parts，不允许在 transcript 层先压扁成单一字符串

## 和 step 的关系

- `AgentStep`
  - 是单次模型请求的稳定结果
- `AgentTranscriptRecord`
  - 是 transcript 中的记录壳
  - 当 kind 为 `assistant_step` 时，它应该包住一个 `AgentStep`
- `UserRecordMaterializer`
  - 负责 bootstrap 阶段的首条 `user` record 生成
- `AssistantStepRecordMaterializer`
  - 负责 `AgentStep -> AgentTranscriptAssistantStepRecord`

也就是说：

- `step/` 负责定义 step 本身
- `transcript/` 负责定义 step 如何进入内部协议历史
- bootstrap 侧的首条 `user` record 和初始 transcript 也应通过显式 materializer 完成

## 和 tools 的关系

- tool execution progress
  - 属于运行过程事实
  - 应该走 `events/`
- tool awaiting confirmation
  - 属于运行过程事实
  - 应该走 `events/`
- tool execution result
  - 属于需要回传模型的协议事实
  - 应该以 `tool_result` record 的形式进入 transcript

关键约束：

- transcript 只保存会影响后续模型请求的 tool 结果
- confirmation denied 如果需要让模型感知，应先被规范化成稳定的 denied/aborted tool result，再进入 transcript
- 纯进度、日志、spinner 状态不进入 transcript
- `AgentStep -> AgentTranscriptAssistantStepRecord` 的 write-back 应通过显式 materializer 完成
- `ToolResultFact -> AgentTranscriptToolResultRecord` 的 write-back 应通过显式 materializer 完成
- records 进入 live transcript 的 append/update 也应通过显式 appender 完成

一句话：

- `AgentTranscript` 负责“存什么”
- `RequestMaterializer` 负责“基于什么历史、按什么规格生成协议请求”
