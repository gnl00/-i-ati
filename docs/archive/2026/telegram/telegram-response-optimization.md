# Telegram 消息响应优化方案

Archived: 2026-07-11<br>
Reason: Implemented optimization record<br>
Original path: `docs/telegram/telegram-response-optimization.md`<br>
Replaced by: Current Telegram runtime implementation

> 更新日期：2026-05-16
> 状态：已实现

---

## 1. 背景与目标

### 1.1 问题

当前 Telegram 消息交互流程：

```
用户发消息 → 服务端处理 → 模型推理 → 结果返回
                      ↑ 这段是黑盒
```

用户发送消息后，只能被动等待模型返回。如果响应慢（模型卡顿）或没有返回（网络/服务端问题），用户无法区分是：

- **client → server 链路问题**（消息没发到服务端）
- **server → 模型链路问题**（服务端收到了，但模型在跑或挂了）

### 1.2 目标

用户发送消息后，**立即获得一个可见反馈**，确认"服务端已收到，正在处理"。链路可观测：

```
用户发消息 → ✅ 服务端收到（打字中） → ✅ 模型返回（完整回复）
```

---

## 2. 方案：sendChatAction("typing")

### 2.1 方案对比

| 方案 | 优缺点 |
|------|--------|
| ❌ ASCII spinner 动画库 | TG 不支持终端 \r 刷新，动画跑不起来 |
| ✅ `sendChatAction("typing")` | 原生 TG API，无消息污染，用户立刻看到"正在输入" |
| ✅ `setMessageReaction("🤔")` | 更优雅，但需要额外处理 |
| ⚠️ 文字占位 + `editMessageText` | 可用但会有瞬时消息闪现 |

### 2.2 最终选择：`sendChatAction("typing")`

**原因**：
- TG Bot API 原生能力，零依赖
- 用户看到 "bot 正在输入…" 就知道服务端已收到
- 不产生额外消息，不污染聊天记录
- 实现简单，仅一行 API 调用

### 2.3 完整响应流程

```
用户发消息
    │
    ├── ① sendChatAction("typing")    ← 即时应答（只发一次）
    │     用户看到"xxx 正在输入…"
    │
    ├── ② 模型推理                     ← 用户知道在跑
    │
    └── ③ 发送完整回复                 ← 完成
```

### 2.4 为什么不需要心跳

`sendChatAction("typing")` 的 typing 效果默认持续约 5 秒。如果模型推理超过 5 秒，打字指示会自然消失。

**这不重要**——因为设计目标不是让打字图标一直亮着，而是**传递"服务端已收到，正在处理"这一个确认信号**。这个信号在发送 typing 那一刻就已经传达了，5 秒后消失不影响它已经完成的任务。

```
用户：发消息
  → 0ms:  收到 typing → ✅ 知道了，服务端收到了
  → 5s:   typing 消失（模型还在跑）
  → 30s:  收到回复

即使是 30 秒的推理，单次 typing 也完成了它的使命。
```

---

## 3. 实现方案

### 3.1 代码改动位置

当前 TG 普通消息处理链路：

```
TelegramGatewayService.registerHandlers()
  → TelegramUpdateMapper.fromContext()
  → shouldHandleEnvelope()
  → TelegramGatewayService.handleEnvelope()
  → RunService.execute()
  → TelegramRenderResponder
```

**注入点**：`src/main/services/telegram/TelegramGatewayService.ts` 的 `handleEnvelope()`，在 `update.received` 日志之后、session/model/attachment/run 准备之前触发一次 `sendChatAction("typing")`。

命令消息和 callback query 走 `handleCommand()` / `executeCallback()` 链路，保持原有命令响应模式。

### 3.2 伪代码

```typescript
private async handleEnvelope(envelope, modelRef) {
  void this.sendTypingAction(envelope)
  try {
    await runAgent(envelope, modelRef)
  } catch (error) {
    // existing run error handling
  }
}

private async sendTypingAction(envelope) {
  try {
    await bot.api.sendChatAction(Number(envelope.chatId), 'typing', threadOptions)
  } catch (error) {
    logger.warn('typing_action.failed', ...)
  }
}
```

### 3.3 风险与注意

| 风险 | 说明 |
|------|------|
| **非文本消息** | 图片、文件等消息也适用 typing action，不需要区分消息类型 |
| **模型秒回** | 如果模型在 1s 内返回，typing 可能还没显示就结束了，但效果不差——用户看到一条正常回复 |
| **优雅降级** | sendChatAction 失败（如频率限制）不应阻塞模型调用流程，建议用 try/catch 静默吞掉 |
| **流式输出** | 如果回复是流式的（逐字输出），typing 和流式开始互不冲突——typing 5s 内自然消失，流式补上就行 |

---

## 4. 后续优化方向（Open Questions）

- **流式下的体验**：流式输出时是否需要保持打字状态，还是流式开始就足够了？
- **优雅降级**：如果 sendChatAction 被频率限制拒绝，是否需要降级处理？

---

## 5. 参考

- [Telegram Bot API: sendChatAction](https://core.telegram.org/bots/api#sendchataction)
- [Related Todo: Telegram 消息响应优化](https://github.com/gnl/-i-ati)
