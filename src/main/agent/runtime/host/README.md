# host

这一层定义当前 runtime 和外部宿主之间的边界。

这里的宿主可以是：

- chat
- telegram
- debug viewer
- 其他需要消费 runtime 事实的外部载体

## 这一层负责什么

- 定义宿主输入如何 bootstrap 成 loop 输入
- 定义 host-facing output contract
- 把 runtime facts 整理成宿主可消费的结果
- 保存不同宿主之间允许存在的可见化差异

## 这一层不负责什么

- 不驱动 `AgentLoop`
- 不修改 transcript
- 不重新定义 `AgentStep`

一句话：

- runtime core 只产出事实
- `host/bootstrap` 负责把外部输入接入 loop
- `host/output` 决定外部宿主怎么消费这些事实
