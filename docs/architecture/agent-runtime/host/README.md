# host

Source: [实现目录](../../../../src/main/agent/runtime/host/)<br>
Documentation: [Agent runtime](../README.md)

这一层定义当前 runtime 和外部宿主之间的边界。

这里的宿主可以是：

- chat
- telegram
- debug viewer
- 其他需要消费 runtime 事实的外部载体

## 这一层负责什么

- 定义宿主输入如何 bootstrap 成 loop 输入
- 保留输入的 runtime-native content 和稳定执行配置

## 这一层不负责什么

- 不驱动 `AgentLoop`
- 不修改 transcript
- 不重新定义 `AgentStep`
- 不实现 host-facing output：output 依赖 host-visible 契约，合法归属在 `hosts/`，
  core runtime 内不再预留对应模块

一句话：

- runtime core 只产出事实
- `host/bootstrap` 负责把外部输入接入 loop
- [Output 归属说明](output/README.md) 位于文档目录，外部宿主怎么消费这些事实由 `hosts/` 决定
