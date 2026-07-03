# Render Pipeline Optimization

> 从 provider raw stream 到 renderer 像素的数据链路诊断核实与优化方案
>
> 状态：P0 / P1 / P2 已实施落地（见文末「实施进展」），行为不变、测试全绿。
> 日期：2026-07-03

## 实施进展（2026-07）

- **P0 — 已落地**：删除影子 reducer `HostRenderStateController`，host 侧 render 状态收敛到
  `HostRenderEventMapper`（唯一 fold 点）。新增黄金端到端测试 `RenderPipelineGolden.test.ts` 作为基线。
- **P1 — 已落地（合法版）**：`agent/runtime/host/output/` 的空壳按依赖边界处理为文档化保留
  （output 层合法归属在 `hosts/`，不把 render 状态族搬进 core runtime）；新增
  `hosts/shared/render/HostStepOutputPolicy` 集中 visible/hidden/tool-only 策略，
  消除 chat + telegram 两处重复的 hidden-tool 名单。
- **P2 — 已落地**：append 语义前移到 reducer/event 层（`PreviewEffect`：text_append /
  reasoning_append / replace 随 `host.preview.updated` 下发），删除 3 处「先合并再 diff」：
  mapper 的 previous/next snapshot 比较、responder 的 `shouldEmit*PreviewPatch`、
  chat mapper 的 `canEmitOptimized*PreviewPatch` + `CommittedAssistantMessageController`
  里被丢弃的 `buildDifferentialSegmentPatches`。黄金测试断言在 P0/P1/P2 前后保持不变。

## 0. TL;DR

对外部诊断的 4 条核心结论逐条核实后的结论：

| # | 诊断 | 核实结论 |
|---|------|----------|
| 1 | 同一事实被重复建模 4-5 次 | **基本成立**，但准确的数字是「累积/缓存点约 9-11 个，content/reasoning/toolCalls 语义被重复建模 4 次」。原诊断口径略偏高但方向正确。 |
| 2 | `HostRenderStateController` 是影子 reducer | **成立**。它与 `AgentRenderStateReducer` 存的是同构 state（复用同一 `AgentRenderMessageState` 类型），只额外加了一个 `lifecycle` 标量。 |
| 3 | `host/output/` 是空壳，实际 output 职责被 `hosts/shared/render/` 顶着 | **完全成立**。`HostStepOutput.ts` / `HostStepOutputBuilder.ts` / `HostStepOutputPolicy.ts` 三个文件都是 `export {}`。 |
| 4 | delta 表达力没被充分利用，下游先合成完整 state 再回头 diff | **成立且比诊断更严重**。链路上存在 **3 处** "先合并再 diff/判断" 的地方，不是 1 处。 |

P0（合并 `HostRenderStateController` 和 `AgentRenderStateReducer`）**可行且低风险**，是回报最高的一步。详见 §4.1 与 §5。

---

## 1. 链路全景（基于真实代码）

### 1.1 真实文件位置

```
provider raw stream
  │
  ▼
[A] DefaultModelStreamExecutor
    src/main/agent/runtime/model/ModelStreamExecutor.ts
    - unifiedChatRequest 的 IUnifiedResponse 流 → 规范化 ModelResponseChunk（delta/final）
    - toDeltaChunk 每个 chunk clone 一次 content/reasoning/toolCalls
  │  ModelResponseChunk（含每 chunk 的增量 content/reasoning + toolCalls）
  ▼
[B] DefaultModelResponseParser  (+ ThinkTagTokenizer)
    src/main/agent/runtime/model/ModelResponseParser.ts
    src/main/agent/runtime/model/ThinkTagTokenizer.ts
    - 累积点①: ToolCallAssemblyState.argumentsBuffer（tool call 参数分片拼接）
    - 累积点②: toolCallsSnapshot（每 chunk map+clone 出的完整 tool call 快照）
    - 输出精细 delta: content_delta / reasoning_delta / tool_call_started / tool_call_ready / ...
    - ThinkTagTokenizer 内部还有 pendingThinkTagPrefix（跨 chunk 的 <think> 边界缓存）
  │  ParsedModelChunk { deltas[], toolCallsSnapshot[], state }
  ▼
[C] DefaultAgentLoop.run
    src/main/agent/runtime/loop/AgentLoop.ts
    - 累积点③: AgentStepDraft.snapshot（applyDeltaToDraft 把 delta 折叠成 content/reasoning/toolCalls 完整快照，AgentLoop.ts:126-166）
    - 累积点④: AgentStepDraft.deltas[]（append-only 保留所有 delta，用于事后算 tool startedAt）
    - emitStepDelta 同时发 delta + 完整 snapshot（AgentLoop.ts:361-367）
    - step 结束 materialize 成 AgentStep（另一份 content/reasoning/toolCalls，AgentStepMaterializer.ts:58-95）
  │  AgentEvent（step.started / step.delta{delta,snapshot} / step.completed{step} / tool.* / loop.*）
  ▼
[D] DefaultAgentEventBus
    src/main/agent/runtime/events/AgentEventBus.ts
    - 纯广播，无累积
  │
  ▼
[E] HostRenderEventForwarder
    src/main/hosts/shared/render/HostRenderEventForwarder.ts
    - 持有 HostRenderEventMapper（AgentEventSink 适配器）
  │
  ▼
[F] HostRenderEventMapper  →  内部持有 AgentRenderStateReducer
    src/main/hosts/shared/render/HostRenderEventMapper.ts
    src/main/hosts/shared/render/AgentRenderStateReducer.ts
    - 累积点⑤: AgentRenderStateReducer.state（committed + preview 两份 block-oriented state）
    - ⚠ diff 点①: map() 先 reducer.snapshot()（previous）再 reducer.apply()（next），
      靠 next.lastUsage !== previous.lastUsage / Boolean(previous.preview) 判断发什么 host event
    - 把 next.preview / next.committed 完整塞进 host.preview.updated / host.committed.updated
  │  HostRenderEvent[]（host.preview.updated{preview:AgentRenderMessageState} / host.committed.updated / host.tool.* / host.lifecycle.* / host.usage.*）
  ▼
[G] ChatRenderResponder  →  持有 HostRenderStateController（影子 reducer）
    src/main/hosts/chat/runtime/ChatRenderResponder.ts
    src/main/hosts/shared/render/HostRenderStateController.ts
    - 累积点⑥: HostRenderStateController.state（committed + preview + lifecycle + lastUsage，和⑤同构）
    - ⚠ diff 点②: handle() 先 state.snapshot()（previous）再 state.apply()（next），
      shouldEmitPreviewTextPatch / shouldEmitPreviewReasoningPatch 比较 previous/next blocks，
      判断能否发「优化 patch」而不是完整 preview（ChatRenderResponder.ts:56-70, 94-106）
  │
  ▼
[H] ChatRenderMapper  →  持有 AgentRenderSegmentMapper
    src/main/hosts/chat/runtime/ChatRenderMapper.ts
    src/main/hosts/shared/render/AgentRenderSegmentMapper.ts
    - canEmitOptimizedTextPreviewPatch: 又一次比较 previous/next blocks 判断「同一 open block 追加」
      （ChatRenderMapper.ts:23-41）—— 这正是 content_delta 早就表达过的信息，被 diff 回来
    - blocks + toolCalls → MessageSegment[]（第 4 次建模：变成 segment）
  │
  ▼
[I] ChatRenderOutput  →  持有 CommittedAssistantMessageController
    src/main/hosts/chat/runtime/ChatRenderOutput.ts
    src/main/hosts/shared/render/CommittedAssistantMessageController.ts
    - 累积点⑦: CommittedAssistantMessageController.finalAssistantMessage（committed MessageEntity 真源）
    - ⚠ diff 点③: commit() 调 buildDifferentialSegmentPatches(previousBody, body)
      （CommittedAssistantMessageController.ts:46）—— 对完整 ChatMessage body 再做一次 segment 级 diff
    - 累积点⑧: messageEntities[]（in-memory message list push tool result / assistant）
  │  RunEventEmitter → IPC → renderer
  ▼
renderer store → 像素
```

### 1.2 host/output 的"两个 output 层"

- 设计意图（`src/main/agent/runtime/host/output/README.md` + `CURRENT_ARCHITECTURE_ISSUES.md` §9.4/§10）：`host/output/` 负责「单个 step 如何变成外部宿主可见输出」，是 host-facing output contract。
- 实际现状：`host/output/` 三个文件全是 `export {}`，真正的 output 职责由 `hosts/shared/render/`（reducer/controller/segmentMapper/committedController）+ `hosts/chat/runtime/`（mapper/output）承担。
- 结论：存在"设计上预留、实现上落在别处"的**两个 output 层**——一个是空壳的目标位置，一个是事实上的实现位置。

---

## 2. 逐条诊断核实（附代码证据）

### 诊断 1：同一事实被重复建模 4-5 次

**核实：基本成立，数字口径需微调。**

以 `content` 为例，它在链路上被建模/拷贝的次数：

1. `ModelResponseChunk.content`（每 chunk 的增量）— `ModelStreamExecutor.ts:88`（`toDeltaChunk`）
2. `AgentStepContentDelta.content`（parser 产出的 delta）— `ModelResponseParser.ts:124-128`
3. `AgentStepDraft.snapshot.content`（loop 折叠出的完整快照）— `AgentLoop.ts:137-139`（`nextSnapshot.content += delta.content`）
4. `AgentStep.content`（materialize 出的稳定结果）— `AgentStepMaterializer.ts:66`
5. `AgentRenderMessageState.content` + 每个 text block 的 `content`（reducer 里的 preview/committed）— `AgentRenderStateReducer.ts:184-208`（block）与 `:481`（`content: event.snapshot.content`）
6. `HostRenderState`（controller 里再 clone 一份同构 state）— `HostRenderStateController.ts:11-17`（`cloneMessageState`）
7. `ChatMessage.content` + `MessageSegment.content`（mapper 产出的 body/segment）— `ChatRenderMapper.ts:50-63`
8. `finalAssistantMessage.body.content`（committed 真源）— `CommittedAssistantMessageController.ts:34-37`

`reasoning` 与 `toolCalls` 走同样的多层拷贝路径。

**修正**：原诊断说"4-5 次"，如果只数「有状态、语义等价的累积对象」，content/reasoning/toolCalls 大约被**独立建模 4 次**（parser snapshot / draft snapshot+deltas / render state / segment+committed body），加上每层的 clone 拷贝更多。累积/缓存点总计约 **8-11 个**（见 §1.1 累积点①-⑧，加上 tokenizer 的 pending 前缀与 executor 的 lastResponse）。诊断的"11+"是把 clone 点也算进去的口径，方向准确。

### 诊断 2：HostRenderStateController 是影子 reducer

**核实：成立。**

证据：

- `AgentRenderState`（`AgentRenderState.ts:64-68`）= `{ committed: AgentRenderMessageState, preview: AgentRenderMessageState | null, lastUsage? }`
- `HostRenderState`（`HostRenderState.ts`）= `{ committed: AgentRenderMessageState, preview: AgentRenderMessageState | null, lifecycle?, lastUsage? }`
- **两者复用完全相同的 `AgentRenderMessageState` 类型**，`HostRenderState` 只比 `AgentRenderState` 多一个 `lifecycle: RunState` 标量。
- `HostRenderStateController.apply`（`HostRenderStateController.ts:27-65`）做的事情本质是：把 `HostRenderEventMapper` 已经算好、并塞进 host event 的 `preview` / `committed`（本来就是 reducer 的输出）再 `cloneMessageState` 存一遍。它不产生任何 reducer 之外的新累积语义，唯一新增的是 `lifecycle` 和 `lastUsage` 两个标量的 fold。

也就是说：reducer 把 `AgentEvent` fold 成 render state → mapper 把 render state 拆成 host event 又携带整份 render state → controller 再把 host event 里的 render state fold 回同构的 render state。**同一份 `committed`/`preview` 在 [F] 和 [G] 被存了两遍。**

### 诊断 3：runtime core 的 output 边界未落地，存在两个 output 层

**核实：完全成立。**

证据：

- `src/main/agent/runtime/host/output/HostStepOutput.ts:12` → `export {}`
- `src/main/agent/runtime/host/output/HostStepOutputBuilder.ts` → 只有注释 + `export {}`
- `src/main/agent/runtime/host/output/HostStepOutputPolicy.ts` → 只有注释 + `export {}`
- 三个文件的 doc 注释清楚写明它们**应该**承担 "把 AgentStep 变成 HostStepOutput"、"visible/hidden/tool-activity-only 输出规则" 的职责，但代码是空的。
- 实际承担这些职责的是 `hosts/shared/render/AgentRenderStateReducer.ts` + `hosts/shared/render/AgentRenderSegmentMapper.ts` + `hosts/chat/runtime/ChatRenderMapper.ts`（例如 hidden tool 的 `presentation.transcriptVisible=false` 逻辑在 `AgentRenderSegmentMapper.ts:186-192`，这本该是 `HostStepOutputPolicy` 的职责）。
- `CURRENT_ARCHITECTURE_ISSUES.md` §9.4 与 §10 明确把 "host/output 负责外部可见输出" 列为目标边界，印证这是"设计预留但未落地"，不是历史遗留误判。

### 诊断 4：delta 协议表达力没被充分利用，先合成完整 state 再回头 diff

**核实：成立，且比诊断描述的更严重（3 处 diff，不是 1 处）。**

链路已经有精细 delta：`content_delta` / `reasoning_delta` / `tool_call_started` / `tool_call_ready`（`AgentStepDraft.ts:40-96`），loop 也在 `emitStepDelta` 里把 delta **和** snapshot 一起发（`AgentLoop.ts:361-367`）。但下游反复丢掉增量语义又 diff 回来：

- **diff 点①**（`HostRenderEventMapper.ts:11-14, 43-49, 63`）：`map()` 先 `reducer.snapshot()` 再 `reducer.apply()`，用 `next.lastUsage !== previous.lastUsage`、`Boolean(previous.preview)` 判断发什么。preview 更新时直接把整份 `next.preview` 塞进 `host.preview.updated`——增量语义在这里第一次丢失。
- **diff 点②**（`ChatRenderResponder.ts:56-70`）：`shouldEmitPreviewTextPatch` / `shouldEmitPreviewReasoningPatch` 再次比较 `previousState.preview` 和 `nextState.preview` 的 blocks，试图判断"能不能只发一个 text/reasoning patch 而不是完整 preview"——这是在**用 diff 重新推断 delta 本来就知道的事**（这次 delta 是不是对同一个 open block 的追加）。
- **diff 点③**（`ChatRenderMapper.ts:23-41` + `CommittedAssistantMessageController.ts:46` → `buildDifferentialSegmentPatches`）：`canEmitOptimizedTextPreviewPatch` 比较 `previousState.blocks` 与 `nextState.blocks`（"同一 open block、blocks 数量相同" 才算可优化追加）；commit 时 `buildDifferentialSegmentPatches` 又对完整 `ChatMessage` body 做一次 segment 级全量 diff。

**结论**：`content_delta` 事件本身就已经携带了 "这是对当前 text block 的追加" 这一事实。但因为 [F] 把 delta 压成 full preview state，[G]/[H] 只能靠 "previous vs next 结构比较" 把这个事实**猜回来**。这就是诊断说的"丢了增量语义又 diff 回来"，而且发生了 3 次。

---

## 3. 关键判断：这些诊断和项目自己的设计意图一致

`CURRENT_ARCHITECTURE_ISSUES.md` §7 已经用项目自己的话总结了同样的根因：

> 不是功能本身复杂，而是同一个运行事实在不同层被重复建模。
> 重复建模的典型位置：loop working state / transcript history / user-visible message / host event payload。

`hosts/shared/render/README.md:157-165`（Design Rules）也明确写了：

> - 不重新引入第二套 committed/preview 真源

而 `HostRenderStateController` 恰恰是第二套 committed/preview 真源。**诊断与项目既有设计文档不冲突，反而是对既有 TODO 的具象化。** 这降低了优化方案的对齐成本。

---

## 4. 优化方案（P0-P5）

> 原则：先做"消除同构重复"和"落地已声明边界"的低风险项（P0/P1），再做"把增量语义前移"这类需要改协议的项（P2）。P3-P5 是收益递减/远期项。

### P0：合并 HostRenderStateController 与 AgentRenderStateReducer

**目标**：消除累积点⑥（controller 的同构 state），让 host 侧只保留一份 render state 真源。

**当前**：
```
[F] HostRenderEventMapper（内部 AgentRenderStateReducer 存 committed/preview）
      → HostRenderEvent（携带整份 preview/committed）
[G] ChatRenderResponder（HostRenderStateController 再存一份同构 committed/preview + lifecycle/usage）
```

**改动后（推荐方案 A — 收编 controller 为 mapper 的"lifecycle 装饰"）**：

- `HostRenderEventMapper` 已经持有 reducer，它本就是唯一 fold `AgentEvent → render state` 的地方。让它额外 fold `lifecycle` / `lastUsage` 两个标量（这两个本来就来自它 emit 的 host event），对外多暴露一个 `snapshot(): HostRenderState`。
- `ChatRenderResponder` 不再自己持有 `HostRenderStateController`，改为消费 mapper 直接给出的 `previous`/`next` 快照。由于 `HostRenderEventForwarder` 已经是 `mapper.map(event)` 的唯一入口，可以让 forwarder 把 mapper 的 `{ hostEvents, previousState, nextState }` 一起递给 sink，或者让 host event 自带足以驱动 responder 的 `previous`/`next`（见下方"接口调整"）。

**接口调整（最小侵入版）**：`ChatRenderResponder.handle` 目前依赖 `this.state.snapshot()` 拿 previous、`this.state.apply(event)` 拿 next（`ChatRenderResponder.ts:42-46`）。这两份 state 的内容 100% 来自 mapper 已算好的 `preview`/`committed`。因此：
- 方案 A1（改 host event 载荷）：在 `host.preview.updated` / `host.committed.updated` 里让 mapper 附带它的 `previousPreview`（mapper 内部本来就有 `previous = reducer.snapshot()`，`HostRenderEventMapper.ts:11`）。responder 直接用事件里的 previous/next，删掉 `HostRenderStateController`。
- 方案 A2（forwarder 传 state）：`HostRenderEventForwarder.handle` 改成从 mapper 拿 `{ events, previous, next }` 一并转发。侵入点集中在 forwarder + responder。

**改动文件**：
- `src/main/hosts/shared/render/HostRenderEventMapper.ts`（新增 `snapshot()` / lifecycle+usage fold，或在事件里带 previous）
- `src/main/hosts/shared/render/HostRenderEvent.ts`（若走 A1，preview/committed 事件加可选 `previousPreview` 字段）
- `src/main/hosts/chat/runtime/ChatRenderResponder.ts`（删除 `HostRenderStateController` 依赖，改用事件/mapper 提供的 state）
- 删除 `src/main/hosts/shared/render/HostRenderStateController.ts` + 其 test（或保留为 mapper 的薄封装）
- `src/main/hosts/shared/render/index.ts`（去掉导出）

**风险**：低。
- controller 唯一独有的语义是 `lifecycle` 标量，且它的值来自 mapper emit 的 `host.lifecycle.updated`（`HostRenderEventMapper.ts:22-29` 等），迁移是纯搬运。
- `telegram` host 也用 `HostRenderStateController`（README 提到），需同步适配——但 telegram responder 拿的也是同一份 mapper 输出，改动模式一致。**改前必须 grep 全量 `HostRenderStateController` 使用点。**

**收益**：删掉一整个同构 state 对象 + 每次事件的 `cloneMessageState` 双拷贝；host 侧 render state 真源单点化，直接消解 README 里"不重新引入第二套 committed/preview 真源"的违背。

**改动量估计**：中小。约 2-3 个文件核心改动 + 2 个测试文件调整，~150-250 行。

**验收**：
- `src/main/hosts/shared/render/__tests__/HostRenderEventMapper.test.ts`（现有，需扩展 lifecycle/usage 断言）
- `src/main/hosts/chat/runtime/__tests__/ChatRenderResponder.test.ts`（现有，覆盖 preview→commit 流转，回归保护）
- 删除/改写 `HostRenderStateController.test.ts`
- `pnpm test:run` + `pnpm typecheck`

### P1：让 host/output/ 真正落地，把 AgentRenderStateReducer 收编为 HostStepOutputBuilder 的内部实现

**目标**：消除"两个 output 层"，把 `hosts/shared/render/` 的 output 职责搬到 `agent/runtime/host/output/` 声明的边界里，或反过来正式承认 `hosts/shared/render/` 就是 output 层并删除空壳。

**两个方向，二选一（建议先决策再动手）**：

- 方向 B1（落地空壳）：把 `AgentRenderStateReducer` + `AgentRenderSegmentMapper` 的"step → 可见 output"职责搬进 `HostStepOutputBuilder`，把 `AgentRenderSegmentMapper.ts:186-192` 的 hidden-tool 可见性规则搬进 `HostStepOutputPolicy`，`HostStepOutput.ts` 定义稳定输出模型。`hosts/shared/render/` 变成薄适配。
- 方向 B2（删空壳）：如果团队认为 output 层就该在 `hosts/` 而非 `agent/runtime/host/`，则删除三个 `export {}` 文件 + README，更新 `CURRENT_ARCHITECTURE_ISSUES.md` §9.4/§10 的边界描述，承认 `hosts/shared/render` 是事实 output 层。

**改动文件**：
- B1：`src/main/agent/runtime/host/output/HostStepOutput.ts` / `HostStepOutputBuilder.ts` / `HostStepOutputPolicy.ts`（实现）、`AgentRenderStateReducer.ts` / `AgentRenderSegmentMapper.ts`（迁移逻辑）
- B2：删除上述三个空壳 + README，更新架构文档

**风险**：中（B1 高于 B2）。B1 涉及跨 `agent/runtime` ↔ `hosts` 的目录搬迁，`AgentRenderStateReducer` 与 `AgentEvent` 强耦合（`AgentRenderStateReducer.ts:1-2, 320-373`），搬进 core 层需谨慎避免 core 反向依赖 host contract。B2 风险低但需要团队对"output 层归属"达成一致。

**收益**：消除概念上的"两个 output 层"，让 `CURRENT_ARCHITECTURE_ISSUES.md` §10 的分层目标名副其实。

**改动量估计**：B1 大（跨层重构，~400-600 行）；B2 小（删文件 + 改文档，~50 行）。

**建议**：**先做 B2 或先只做决策**。在 P0 落地前不建议做 B1，因为 P0 会改变 render state 的所有权，B1 应基于 P0 之后的稳定形态。

**验收**：`AgentRenderStateReducer.test.ts` / `AgentRenderSegmentMapper.test.ts` 保持绿；若 B1 迁移逻辑，新增 `HostStepOutputBuilder.test.ts` / `HostStepOutputPolicy.test.ts`。

### P2：把 "append vs full replace" 语义提前到 delta/event 层

**目标**：消除 diff 点②③里的"结构比较猜增量"，让下游直接消费 delta 本身携带的 append/replace 语义。

**当前**：`content_delta` 事件已知道"这是对当前 text block 的追加"，但 [F] 压成 full preview 后，[G] `ChatRenderResponder.shouldEmitPreviewTextPatch`（`ChatRenderResponder.ts:56-62`）和 [H] `ChatRenderMapper.canEmitOptimizedTextPreviewPatch`（`ChatRenderMapper.ts:23-31`）靠比较 previous/next blocks 把它猜回来。

**改动后**：`HostRenderEventMapper` 在处理 `step.delta` 且 `delta.type === 'content_delta' | 'reasoning_delta'` 时，直接产出一个语义化的 host 事件（如 `host.preview.text.appended { blockId, delta, fullContent }` / `host.preview.reasoning.appended`），而不是笼统的 `host.preview.updated{整份 preview}`。responder 收到 append 事件时直接发对应 segment patch，无需 `shouldEmit*Patch` 的结构比较；只在 block 边界切换/tool 出现等"非纯追加"时才发 full preview。

**改动文件**：
- `src/main/hosts/shared/render/HostRenderEvent.ts`（新增 append 型事件）
- `src/main/hosts/shared/render/HostRenderEventMapper.ts`（依 delta 类型发 append 事件）
- `src/main/hosts/chat/runtime/ChatRenderResponder.ts`（删除 `shouldEmit*Patch` 结构比较，改为按事件类型分派）
- `src/main/hosts/chat/runtime/ChatRenderMapper.ts`（删除 `canEmitOptimized*PreviewPatch`）

**风险**：中高。这是协议改动，直接影响 renderer 侧 preview 增量渲染路径，回归面较大；需要严格的 patch-流回归测试。

**收益**：删掉 diff 点②③的结构比较逻辑，preview 增量路径从"合成 full state → diff 回增量"变成"直接透传增量"，减少每 chunk 的 blocks 数组比较与 full state 构造。

**改动量估计**：中，~250-350 行，跨 3-4 文件。

**依赖**：应在 P0 之后做（P0 简化了 state 所有权，P2 的事件路径改动才干净）。

**验收**：`HostRenderEventMapper.test.ts`（新增 append 事件断言）、`ChatRenderResponder.test.ts`（preview 追加/切块回归）、`AgentRenderSegmentMapper.test.ts`。此外建议补一条 e2e 级 vitest：喂一串 `content_delta` + 一次 tool，断言 emit 的 patch 序列不变。

### P3（可选）：content/reasoning 字符串不必在 draft.snapshot 和 reducer.preview 双份

**目标**：消除累积点③⑤对 content/reasoning 字符串的重复持有。

**当前**：`AgentStepDraft.snapshot.content`（`AgentLoop.ts:137`）和 `AgentRenderMessageState` 的 block content（`AgentRenderStateReducer.ts:184-208`）都持有全量文本；reducer 里 `preview.content = event.snapshot.content`（`AgentRenderStateReducer.ts:481`）又直接把 draft snapshot 的 content 拷进来。

**改动后**：reducer 的 block-oriented state 已经能重建完整 content（把 text blocks 拼接即可），可考虑让 `AgentRenderMessageState.content` 变为派生 getter 而非存储字段；或反过来，若 renderer 只需 block/segment，则 preview 层不必再存扁平 `content`。

**风险**：中。`content` 字段被 `ChatRenderMapper.buildPreviewBody/buildCommittedBody`（`ChatRenderMapper.ts:53, 92`）直接使用（`content: state.content`），改成派生需确认所有消费点。

**收益**：省一份字符串拷贝，语义更单一。收益相对小。

**改动量估计**：小-中，~100 行。**优先级低，收益/风险比一般。**

### P4（远期）：IPC 边界上移，renderer 侧持有 reducer 累积 MessageEntity

**目标**：把 `content_delta`/`reasoning_delta`/`tool_call_ready` 这一层精细 delta 直接送过 IPC，renderer 侧持有一个 reducer 累积成 MessageEntity，main 侧不再维护 preview 的完整 MessageEntity。

**风险**：高（跨进程协议大改，涉及持久化、断线重连、typewriter 语义）。

**收益**：理论上最彻底——main 侧只发 delta，累积点⑤⑥⑦全部下沉到 renderer，一份真源。

**改动量估计**：大（架构级）。**明确列为远期，不在本轮范围。**

### P5（补充建议）：统一 3 个 diff 点的判等逻辑

即便不做 P2，`buildDifferentialSegmentPatches`（`src/shared/run/messagePatch.ts`）、`canEmitOptimized*PreviewPatch`、`shouldEmit*PreviewPatch` 三处判等分散，逻辑重叠。可先抽出单一 `segmentEquivalence` 工具收敛，降低后续 P2 的改动面。低风险、小改动（~80 行），可作为 P2 的前置重构。

---

## 5. 建议实施顺序与验收

| 步 | 项 | 前置 | 验收方式 | 风险 |
|----|----|------|----------|------|
| 1 | **P0** 合并 controller 与 reducer | 无 | 扩展 `HostRenderEventMapper.test.ts` + `ChatRenderResponder.test.ts`；`pnpm test:run` + `pnpm typecheck` 全绿；手测一轮带 tool 的 chat | 低 |
| 2 | **P1-B2** 决策 output 层归属 + 删空壳 或 写 ADR | P0 | 文档评审；不改行为，测试保持绿 | 低 |
| 3 | **P5** 收敛 3 处判等 | 无（可与 P0 并行） | `messagePatch` 相关 test + segment mapper test | 低 |
| 4 | **P2** append 语义前移 | P0, P5 | 新增 append 事件 test + preview patch 序列回归 test | 中高 |
| 5 | **P1-B1** output builder 真落地（若选 B1） | P0, P2 | 新增 builder/policy test | 中 |
| 6 | **P3** content 去重 | P2 | 消费点回归 | 中 |
| 7 | **P4** IPC 边界上移 | 全部 | 架构级，另立项 | 高 |

**通用验收基线**（每步都要过）：
- `pnpm typecheck`（node + web）
- `pnpm test:run`（重点：`src/main/hosts/shared/render/__tests__/*` 与 `src/main/hosts/chat/runtime/__tests__/ChatRenderResponder.test.ts`）
- 手动冒烟：一次纯文本回复、一次带 `<think>` reasoning 的回复、一次触发 tool call 的多 step 回复，观察 preview 流式追加与 committed 是否与改动前一致。

**现有测试覆盖评估**：
- reducer / segment mapper / event mapper / controller 均有单测（`hosts/shared/render/__tests__/`），P0/P1/P5 有较好的回归护栏。
- 但**缺少端到端的"delta 序列 → emit 的 patch 序列"回归测试**，这正是 P2 最需要的护栏。建议在做 P2 前先补一条这样的黄金测试（喂固定 chunk 序列，快照 emit 的 RunEvent 序列），否则 P2 风险不可控。

---

## 6. 对 P0 可行性的最终判断

**P0 可行，且是本轮性价比最高的一步，建议优先落地。**

理由：
1. `HostRenderStateController` 存的 `committed`/`preview` 与 `AgentRenderStateReducer` 严格同构（复用同一 `AgentRenderMessageState` 类型），唯一独有的是 `lifecycle`/`lastUsage` 两个标量 fold——迁移是纯搬运，无语义重写。
2. 数据流向单向清晰：`mapper.map()` 是 host event 的唯一产生点，`HostRenderEventForwarder` 是唯一入口，改造面集中在 mapper + forwarder + responder 三个文件。
3. 现有 `HostRenderEventMapper.test.ts` / `ChatRenderResponder.test.ts` 提供回归护栏。
4. 与项目自身设计文档（`hosts/shared/render/README.md` "不重新引入第二套 committed/preview 真源" + `CURRENT_ARCHITECTURE_ISSUES.md` §7 "同一事实重复建模"）方向完全一致，无需推翻既有设计共识。

**唯一需要先确认的风险点**：`HostRenderStateController` 的其他消费者（尤其 telegram host runtime，README 提到 `TelegramRenderResponder -> HostRenderStateController`）。落地前必须全量 grep `HostRenderStateController` 的使用点，确保 telegram/未来 host 同步适配。若 telegram 侧改动过大，可退而采用"保留 controller 类名但内部委托给 mapper 的单一 state"的过渡方案，先消除双份累积，再逐步下线。
