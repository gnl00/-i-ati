## Chat Pipeline - Long-term Improvement Plan

### Background
The recent refactor split `useChatSubmit` into modular stages, but both the context shape and execution model are still largely imperative. For long-term stability, we want a clearer control flow and a system that is easier to extend or port to other entry points (multi-window, mobile, web).

### Recommended Architecture
Adopt a state-machine driven service that runs outside the renderer (Web Worker or Electron background) and communicates via typed events.

#### Why a State Machine?
- **Predictable transitions**: Only explicit events can move the system between states, making it easier to reason about edge cases.
- **Focused context**: Each state owns the context it needs (preparation, streaming, tool handling, finalization), reducing accidental coupling.
- **Testability**: States and transitions can be unit-tested without involving UI concerns.
- **Feature growth**: Adding pause/resume, multi-model orchestration, or plugins becomes a matter of adding states/events, not rewriting the core loop.

#### Why move to a Worker/Background Service?
- Keeps heavy logic off the renderer thread so UI remains responsive.
- Enables chat logic reuse across platforms (desktop/web/mobile) by reusing the same service.
- Makes it easier to track global metrics, logging, and cancellation across multiple chat windows.

### Proposed High-Level Flow
```
Idle → Preparing → Streaming → ToolCall → Streaming → … → Finalizing → Done/Error
```
- **Preparing**: Validate inputs, persist user message, ensure workspace/chat metadata exist.
- **Streaming**: Handle streaming chunks, build reasoning/text segments, detect tool call requests.
- **ToolCall**: Invoke tools (embedded/MCP), append results as segments, enqueue tool responses back into the request history.
- **Finalizing**: Update status flags, generate titles, persist assistant message, notify UI.
- **Error/Done**: Notify renderer with terminal state; renderer can show failure, retry, etc.

### Transition & Event Protocol
- Renderer dispatches events such as `START_CHAT`, `ABORT`, `USER_CANCEL`, or `RESUME`.
- Service responds with state snapshots (`StreamingUpdate`, `ToolCallPending`, `Finalized`, `Error`).
- Typed events mean both ends have compile-time guarantees about payload shape.

### Suggested Migration Steps
1. **Define State Machine Schema**: Enumerate states, events, and shared context slices, mirroring the existing pipeline stages.
2. **Move Execution to Service**: Wrap the current modules as state handlers, triggered through the state machine instead of direct function calls.
3. **Introduce Event Bus**: Renderer ↔ Service communication via IPC/Worker messages, with a single subscription in the UI to keep state in sync.
4. **Gradual Rollout**: Start by running the state machine inside the renderer to validate logic, then move it into a Worker once stable.
5. **Extended Features**: Add optional states for pause/resume, retries, or multi-model fan-out as needed.

### Benefits Recap
- Clear boundaries, fewer “God objects”.
- Renderer stays lean and purely presentational.
- Easy to reason about concurrency, retries, and cancellation.
- Solid foundation for multi-platform support and advanced features (tool plugins, streaming to multiple consumers, telemetry).

---

## 聊天管线长期优化方案（中文版）

### 背景
虽然 `useChatSubmit` 已拆为多个模块，但上下文和执行流程仍偏命令式。为了获得长期的稳定性和可维护性，需要更清晰的控制流，以及易于扩展和跨端复用的架构。

### 推荐架构
采用 **状态机驱动** 的服务，运行在渲染进程之外（Web Worker 或 Electron 背景进程），通过**类型化事件**与 UI 通信。

#### 为什么使用状态机？
- **可预测的状态转换**：只有显式事件才能触发跳转，更容易覆盖边界场景。
- **上下文聚焦**：每个状态仅持有自身需要的数据，避免“巨型对象”带来的耦合。
-.ide**测试友好**：状态与转换可以单独做单元测试，不依赖 UI 逻辑。
- **功能扩张容易**：新增暂停/恢复、多模型、插件等，只需增加状态或事件。

#### 为什么迁移到 Worker/后台服务？
- 将重逻辑移出渲染线程，UI 始终响应顺畅。
- 多窗口 / 跨端（桌面、Web、移动）可共享同一套“聊天引擎”。
- 更易统一处理全局日志、指标和取消控制。

### 建议的状态流
```
Idle → Preparing → Streaming → ToolCall → Streaming → … → Finalizing → Done/Error
```
- **Preparing**：校验输入、持久化用户消息、准备 workspace/chat 信息。
- **Streaming**：处理流式 chunk，拼装 reasoning/text segments，识别 tool call。
- **ToolCall**：顺序执行工具（embedded/MCP），把结果作为 segment 写回，并把 tool 响应放入 request 历史。
- **Finalizing**：更新 store 状态、生成标题、持久化 assistant 消息、通知 UI。
- **Done/Error**：向渲染层广播终态，UI 可提示成功、失败或重试。

### 事件协议
- Renderer 发送事件：`START_CHAT`、`ABORT`、`USER_CANCEL`、`RESUME` 等。
- Service 回传状态：`StreamingUpdate`、`ToolCallPending`、`Finalized`、`Error`。
- 双方使用强类型 payload，确保编译期即可发现协议变更。

### 迁移步骤
1. **定义状态机 Schema**：枚举状态、事件、共享上下文（对应现有管线）。
2. **封装状态处理器**：把当前模块改为“状态入口函数”，由状态机驱动调用。
3. **引入事件总线**：Renderer 与 Service 用 IPC/Worker 事件通信，UI 只需订阅一次即可获取最新状态。
4. **渐进式下沉**：先在渲染进程内跑状态机验证，再迁移到 Worker。
5. **扩展功能**：准备好 pause/resume、retry、多模型并行等扩展状态。

### 预期收益
- 职责边界清晰，告别“巨型函数”。
- 渲染层只专注 UI 渲染。
- 并发、重试、取消等复杂链路更容易推理。
- 为未来插件化工具、多人协作、跨端支持等高级需求打下基础。
