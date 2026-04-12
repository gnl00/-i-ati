# Hosts

`hosts` 是宿主适配层。

它的职责不是充当应用入口本身，而是把不同宿主环境中的输入、状态和输出语义，适配到当前主运行时模型上。

## 在整体架构中的位置

当前主结构可以理解为：

- `agent`
  - 运行时 contracts 与工具执行归属
- `hosts`
  - 宿主适配层
  - 负责把宿主世界映射到当前 runtime
- `chatRun`
  - shell/runtime orchestration
  - 负责 accepted、cancel、composition、event emitter、tool confirmation
- `chatPostRun`
  - run 完成后的后台 job
- `chatOperations`
  - 显式 chat 操作入口

## hosts 不是入口 handler

真正的入口通常仍然是应用层：

- IPC
- scheduler
- CLI / terminal
- 其他 application service

`hosts` 负责的是这些入口背后的宿主语义适配。

例如当前的：

- `hosts/chat`

负责：

- chat state -> `RunSpec`
- chat context -> step runtime context
- runtime 产物 -> chat message / chat event / chat persistence

当前需要额外注意：

- `hosts/chat/index.ts` 应优先作为当前主链可依赖的公共出口
- 旧的 chat-side step wiring 已从当前主代码中移除，不应再按 legacy runtime 边界扩展新实现
- 新代码不应再把 `hosts/chat` 设计回旧的 legacy runtime 宿主包装层

## 当前 chat adapter 职责

`hosts/chat` 当前已经包含：

- `config/`
  - chat 所需配置和 model context 解析
- `preparation/`
  - chat prepare 逻辑
- `legacy/`
  - 对 legacy execution wiring 的显式 compat 出口
- `runtime/`
  - chat host 和 agent runtime 的接线与 UI 适配
- `mapping/`
  - chat event 和 context mapping
- `persistence/`
  - chat session / step store
- `finalize/`
  - chat finalize 逻辑
- `ChatAgentAdapter.ts`
  - 当前的 chat facade

## 如何理解未来扩展

如果未来要支持更多宿主入口，可以自然扩展为：

```text
src/main/hosts/
  chat/
  terminal/
  workflow/
```

例如：

- `hosts/chat`
  - 面向 UI chat
- `hosts/terminal`
  - 面向 terminal session
- `hosts/workflow`
  - 面向脚本或 workflow 执行

它们共享同一套 runtime contracts / loop 语义，但各自负责不同宿主世界的：

- 输入上下文映射
- 事件映射
- 持久化语义
- 展示/交互语义

## 设计原则

- `hosts` 可以依赖 `agent/*`
- runtime core 不应反向依赖 `hosts`
- `hosts` 可以理解宿主领域对象，例如 chat entity / terminal session
- `hosts` 不应承担 shell/runtime orchestration
- shell/runtime orchestration 仍应留在 `chatRun` 或未来更明确的 runtime shell 层
