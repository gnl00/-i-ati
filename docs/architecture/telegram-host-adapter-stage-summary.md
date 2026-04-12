# Telegram Host Adapter Stage Summary

> 这份文档记录的是 `hosts/telegram` 第一阶段接通与稳定化工作的阶段性总结。
> 当前结构以 2026-03-26 为准；Telegram transport 迁移细节另见 [telegram-gateway-grammy-migration.md](/Users/gnl/Workspace/code/-i-ati/docs/architecture/telegram-gateway-grammy-migration.md)。

## 背景

这轮工作的目标，不是单独做一个 Telegram bot sidecar，而是把 Telegram 接成一个真实的 host adapter：

- 复用现有 `chats`
- 复用现有 `messages`
- 复用现有 `chatRun`
- 让 Telegram 和 Chat UI 最终落到同一套 main-process runtime

也就是说：

- Telegram 只是另一种 host / transport
- 真正的消息处理、持久化和 agent run 仍然在 app main 侧

## 当前主路径

当前 Telegram 主路径已经是：

1. `grammY` 收到 update
2. `TelegramGatewayService` 处理命令或普通消息
3. `TelegramUpdateMapper` 转成 `TelegramInboundEnvelope`
4. `TelegramAgentAdapter` 转成统一 chat input
5. `RunService.execute(...)`
6. assistant 输出格式化后回发 Telegram

关键文件：

- [TelegramGatewayService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramGatewayService.ts)
- [TelegramUpdateMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramUpdateMapper.ts)
- [TelegramAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/telegram/TelegramAgentAdapter.ts)
- [telegram-input-text.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/telegram/telegram-input-text.ts)
- [TelegramFileService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramFileService.ts)

## 本阶段完成的能力

### 1. Telegram 已接入统一 chat runtime

Telegram 入站消息现在不再走独立“机器人逻辑”，而是进入统一 chat runtime：

- 宿主信息继续写入现有 `messages`
- `message.body.source = 'telegram'`
- Telegram chat 通过 `chat_host_bindings` 映射到现有 `chats`
- 后续请求构建、模型调用、标题生成、记忆检索仍然复用原有主链路

相关文件：

- [HostChatBindingService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/HostChatBindingService.ts)
- [ChatHostBindingRepository.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/repositories/ChatHostBindingRepository.ts)
- [ChatHostBindingDataService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/dataServices/ChatHostBindingDataService.ts)

### 2. Telegram 命令链已从 LLM 主链路前置分流

Telegram 常用控制命令已经在 gateway 层直接处理，不再走 chat run：

- `/newchat`
- `/models`
- `/model <name>`
- `/tools`
- `/status`
- `/help`

相关文件：

- [TelegramCommandService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramCommandService.ts)
- [telegram-command-parser.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/telegram-command-parser.ts)

### 3. `/models` 和 `/tools` 已支持分页交互

当前分页方案基于 Telegram inline keyboard + callback query：

- 首次发送第一页
- `Prev / Next` 按钮翻页
- 通过 `editMessageText` 更新同一条消息

同时：

- `/models` 使用 HTML 输出
- model id 使用 `<pre>` 块展示，便于复制
- 列表中补充 provider / account 信息，减少同名模型歧义

需要注意：

- Telegram 没有原生“分页组件”
- 也没有真正的“一键复制 id”控件
- 当前实现是 Telegram 能力边界内相对稳妥的方案

### 4. 图片和附件链路已经接通

当前已接通的 Telegram 入站媒体能力包括：

- `photo`
- 图片型 `document`
- 小型文本 `document`

处理路径是：

- 通过 Bot API 下载文件
- 在 app 侧转成 data URL
- 图片进入 `mediaCtx`
- 文本附件进入 `textCtx`
- 最终落成统一 user message content

这让 Telegram 图片消息可以直接复用现有多模态请求构建逻辑。

## 这轮真正修掉的问题

### 1. callback 翻页无响应

现象：

- `/models` 可以发第一页
- 点击 `Next` 后无响应
- 日志里没有 callback 处理记录

根因：

- gateway 启动时只订阅了 `message`
- 没有把 `callback_query` 加进 `allowed_updates`

修复后：

- 翻页事件会进入正常处理链
- 增加了 callback 侧日志，便于排查

### 2. Telegram 图片 data URL MIME 不稳定

现象：

- Chat UI 发图可识别
- Telegram 发同样图片时，多模态请求异常

根因之一：

- Telegram `photo` 下载响应头可能是 `application/octet-stream`
- 直接按这个 MIME 落库，会得到错误的 data URL

修复后：

- Telegram `photo` 优先归一成 `image/jpeg`
- 显式图片 MIME 的 `document` 保持原 MIME
- MIME 缺失时再根据文件名推断

相关文件：

- [TelegramFileService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramFileService.ts)

### 3. `/newchat` 之后仍可能命中旧 chat

现象：

- 主观上开启了新 chat
- 实际处理却像还带着旧历史

根因：

- `chat_host_bindings` 里 `host_thread_id = NULL` 的唯一性不能依赖 SQLite `UNIQUE` 约束得到预期行为
- 同一个 Telegram 私聊可以被重复插出多条 binding
- 查询时又可能命中旧 binding

修复后：

- binding upsert 改成显式查找后更新
- host lookup 改为优先返回最新 binding

这一步是 Telegram 会话一致性的关键修复。

### 4. Chat UI 和 Telegram “看起来不一致”的根因

一开始表面上是：

- Chat UI 多轮图文似乎可用
- Telegram 多轮图文失败

最后定位到真正的问题不是 Telegram 独有，而是 Chat UI renderer 会把整条 assistant message 回写数据库，只为了更新 `typewriterCompleted`，从而有机会把 main 侧已经回填好的 `content` 覆盖空。

结果是：

- Chat UI 某些历史 assistant 文本没有真正进入 request
- Telegram 没有这层 renderer 覆盖，所以更早暴露问题

这轮已改成 main 侧窄 patch：

- renderer 不再整条覆盖 `MessageEntity`
- 只允许 patch `typewriterCompleted`

相关文件：

- [messages.ts](/Users/gnl/Workspace/code/-i-ati/src/main/ipc/messages.ts)
- [MessageDataService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/dataServices/MessageDataService.ts)
- [ipcInvoker.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/invoker/ipcInvoker.ts)
- [use-message-typewriter.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/chat/chatMessage/typewriter/use-message-typewriter.ts)
- [store/index.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/store/index.ts)

### 5. 真正的多轮图文兼容问题在 request adapter

在把 UI / Telegram 行为收敛后，真正的根因暴露出来：

- `openai-response-compatible-adapter` 对 Responses API 多轮历史的 request 编码不严格
- assistant history 被错误编码成 `output_text`
- message item 也缺少显式 `type: 'message'`

这一点不是 Telegram host adapter 自身的问题，但它是这轮 Telegram 接入过程中被逼出来的关键兼容性问题。

### 6. grammY 的最终稳定方案不是 external，而是 bundled + net.fetch

这轮后续又继续暴露了一层 Telegram transport 问题：

- 把 `grammY` external 到 main runtime，能绕开早期 `getMe` 网络问题
- 但打包产物会重新依赖：
  - `grammy`
  - `node-fetch`
  - `whatwg-url`
- 在 pnpm + electron-builder + asar 场景下，这条运行时依赖树不稳定

所以当前最终收敛方案是：

- `grammY` 保持 bundled
- `TelegramGatewayService` 显式给 `Bot` 注入 Electron `net.fetch`
- `TelegramFileService` 的文件下载也统一走 `net.fetch`

这让 Telegram 链路同时满足：

- 开发态 `getMe` / polling 正常
- 打包产物不再因为 `whatwg-url` 一类传递依赖缺失而启动崩溃

相关文件：

- [TelegramGatewayService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramGatewayService.ts)
- [TelegramFileService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramFileService.ts)
- [electron.vite.config.ts](/Users/gnl/Workspace/code/-i-ati/electron.vite.config.ts)

### 7. macOS GitHub CI 现已拆出 unsigned 测试轨

为了避免无 Apple 证书的 CI mac 产物因为签名/runtime 策略在启动期被 dyld 拒绝，当前已经额外拆出一条测试轨：

- `build:mac:ci`
- 使用 [electron-builder.mac-ci.yml](/Users/gnl/Workspace/code/-i-ati/electron-builder.mac-ci.yml)
- 明确关闭：
  - `hardenedRuntime`
  - `notarize`
  - `gatekeeperAssess`

这条轨道的定位是：

- 仅供内部测试下载
- 不等同于正式对外 release 的签名包

## 当前判断

截至这一阶段，可以认为：

- `hosts/telegram` 已经成型
- Telegram 已经是统一 chat runtime 的一个真实宿主
- 命令链、分页、图片输入、chat binding、消息持久化都已经打通

同时也要明确：

- Telegram 接入并不是单独的 transport 工程
- 它会放大原有 chat/runtime/request adapter 的结构问题
- 这次排查证明 Telegram 是很有效的“跨宿主一致性测试面”
- Telegram 也已经成为 main-process 网络栈、打包链和 SDK runtime 兼容性的测试面

## 当前边界

目前仍然属于阶段性状态的部分：

- Telegram 出站媒体还没有系统化支持
- callback 菜单能力还主要服务于命令分页，不是通用菜单框架
- 某些 provider / adapter 组合的多轮兼容性仍要继续观察

## 建议的下一步

1. 继续补 Telegram 真实使用场景下的回归测试：
   - 文本
   - 图片
   - 命令分页
   - `/newchat`

2. 把 callback 菜单抽成更通用的 Telegram 交互层：
   - 避免命令服务继续累积 UI 细节

3. 继续加强 request 层诊断：
   - 在 provider 400 场景下输出更清晰的 input 摘要

4. 如果 Telegram 要长期作为一等宿主使用：
   - 后续可以考虑更完整的出站媒体与 richer reply 策略

## 相关文件

- [TelegramGatewayService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramGatewayService.ts)
- [TelegramCommandService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramCommandService.ts)
- [TelegramUpdateMapper.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramUpdateMapper.ts)
- [TelegramFileService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/telegram/TelegramFileService.ts)
- [TelegramAgentAdapter.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/telegram/TelegramAgentAdapter.ts)
- [telegram-input-text.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/telegram/telegram-input-text.ts)
- [HostChatBindingService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/shared/HostChatBindingService.ts)
- [ChatHostBindingRepository.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/repositories/ChatHostBindingRepository.ts)
- [ChatHostBindingDataService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/dataServices/ChatHostBindingDataService.ts)
- [RequestMessageBuilder.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/services/RequestMessageBuilder.ts)
