# Telegram Gateway GrammY Migration

这份文档记录 Telegram gateway 从手写 Bot API client 迁移到 `grammY` 的阶段性设计与问题排查结论。

## 背景

Telegram 集成最初使用手写 HTTP 调用：

- `getUpdates`
- `getMe`
- `sendMessage`

这条链路对纯文本消息已经够用，但后续要支持：

- 更完整的 update 类型
- photo / document / media metadata
- 文件下载
- 更稳定的 long polling 生命周期

所以 gateway/transport 层迁移到 `grammY`，但保留以下既有设计：

- 现有 `chats/messages` 表
- `chat_host_bindings`
- `TelegramAgentAdapter`
- `HostChatBindingService`
- `ChatRunService`

也就是：

- **只替换 Telegram transport/gateway 层**
- **不重做现有统一 chat/runtime/binding 设计**

## 迁移结果

当前 Telegram gateway 的主路径是：

1. `TelegramGatewayService.start()`
2. 创建 `grammY Bot`
3. 后台 `performStart()`
4. 显式 `getMe`
5. `bot.botInfo = me`
6. `bot.start({ onStart })`
7. `message` update -> `TelegramUpdateMapper`
8. `TelegramAgentAdapter`
9. `ChatRunService.execute(...)`
10. assistant 回复格式化后回发 Telegram

相关文件：

- [TelegramGatewayService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramGatewayService.ts)
- [TelegramUpdateMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramUpdateMapper.ts)
- [TelegramAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/telegram/TelegramAgentAdapter.ts)
- [TelegramFileService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramFileService.ts)

## 已实现能力

### Gateway

- `grammY` long polling
- 后台启动状态机：
  - `starting`
  - `running`
  - `stopped`
- 设置页状态展示：
  - bot username
  - last error
  - last poll time
  - last message time
  - last update id

### 会话映射

- Telegram 会话继续映射到现有 `chats`
- 使用 `chat_host_bindings` 保存：
  - `host_type`
  - `host_chat_id`
  - `host_thread_id`
  - `chat_uuid`

### 消息持久化

- Telegram 入站消息写入现有 `messages`
- `message.body.source = 'telegram'`
- `message.body.host` 保存宿主信息

### 附件处理

- `photo`
  - 进入 `TelegramInboundEnvelope.media`
  - 下载为 data URL
  - 注入 `mediaCtx`
- 图片型 `document`
  - 同样可注入 `mediaCtx`
- 小文本 `document`
  - `< 32 KB`
  - 限定文本 mime type
  - 作为附件文本块注入 `textCtx`
- 附件摘要也会落入：
  - `message.body.host.attachments`

### Telegram 回复格式

- 继续走 Telegram-safe HTML 格式化
- 支持有限 Markdown 子集转换

## 排查过的关键问题

## 1. gateway 启动长期停在 Starting

现象：

- `start.queued`
- `perform_start.enter`
- 长时间没有 `start.completed`
- 最后 watchdog 触发 `polling.start.timeout`

### 初步怀疑

最开始怀疑：

- Telegram API 网络不通
- token 有问题
- grammY 自身行为不稳定

### 事实验证

独立于 app 的最小 `grammY` 脚本在同一台机器、同一 token 下可以正常执行：

- `getMe ok`
- `onStart ok`

这说明：

- Telegram API 网络是通的
- token 是有效的
- `grammY` 本身是可用的

## 2. 为什么独立小脚本能通，但 app 内不行

根因最后定位为：

- **Electron main 里被 bundling 进去的 `grammy` 运行路径有问题**
- **独立脚本直接使用 `node_modules/grammy` 的原始 Node 运行时则是正常的**

也就是说：

- 失败路径：
  - `out/main/index.js` 里的 bundled `grammy`
- 成功路径：
  - `node_modules/grammy`

### 关键修复

在 [electron.vite.config.ts](/Users/gnl/Workspace/code/-i-ati/electron.vite.config.ts) 中，把：

- `grammy`

加入 main external 列表。

这样 Electron main 运行时直接加载：

- `node_modules/grammy`

而不是把 `grammy` 打进 main bundle。

### 修复后结果

启动日志恢复正常：

- `start.get_me.completed`
- `start.completed`
- `polling.started`

## 最终结论

这次 Telegram gateway 启动问题的根因不是：

- Telegram 网络
- bot token
- gateway 业务逻辑

而是：

- **`grammy` 在当前 Electron main + Vite bundle 路径下的 bundled 运行行为异常**

修复方式是：

- **对 main 进程 externalize `grammy`**
- **运行时直接使用原始 Node 版 `grammy`**

## 当前建议

后续如果继续接第三方 SDK 到 Electron main：

1. 优先避免把此类网络/协议 SDK 内联进 main bundle
2. 对 runtime 敏感的包优先 externalize
3. 独立最小脚本验证要保留，便于区分：
   - SDK/runtime 问题
   - 业务集成问题

## 相关文件

- [electron.vite.config.ts](/Users/gnl/Workspace/code/-i-ati/electron.vite.config.ts)
- [TelegramGatewayService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramGatewayService.ts)
- [TelegramUpdateMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramUpdateMapper.ts)
- [TelegramFileService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramFileService.ts)
- [TelegramAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/telegram/TelegramAgentAdapter.ts)
