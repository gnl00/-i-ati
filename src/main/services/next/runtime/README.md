# runtime

这一层负责把 `next` 的核心件组装成一套可运行 runtime。

## 这一层负责什么

- 组装 loop
- 组装 loop dependencies
- 形成一个完整 run entry

## 这一层不负责什么

- 不直接承载具体 host 业务规则
- 不直接承载 database 操作细节
- 不重新定义 runtime 领域对象
- 不保存 loop 运行中的可变状态
- 不吸收 provider / host 的分支策略

## 文件说明

- `NextAgentRuntime.ts`
  - next runtime 的 composition root，以及稳定 run 入口 contract
- `NextAgentRuntimeRunInput.ts`
  - runtime run 入口的稳定输入 contract
- `NextAgentRuntimeContext.ts`
  - runtime 运行所需的 provider / source / bridge 输入
- `RuntimeInfrastructure.ts`
  - bootstrap 和 loop 共享使用的稳定基础设施 contract
- `AgentLoopDependenciesFactory.ts`
  - runtime 内部把 context 收敛成 `AgentLoopDependencies` 的映射接口

## 组装原则

- runtime 只负责把 `sources`、`bootstrap`、`loop` 和 `loop dependencies` 接起来
- runtime 也负责显式 wiring bootstrap 所需的 materializers
- runtime 不重新定义 step 结果，也不重新定义事件语义
- host-specific 逻辑应该留在 `host/`，而不是侵入 loop 内部状态

## 和 loop 的关系

- `AgentLoop`
  - 是真正执行 runtime 的核心状态机
- `NextAgentRuntime`
  - 只是把执行所需依赖接好，然后暴露一个稳定 run 入口

关键约束：

- `NextAgentRuntime` 不拥有独立于 `AgentLoop` 之外的业务状态机
- runtime 不能变成“更大一层的 loop”
- runtime 只负责 wiring，不负责改写 loop 语义
- `NextAgentRuntime.run(...)` 的入参应停留在 `NextAgentRuntimeRunInput` 这一层
- `NextAgentRuntime.run(...)` 的出参应是稳定的 `AgentLoopResult`
- `NextAgentRuntime.run(...)` 运行中的可观察变化应通过 `events/` side channel 发出，而不是塞进返回值
- `host/output/` 的可见结果也不应作为 `run(...)` 的直接返回值
- runtime 应通过显式的 `AgentLoopDependenciesFactory` 把低层 bridges / providers / event emitter 收敛成 `AgentLoopDependencies`

## run 内部顺序

`NextAgentRuntime.run(...)` 的内部 wiring 顺序应固定为：

1. 接收 `NextAgentRuntimeRunInput`
2. `requestSpecSource.resolve(input)`
3. `runDescriptorSource.create(input)`
4. `loopInputBootstrapper.bootstrap(...)`
5. bootstrap 消费共享的 `RuntimeInfrastructure` 以及显式注入的 bootstrap materializers，装配起始 transcript / loop 输入
6. `agentLoopDependenciesFactory.create(runtimeInfrastructure)`
7. `AgentLoop.run(...)`
8. 返回稳定的 `AgentLoopResult`

关键约束：

- `NextAgentRuntime` 自己不持有第二套 run state
- source resolve 和 bootstrap 都属于进入 loop 之前的准备阶段
- 真正的 request -> stream -> parse -> tools -> continuation 循环仍然属于 `AgentLoop`
- runtime 只负责把 per-run sources 和 loop wiring 接成一条稳定主链
- runtime 应通过 `AgentLoopDependenciesFactory` 把 loop 真正消费的 bridges / providers / event emitter 收敛为 `AgentLoopDependencies`

## 和 context 的关系

- `NextAgentRuntimeContext`
  - 提供 runtime 启动所需的稳定输入
  - 例如 request spec source、run descriptor source、bootstrap、runtime infrastructure、loop、loop dependencies factory
- `NextAgentRuntime`
  - 消费这些输入，组装运行所需对象

关键约束：

- context 是启动输入，不是运行中 mutable store
- context 不应承载 chat identity、host output config 这类宿主语义
- `AgentRequestSpec` 应基于显式的 `NextAgentRuntimeRunInput` 做 per-run resolve，而不是依赖隐式环境状态
- `LoopRunDescriptor` 应基于显式的 `NextAgentRuntimeRunInput` 做 per-run create，再传给 bootstrap 和 loop
- `NextAgentRuntimeContext` 当前保持平铺结构，但阅读上应按下面几组理解：
  - `sources`
    - `requestSpecSource`
    - `runDescriptorSource`
  - `bootstrap`
    - `loopInputBootstrapper`
    - `userRecordMaterializer`
    - `initialTranscriptMaterializer`
  - `runtime infrastructure`
    - `RuntimeInfrastructure`
  - `loop`
    - `agentLoop`
  - `loop dependencies factory`
    - `agentLoopDependenciesFactory`
- 在 wiring 仍然可控之前，不急着把 `NextAgentRuntimeContext` 改成嵌套结构
- 运行中的状态变化应进入 loop state、events 或 transcript，而不是回写 context
