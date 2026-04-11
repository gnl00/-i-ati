# output

这一层处理“单个 step 如何变成外部宿主可见输出”。

它属于 `host/`，不属于 core runtime。

## 这一层负责什么

- 定义输出策略
- 把单个 step 的事实整理成 host 可见对象
- 区分 hidden intermediate steps 和 visible final step
- 决定是否需要为某个 step 产出 output

## 这一层不负责什么

- 不驱动 loop
- 不执行 tools
- 不直接解析流式 chunk
- 不作为 transcript 的真源
- 不反向定义 step 的 runtime 结果

## 和 step 的关系

- `AgentStep`
  - 是 runtime 事实
  - 可以完整保留 text / reasoning / toolCalls / usage / finish reason
- `HostStepOutput`
  - 是从 `AgentStep` 派生出来的外部可见结果
  - 只保留外部宿主真的需要看到的内容

关键约束：

- `output` 不是每个 step 的必选物
- hidden intermediate step 可以没有 output
- 一个 step 的 output 形态由 host 语义决定，不由 loop 决定

## 文件说明

- `HostStepOutputPolicy.ts`
  - 决定 step 是否对外可见
- `HostStepOutput.ts`
  - 输出层使用的稳定输入模型
- `HostStepOutputBuilder.ts`
  - 把 runtime 事实整理成 host 侧可见结果
