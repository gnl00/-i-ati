# Stream Pipeline 与缓存机制优化方案

> 针对 main 层 stream 解析到 renderer 的链路长度及缓存机制零散问题的深度分析与优化建议
>
> 状态：见「实施进展与核实结论」
> 日期：2026-07-11

## 实施进展与核实结论（2026-07-11）

下面章节（§0 起）是**初版分析**，其中部分结论在逐条核实真实代码后被修正。以本节为准：

| 项 | 初版结论 | 核实后结论 | 处理 |
|----|---------|-----------|------|
| **P0 统一 render 缓存** | render state 被构建 3 次，需清理影子 reducer | **成立** | ✅ 已落地。删除 `CommittedAssistantMessageController`、`HostRenderEventMapper` 的 `lifecycle`/`lastUsage` 影子字段、`ChatRenderResponder.lastUsage`；`HostRenderEventMapper` 提升为共享单例，成为唯一 fold 点。净删 87 行，1169 测试通过。 |
| **P1-A 合并 ModelResponseChunk** | 冗余中间层，对象分配 -15% | **不成立** | ❌ 不做。`ModelResponseChunk` 是 `ModelStreamExecutor`（retry + provider 规范化）与 `ModelResponseParser`（跨 chunk 有状态解析）之间的**合理接缝**。合并会耦合两个独立生命周期职责，收益推测性。 |
| **P1-E 分离 transcript/compression** | 两概念混淆 | **不成立** | ❌ 不做。核实发现二者**本就分层**：compression 在 `RunRequestFactory.build()`（请求物化），transcript 在 `AgentLoop`（runtime）。不存在代码纠缠。 |
| **P2 preview patch 决策收敛** | 决策分散 3 处，延迟 -25% | **大部分已落地** | ⚠️ append 语义前移（`previewEffect`）此前已完成，`shouldEmit*`/`canEmitOptimized*` 已删除。子 agent 提的"把 patch 生成搬进 reducer"**不应做**（reducer 是 host-agnostic 共享层，`MessageSegmentPatch` 是 chat 专属 shape，搬进去破坏分层）。唯一残留：`buildDifferentialSegmentPatches` 死代码，已删除。 |
| **P3 消除 HostRenderEvent 层** | 对象分配 -40%，但破坏 host 抽象 | **不成立，应保留** | ❌ 不做。核实发现 `HostRenderEventSink` 有 3 个实现者，其中 `TelegramRenderResponder`（565 行完整实现）消费 7 种 host 事件。chat + telegram 共享同一 `HostRenderEventForwarder`/`HostRenderEventMapper`（P0 后的唯一 fold 点），渲染语义完全不同（chat 发 IPC patch，telegram 发节流 Bot API 消息）。移除会退回 P0 之前的多 fold 点问题。子 agent"当前只有 chat 在用"的判断错误——未查 telegram。 |

**关键教训**：初版分析（含 §2.1 五类缓存、§3 各优化方案）由 subagent 在未通读全部相关代码时给出，多处前提有偏差：
- `CommittedAssistantMessageController` 被误判为 render 副本（实为 DB 实体锚点）
- `ModelResponseChunk` 被误判为冗余包装（实为 retry/解析层的合理接缝）
- transcript/compression 被误判为"混淆"（实则本就分层）
- `HostRenderEvent` 被误判为 chat 专属（实为 chat + telegram 共享的多 host 广播抽象）

落地前每一项都应回到真实代码核实。**这套 stream→renderer 链路经核实后整体是健康的**：P0 影子 reducer 清理是唯一真实收益点（已落地），其余分层各有其职责，不应为"减少层数"而牺牲。

## P3 数据流全景（核实依据）

```
AgentEvent (runtime, DefaultMainAgentRuntimeRunner)
   │
   ▼
HostRenderEventForwarder  ← 单个共享 HostRenderEventMapper（P0 后唯一 fold 点）
   │  广播 HostRenderEvent[] 给所有注入的 sink
   ├──▶ ChatRenderResponder      → IPC 事件 + renderer Zustand patch
   ├──▶ ChatToolSideEffectSink   → 工具副作用
   └──▶ TelegramRenderResponder  → Telegram Bot API（throttled edit / HTML / inline keyboard）
```

- chat 侧：`DefaultMainAgentRuntimeRunner` 显式创建 mapper 并注入 forwarder
- telegram 侧：`TelegramGatewayService` 创建 `TelegramRenderResponder`，经 `hostRenderSinks` 注入同一 forwarder
- 两 host 共享 fold 点、各自订阅 → 这正是 `HostRenderEvent` 抽象的价值所在

---

## 0. 执行摘要（初版分析，部分已被上节修正）

### 核心发现

1. **链路长度基本合理**：9层转换大多有明确职责边界，但存在 2-3 个可优化的中间层
2. **缓存机制存在严重问题**：render state 被重复构建 3 次（影子 reducer 残留未完全清理）
3. **快速优化路径**：优先执行 P0（统一 render 缓存）→ P1（移除冗余中间层）→ P1（概念分离）

### 优化优先级

| 优先级 | 优化项 | 收益 | 风险 | 成本 |
|--------|--------|------|------|------|
| **P0** | **统一 render 缓存真源** | 内存 -50%，消除同步 bug | 低 | 中 |
| P1 | 合并 ModelResponseChunk | 对象分配 -15% | 低 | 低 |
| P1 | 分离 transcript/compression 概念 | 清晰度提升 | 低 | 低 |
| P2 | 合并 preview patch 路径决策 | 延迟 -25% | 中 | 高 |
| P3 | 消除 HostRenderEvent 层 | 对象分配 -40% | 中（破坏 host 抽象） | 高 |

---

## 1. Stream 链路分析

### 1.1 完整链路层级

当前从 provider SSE/raw 到 renderer Zustand store 的完整路径：

```
1. Provider层 (BaseAdapter.transformStreamResponse:47)
   SSE/raw → IUnifiedStreamResponse
   职责：协议规范化
   
2. Model层 (ModelStreamExecutor.execute:106)
   IUnifiedResponse → ModelResponseChunk
   职责：retry、错误处理、delta/final封装
   
3. Parser层 (ModelResponseParser.parse:72)
   ModelResponseChunk → AgentStepDraftDelta[]
   职责：think tag解析、tool call组装、delta生成
   
4. Loop层 (AgentLoop.run:335-369)
   AgentStepDraftDelta → AgentStepDraft snapshot
   职责：draft状态累积、step完整性
   
5. Render Reducer (AgentRenderStateReducer.apply:372)
   AgentEvent → AgentRenderState (preview/committed)
   职责：blocks结构化、tool calls合并、previewEffect计算
   
6. Render Mapper (HostRenderEventMapper.map:30)
   AgentEvent → HostRenderEvent[]
   职责：lifecycle映射、事件分发决策
   
7. Chat Responder (ChatRenderResponder.handle:42)
   HostRenderEvent → DB持久化 + IPC事件
   职责：MessageEntity生成、ChatRenderOutput调用
   
8. IPC层 (RunEventEmitter.emit:37)
   RunEventEnvelope → renderer
   职责：trace持久化、跨进程传输
   
9. Renderer消费 (chatRunEvent.ts:265, previewPatchBatcher:103)
   RunEvent → Zustand store patch
   职责：patch batching、RAF调度、store更新
```

### 1.2 合理的层级

以下层级有明确的职责边界，属于必需的架构分层：

- **Provider → Model → Parser**：协议标准化必需，不同 provider 差异大
- **Loop → Reducer → Mapper**：runtime/render/host 三层分离，架构清晰
- **Responder → IPC → Renderer**：进程边界 + 持久化必需

### 1.3 潜在冗余层级

#### 问题1: ModelResponseChunk 中间层

**当前路径：**
```typescript
IUnifiedResponse → ModelResponseChunk → AgentStepDraftDelta
```

**问题分析：**
- `ModelResponseChunk` 只做了 argumentsMode 推断和 delta/final 标记
- 这些逻辑可以直接在 Parser 里完成
- 增加了一次对象创建和遍历

**优化方案：**
```typescript
IUnifiedResponse → AgentStepDraftDelta (直接解析)
```

#### 问题2: HostRenderEvent 投影层

**当前路径：**
```typescript
AgentEvent → HostRenderEvent[] → ChatRenderResponder
```

**问题分析：**
- `HostRenderEvent` 主要是字段重命名（stepId→stepId、delta→preview）
- `HostRenderEventMapper` 90% 逻辑是 switch-case 转发
- previewEffect、previewWasActive 可以作为 reducer 的输出直接读取

**优化方案：**
```typescript
AgentEvent → ChatRenderResponder (直接消费)
```

**风险评估：**
Host 抽象的初衷是支持多种 host（chat/design/telegram），但需要评估是否值得为此保留一层投影。

#### 问题3: Preview 双路径决策分散

**问题分析：**
- `preview.updated(full)` vs `preview.segment_updated(patch)` 决策在多处重复
- reducer 计算 previewEffect（line 103-127）
- responder 再根据 effect 决定 emit（line 80-88）
- renderer 还有 previewPatchBatcher 做合并（line 103）

**优化方案：**
在 reducer 内直接输出 patch 指令，减少 3 处决策点 → 1 处。

---

## 2. 缓存机制分析

### 2.1 五类缓存识别

#### ① Provider prompt cache 统计
- **位置**: BaseAdapter、ModelResponseParser（usage 提取）
- **职责**: promptCacheHitTokens/Miss/WriteTokens 统计
- **问题**: 统计逻辑分散，只在 usage 里传递
- **评价**: 职责相对清晰，优先级低

#### ② Request 上下文压缩
- **位置**: RunRequestFactory（request materialization 层）
- **职责**: compressed summary、awake、skills、knowledgebase
- **问题**: 与 transcript 缓存职责边界不清
- **评价**: 需要概念澄清

#### ③ Runtime transcript
- **位置**: AgentLoop.transcript (line 290)
- **职责**: loop 内协议历史（ITranscriptRecord[]）
- **评价**: **职责清晰**，是 runtime 唯一真源 ✅

#### ④ Render preview cache（严重问题）
- **位置**:
  - `AgentRenderStateReducer.state` (line 355-359)：committed/preview/lastUsage
  - `HostRenderEventMapper` (line 8-27)：影子状态暴露
  - `ChatRenderOutput.committedAssistant` (line 27)：又一份 committed 副本
  
- **问题**: **严重的影子 reducer 问题** ⚠️
  - Reducer fold 出 `AgentRenderState`
  - Mapper 再次暴露 snapshot（P0 注释明确指出这是去除影子 reducer 后的改进）
  - ChatRenderOutput 还持有 CommittedAssistantMessageController
  - **同一份 committed/preview 被构建 3 次**

#### ⑤ 持久化/trace
- **位置**:
  - `RunEventEmitter.emit:50` → DatabaseService.saveRunEvent
  - `ChatStepStore.persistAssistantMessage` (line 133)
  - `ChatRenderOutput.messageEntities` (line 31)
  
- **问题**: messageEntities 是内存副本，与 DB 状态可能不一致
- **评价**: 需要明确内存副本的生命周期

### 2.2 与已有优化的关联

本次分析发现的问题与 `docs/render-pipeline-optimization.md`（2026-07-03）有重叠：

- **已完成**: P0 删除 `HostRenderStateController` 影子 reducer
- **本次新发现**: 
  - `ChatRenderOutput.committedAssistant` 仍然是第三份 committed 副本
  - `HostRenderEventMapper` 虽然成为唯一 fold 点，但内部仍维护 lifecycle/lastUsage 影子状态
  - 这表明影子 reducer 清理**尚未完成**

---

## 3. 详细优化方案

### 3.1 优化A: 合并 ModelResponseChunk 中间层（P1）

#### 现状
```typescript
// ModelStreamExecutor.ts:101
IUnifiedResponse → ModelResponseChunk (toDeltaChunk)
  ↓
// ModelResponseParser.ts:67
ModelResponseChunk → AgentStepDraftDelta (parse)
```

#### 优化方案
```typescript
// 直接在 Parser 中处理
class ModelResponseParser {
  parse(response: IUnifiedResponse): AgentStepDraftDelta[] {
    // 合并原 toDeltaChunk 和 parse 逻辑
    const argumentsMode = this.inferArgumentsMode(response)
    return this.generateDeltas(response, argumentsMode)
  }
}
```

#### 收益与风险
- **收益**: 减少 10-15% 的 streaming path 对象分配
- **风险**: 低（纯重构，不改变行为）
- **成本**: 低（一个文件的逻辑合并）

---

### 3.2 优化B: 消除 HostRenderEvent 中间层（P3）

#### 现状
```typescript
// HostRenderEventMapper.ts:30
AgentEvent → HostRenderEvent[] (map)
  ↓
// ChatRenderResponder.ts:42
HostRenderEvent → DB + IPC (handle)
```

#### 优化方案
```typescript
// ChatRenderResponder 直接消费 AgentEvent
class ChatRenderResponder {
  async handle(event: AgentEvent): Promise<void> {
    // 原 mapper 的逻辑内联
    switch (event.type) {
      case 'agent.step.delta':
        // 直接处理，无需转换为 HostRenderEvent
        break
      // ...
    }
  }
}
```

#### 收益与风险
- **收益**: 减少 30-40% 的事件对象创建，简化调试路径
- **风险**: 中（需要评估 host 抽象是否仍然需要）
- **成本**: 高（需要重构多个文件）
- **注意**: 如果未来需要支持多种 host（design/telegram），这层抽象可能仍有价值

---

### 3.3 优化C: 统一 render 缓存真源（P0 - 最重要）

#### 现状问题
```typescript
// 3 份 committed/preview 副本
1. AgentRenderStateReducer.state          // reducer 内部
2. HostRenderEventMapper 暴露的 snapshot    // mapper 层
3. ChatRenderOutput.committedAssistant    // output 层
```

#### 根本原因
虽然 P0 已经删除了 `HostRenderStateController`，但：
- `HostRenderEventMapper` 仍在维护 lifecycle/lastUsage 副本（line 11）
- `ChatRenderOutput` 还在持有 `CommittedAssistantMessageController`（line 27）
- **影子 reducer 清理未完成**

#### 优化方案
```typescript
// 单一真源设计
class RenderStateController {
  private reducer = new AgentRenderStateReducer()
  
  apply(event: AgentEvent): RenderOutput {
    const state = this.reducer.apply(event)
    
    return {
      preview: state.preview,
      committed: state.committed,
      previewEffect: this.reducer.lastPreviewEffect,
      previewWasActive: this.reducer.lastPreviewWasActive,
      usageChanged: this.reducer.lastUsageChanged
    }
  }
  
  // 只暴露快照方法，不存储影子状态
  snapshot() { return this.reducer.snapshot() }
}
```

#### 具体行动
1. **删除 `ChatRenderOutput.committedAssistant`**
   - 直接从 reducer state 读取 committed
   - 删除 `CommittedAssistantMessageController`
   
2. **清理 `HostRenderEventMapper` 影子状态**
   - 移除内部维护的 lifecycle/lastUsage
   - 只保留纯函数映射逻辑
   
3. **确保单一数据流**
   ```
   AgentEvent → AgentRenderStateReducer (唯一 fold) → 只读输出
   ```

#### 收益与风险
- **收益**: 内存占用 -50%，消除状态同步 bug 风险
- **风险**: 低（概念上已经是目标架构，P0 注释已标注）
- **成本**: 中（需要修改 2-3 个文件）

---

### 3.4 优化D: 合并 preview patch 路径决策（P2）

#### 现状问题
```typescript
// 决策分散在 3 处：
1. AgentRenderStateReducer 计算 previewEffect (line 103-127)
2. ChatRenderResponder 根据 effect 决定 emit (line 80-88)
3. Renderer previewPatchBatcher 做合并 (line 103)
```

#### 优化方案
```typescript
// 在 reducer 内直接输出 patch 指令
apply(event: AgentEvent): {
  state: AgentRenderState
  emitInstructions: Array<
    | { type: 'preview_full', preview: AgentRenderMessageState }
    | { type: 'preview_text_patch', patch: MessageSegmentPatch }
    | { type: 'preview_reasoning_patch', patch: MessageSegmentPatch }
  >
}
```

#### 收益与风险
- **收益**: 减少 20-30% 的 preview event 处理延迟
- **风险**: 中（需要重构 ChatRenderMapper 的 patch 生成逻辑）
- **成本**: 高

---

### 3.5 优化E: 分离 transcript/compression 概念（P1）

#### 现状混淆
- **transcript**: runtime 的操作历史（完整、不可变）
- **compressed summary**: request 构建时的上下文窗口优化

两者职责不同，但在代码中容易混淆。

#### 优化方案
```typescript
// 明确分离
interface AgentRuntime {
  // 完整历史，append-only
  transcript: AgentTranscript
  
  // 上下文窗口优化（属于 request materialization）
  contextWindow: {
    compressed?: CompressedSummary
    awake: TranscriptRecord[]
    skills: LoadedSkillsContext
  }
}
```

#### 收益与风险
- **收益**: 概念清晰度提升，便于后续优化 compression 策略
- **风险**: 低
- **成本**: 低（主要是重命名和文档化）

---

## 4. 实施路线图

### 4.1 Phase 1: 清理影子 reducer（P0）

**目标**: 完成 `render-pipeline-optimization.md` P0 的遗留工作

**任务**:
1. 删除 `ChatRenderOutput.committedAssistant` 及 `CommittedAssistantMessageController`
2. 清理 `HostRenderEventMapper` 内部影子状态
3. 确保 `AgentRenderStateReducer` 是唯一 fold 点
4. 更新黄金测试 `RenderPipelineGolden.test.ts`

**预期成果**: 内存占用 -50%，消除状态同步风险

### 4.2 Phase 2: 移除冗余中间层（P1）

**目标**: 简化 stream 链路

**任务**:
1. 合并 `ModelResponseChunk` → 直接 `IUnifiedResponse → AgentStepDraftDelta`
2. 分离 transcript/compression 概念，更新类型定义和文档

**预期成果**: 对象分配 -15%，概念清晰度提升

### 4.3 Phase 3: Preview patch 路径优化（P2）

**目标**: 减少 preview 处理延迟

**任务**:
1. 在 reducer 内直接生成 patch 指令
2. 删除 responder 和 renderer 的重复决策逻辑
3. 更新相关测试

**预期成果**: Preview 延迟 -20-30%

### 4.4 Phase 4: 评估 Host 抽象层（P3）

**目标**: 决定是否保留 HostRenderEvent 层

**任务**:
1. 评估多 host 支持的真实需求（chat/design/telegram）
2. 如果不需要，合并 HostRenderEvent 到 ChatRenderResponder
3. 如果需要，重构为更轻量的抽象

**预期成果**: 根据决策，可能减少 30-40% 对象分配

---

## 5. 关键代码位置索引

### Stream 链路
- Provider: `src/main/request/adapters/base.ts:47`
- Model Executor: `src/main/agent/runtime/model/ModelStreamExecutor.ts:101`
- Parser: `src/main/agent/runtime/model/ModelResponseParser.ts:67`
- Loop: `src/main/agent/runtime/loop/AgentLoop.ts:270,394`
- Render Reducer: `src/main/hosts/shared/render/AgentRenderStateReducer.ts:309`
- Host Mapper: `src/main/hosts/shared/render/HostRenderEventMapper.ts:6`
- Chat Responder: `src/main/hosts/chat/runtime/ChatRenderResponder.ts:84`
- Chat Output: `src/main/hosts/chat/runtime/ChatRenderOutput.ts:128`
- IPC Emitter: `src/main/orchestration/chat/run/infrastructure/event-emitter.ts:37`
- Renderer: `src/renderer/src/hooks/chatRun/chatRunEvent.ts:254`
- Patch Batcher: `src/renderer/src/hooks/chatRun/previewPatchBatcher.ts:103`

### 缓存相关
- Usage Tracking: `src/main/agent/runtime/loop/AgentLoopUsage.ts:7`
- Request Factory: `src/main/hosts/chat/preparation/RunRequestFactory.ts:56`
- Transcript: `src/main/agent/runtime/loop/AgentLoop.ts:394,435`

---

## 6. 相关文档

- [Render Pipeline Optimization](./render-pipeline-optimization.md) - P0/P1/P2 已实施的优化
- [Chat Runtime Architecture](./chat-runtime-architecture-current.md) - 当前架构概览
- [Agent Abstraction](./agent-abstraction.md) - Agent 层抽象设计

---

## 附录：性能收益估算

| 优化项 | 对象分配减少 | 内存占用减少 | 延迟减少 | 实施成本 |
|--------|------------|------------|---------|---------|
| P0: 统一 render 缓存 | - | 50% | - | 中 |
| P1: ModelResponseChunk | 15% | - | - | 低 |
| P1: Transcript/compression | - | - | - | 低 |
| P2: Preview patch 路径 | - | - | 25% | 高 |
| P3: HostRenderEvent | 40% | - | - | 高 |

**总计（如果全部实施）**: 对象分配 -55%，内存占用 -50%，preview 延迟 -25%
