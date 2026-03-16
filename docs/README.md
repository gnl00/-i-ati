# Docs Index

当前 `docs/` 按主题分组：

- `architecture/`
  - 架构设计、重构总结、流程与协议
- `chat/`
  - chat 运行时、渲染、滚动、消息、typewriter 相关文档
- `ui/`
  - 界面与交互设计、布局与视觉实现
- `integrations/`
  - Web Search、MCP、系统能力、外部集成
- `data/`
  - memory 等数据能力
- `reference/`
  - 外部库或第三方资料归档
- `internal/`
  - 内部日志与过程性文档
- `todo/`
  - 待办和后续决策记录

约定：

- 优先把“当前有效”的架构文档放到 `architecture/`
- 带明显阶段性或历史性的总结，也仍放在 `architecture/`，但应在文首注明“阶段性”或“历史状态”
- chat 渲染、滚动、typewriter、压缩等面向聊天体验的文档统一放到 `chat/`
- 外部资料镜像或第三方库说明统一放到 `reference/` 或 `integrations/`

推荐从这些入口开始：

- 架构现状：
  - [chat-runtime-architecture-current.md](/Users/gnl/Workspace/code/-i-ati/docs/architecture/chat-runtime-architecture-current.md)
- 本轮阶段总结：
  - [agent-core-chat-adapter-stage-summary.md](/Users/gnl/Workspace/code/-i-ati/docs/architecture/agent-core-chat-adapter-stage-summary.md)
- chat 事件协议：
  - [chat-submit-event-bus.md](/Users/gnl/Workspace/code/-i-ati/docs/architecture/chat-submit-event-bus.md)
