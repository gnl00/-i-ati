# Telegram Gateway GrammY Migration

这份文档记录 Telegram gateway 从手写 Bot API client 迁移到 `grammY` 的阶段性设计与问题排查结论。

> 文档状态说明：
> 本文前半部分保留了迁移过程中的历史判断；截至 2026-03-26，最终稳定方案已经更新为：
> **`grammY` 保持 bundled，但显式注入 Electron `net.fetch`，不再把 `grammY` external 到 main runtime。**

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

### 当时的临时修复

在 [electron.vite.config.ts](/Users/gnl/Workspace/code/-i-ati/electron.vite.config.ts) 中，把：

- `grammy`

加入 main external 列表。

这样 Electron main 运行时直接加载：

- `node_modules/grammy`

而不是把 `grammy` 打进 main bundle。

### 当时的结果

启动日志恢复正常：

- `start.get_me.completed`
- `start.completed`
- `polling.started`

## 3. 为什么这个结论后来又不成立

在继续推进 Telegram host adapter 和 macOS CI 打包后，又暴露了第二层问题：

- 把 `grammY` external 到 main runtime 后，开发态本地运行可恢复 `getMe`
- 但打包产物启动时，Telegram 依赖链重新回到：
  - `grammy`
  - `node-fetch`
  - `whatwg-url`
- 在 pnpm + electron-builder + asar 场景下，这条运行时依赖树并不稳定

实际表现是：

- GitHub CI macOS 产物安装后启动报错：
  - `Cannot find module 'whatwg-url'`
- 错误栈来自：
  - `grammy -> node-fetch -> whatwg-url`

这说明：

- **external `grammY` 能绕过 bundled 网络问题**
- **但会把 Telegram gateway 重新暴露给脆弱的运行时依赖树**
- **对打包产物来说，这不是最终可接受方案**

## 4. 最终稳定方案

最终采用的是第三条路径：

1. `grammY` 继续跟随 main bundle 打包
2. 不再让 `grammY` 使用默认的 `node-fetch`
3. 显式给 `grammY Bot` 注入 Electron `net.fetch`
4. Telegram 文件下载也统一走 Electron `net.fetch`

也就是：

- **保留 bundled `grammY`**
- **用 Electron 网络栈替代 `grammY` 默认的 Node fetch 路径**

相关实现：

- [TelegramGatewayService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramGatewayService.ts)
- [TelegramFileService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramFileService.ts)
- [electron.vite.config.ts](/Users/gnl/Workspace/code/-i-ati/electron.vite.config.ts)

核心做法是：

- `new Bot(token, { client: { fetch: net.fetch.bind(net) } })`
- Telegram 附件下载同样优先使用 `net.fetch`

这样同时解决了两类问题：

1. **网络问题**
   - bundled `grammY` 不再走默认 `node-fetch`
   - `getMe` / long polling 走 Electron 网络栈

2. **打包问题**
   - main bundle 不再依赖 external `grammY` 的运行时依赖树
   - 避免 `whatwg-url` 这类传递依赖缺失导致启动崩溃

## 5. macOS CI 打包补充

Telegram 这轮问题还顺带暴露了 macOS CI 包的另一层风险：

- 无 Apple Developer ID 的 GitHub CI mac 包
- 如果仍走带 runtime/hardened 特征的构建路径
- 在 macOS 15 上可能因为签名策略在启动期被 dyld 拒绝

因此当前还额外拆出了一条 **unsigned mac CI 测试轨**：

- 使用单独的 `electron-builder.mac-ci.yml`
- 明确关闭：
  - `hardenedRuntime`
  - `notarize`
  - `gatekeeperAssess`
- 仅作为内部测试包，不作为正式对外分发方案

相关文件：

- [electron-builder.mac-ci.yml](/Users/gnl/Workspace/code/-i-ati/electron-builder.mac-ci.yml)
- [release.yml](/Users/gnl/Workspace/code/-i-ati/.github/workflows/release.yml)

## 最终结论

从完整迁移过程来看，Telegram gateway 的问题分成两层：

1. **bundled `grammY` 默认 fetch 路径会触发 Electron main 内的网络问题**
2. **external `grammY` 又会把打包产物暴露给不稳定的运行时依赖树**

所以当前最终结论不是：

- externalize `grammY`

而是：

- **`grammY` 保持 bundled**
- **显式注入 Electron `net.fetch`**
- **Telegram 文件下载同样统一走 `net.fetch`**

也就是说，真正要避免的不是 bundled 本身，而是：

- **让 Telegram 网络请求继续走默认 Node fetch 路径**

## 当前建议

后续如果继续接第三方 SDK 到 Electron main：

1. 先区分问题到底出在：
   - SDK 自身
   - bundling
   - 默认网络实现
2. 对带网络栈的 SDK，优先评估是否应显式注入 Electron `net.fetch`
3. 不要把 externalize 当成默认最终解，它更适合作为排障手段
4. 独立最小脚本验证要保留，便于区分：
   - SDK/runtime 问题
   - 业务集成问题

## 相关文件

- [electron.vite.config.ts](/Users/gnl/Workspace/code/-i-ati/electron.vite.config.ts)
- [TelegramGatewayService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramGatewayService.ts)
- [TelegramUpdateMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramUpdateMapper.ts)
- [TelegramFileService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramFileService.ts)
- [TelegramAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/telegram/TelegramAgentAdapter.ts)
