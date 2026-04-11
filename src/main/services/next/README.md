# next

`next` 是下一代 agent runtime 架构的设计草图目录。

这里先定义目录、文件和职责边界，不接入当前运行链路，不承载生产逻辑。

参照文档：

- [CURRENT_ARCHITECTURE_ISSUES.md](/Users/gnl/Workspace/code/-i-ati/src/main/services/next/CURRENT_ARCHITECTURE_ISSUES.md)
  - 当前架构存在的问题清单
  - 作为 `next` 方案的背景输入
- [SCENARIOS.md](/Users/gnl/Workspace/code/-i-ati/src/main/services/next/SCENARIOS.md)
  - `next` 的核心时序真值表
  - 用来固定 tool round-trip / final answer / abort / confirmation denied 的 contract
- [TYPE_CHECKLIST.md](/Users/gnl/Workspace/code/-i-ati/src/main/services/next/TYPE_CHECKLIST.md)
  - 场景到 contract 的类型对照表
  - 用来明确每条场景会落到哪些类型，以及下一步最该补哪些字段

## 设计目标

1. 保持 core 足够小
   - 一个 `AgentLoop`
   - 一组 runtime-native state
   - 一条明确的 event 出口
2. 不让 core 直接操作 chat transcript / renderer / database
3. 把“模型循环”和“用户可见输出”彻底分开
4. 让不同 host 只通过事件和输出策略接入

## 核心判断

- `AgentLoop` 只负责：
  - 构造请求
  - 消费流式响应
  - 解析 step
  - 调度 tool batch
  - 将 tool result 回传模型并继续下一步
- `events/` 只定义 loop 对外广播的事实
- `step/` 只定义单次模型请求的 runtime 单元
- `request/` 只定义单次模型请求的稳定请求规格
- `transcript/` 只定义 runtime 内部的协议历史，以及如何把这份历史物化成模型请求
- `transcript/` 里的 user 输入必须保留 typed content parts，避免多模态在进入 loop 前被压扁
- `tools/` 定义 tool batch、确认策略、结果处理规则和执行分发
- `host/` 定义外部宿主如何消费 runtime 事实
- `host/bootstrap/` 定义外部宿主如何被规范化成 `AgentLoopInput`
- `runtime/` 负责把 loop、step、events、tools 组装成完整运行时，但不吸收新的业务语义
- `runtime/model/` 定义协议请求与当前可执行模型调用之间的桥接

## 关键边界

- `AgentStep`
  - 表示“这一次模型请求实际发生了什么”
  - 是 runtime-native 的稳定结果
  - 可以进入 transcript
- `HostStepOutput`
  - 表示“外部宿主应该从这次 step 看到什么”
  - 是 host-facing 的可见输出
  - 来自 `AgentStep`，但不是 runtime 真源
- `tool execution progress`
  - 是运行时事件
  - 通过 `events/` 暴露
- `tool execution result`
  - 是协议续上下文事实
  - 通过 `transcript/` 接回下一次模型请求
- `AgentRequestSpec`
  - 是单次模型请求的稳定规格
  - 是整轮 run 共享的 immutable spec，不是临时拼出来的 mutable request bag
- `ToolConfirmationPolicy`
  - 定义执行前是否需要确认
- `NextAgentRuntime`
  - 是 composition root
  - 负责 wiring，不是额外的一层业务状态机
- `AgentLoopResult`
  - 是整轮 run 的终态结果
  - 不是 host output 的替代品

一句话：

- `AgentStep` 是事实
- `HostStepOutput` 是外显结果
- 不是每个 `AgentStep` 都必须产出 `HostStepOutput`

## 命名约定

在 `next` 里使用 `AgentStep` 表示“单次模型请求及其产物”。

它是新体系里的 runtime 单元，语义为：

- 一次请求
- 一段流式输出
- 一组 tool calls

关键约束：

- 一个 `AgentStep` 恰好对应一次模型请求
- tool 执行完成后，如果需要继续推理，开始的是下一个 `AgentStep`
- `next` 中不再把“同一请求内的 step”和“loop 中的 cycle”混为一个词

## 目录结构

```text
next/
├── README.md
├── loop/
├── step/
├── request/
├── events/
├── tools/
├── host/
├── transcript/
└── runtime/
```

## 实施顺序

1. 先在 `next` 中把 runtime-native contract 定住
2. 再实现最小 `AgentLoop`
3. 然后接 `chat` host 的 outputs
4. 最后逐步替换现有 `agentCore + hostAdapters/chat + chatRun` 组合
