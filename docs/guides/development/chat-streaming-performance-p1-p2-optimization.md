# Chat streaming performance P1/P2 implementation guide

Status: Implemented; automated verification complete; runtime profiling pending
Owner: Renderer maintainers
Date: 2026-09-02
Baseline commit: `cbb93d1a399c2cf42bd9a16432c8dab51b4c5773`

## 1. Goal

Reduce renderer work during assistant streaming in the current 8-turn, 62-tool-result conversation while preserving run lifecycle, transcript presentation, scrolling, grouping, and input behavior.

The work is split into three independently mergeable packages:

1. P1 isolates high-frequency chat-store subscriptions.
2. P2-A applies one preview patch batch with one segment-array update.
3. P2-B reuses the stable assistant projection prefix and rebuilds only the affected suffix.

`tools.streamChunkDebugEnabled` remains under the existing user-controlled toggle. Before/after runtime measurements use the same toggle value so the comparison remains valid.

## 2. Current evidence

### P1 subscription fan-out

`useChatRun()` currently calls `useChatStore()` without a selector. The hook is mounted by `ChatInputArea` and by every `AssistantMessageContainer`, so any root chat-store update can schedule those consumers.

`ChatInputActions` also combines a precise `messages` selector with a second whole-store subscription for chat identity, chat list, and actions.

### P2 repeated segment work

`applyPreviewSegmentPatches()` reduces a batch through `applyMessageSegmentPatchToEntity()`. Each patch performs identity lookup, copies the segment array, and creates a new message body.

`mapAssistantMessage()` rebuilds committed items, preview items, text/support lanes, and support grouping whenever the preview message changes. Unchanged segment references are already preserved by `messagePatch.ts`, which provides the identity needed for safe prefix reuse.

## 3. Shared constraints

- Preserve `RunRegistry`, cancellation, steering, background title events, and post-run behavior.
- Preserve message, segment, tool-call, and completed-work ordering and keys.
- Preserve preview-to-committed identity and current memo equality contracts.
- Preserve Chat Window scroll ownership and Message Scroller behavior.
- Keep Zustand as the canonical message state. Projection caches remain local to the Renderer component tree.
- Keep schema, IPC contracts, configuration, persisted state, and dependencies unchanged.
- Keep `streamChunkDebugEnabled` behavior and current value unchanged.
- Each work package owns disjoint implementation files and tests.

## 4. P1: isolate high-frequency subscriptions

### Files

- `src/renderer/src/features/chat/runtime/useChatRun.ts`
- `src/renderer/src/features/chat/runtime/__tests__/useChatRun.test.tsx`
- `src/renderer/src/features/chat/input/ChatInputActions.tsx`
- `src/renderer/src/features/chat/input/__tests__/ChatInputActions.performance.test.tsx`

### Implementation

1. Remove the selector-free `useChatStore()` subscription from `useChatRun()`.
2. Read the latest store through `useChatStore.getState()` when `onSubmit`, `cancel`, or `steer` is invoked.
3. Pass stable store actions to `bindChatRunEvents`; event-time state checks continue through current `getState()` paths.
4. Replace the whole-store subscription in `ChatInputActions` with one selector per required state value or action.
5. Keep `runPhase` reactive because it controls the visible submit/cancel state.
6. Keep `ChatImageGallery` outside this package. It is mounted only while composer media exists and leaves the streaming surface after submission.

### Tests

- A `useChatRun` consumer does not render when only `preview.message` changes.
- A consumer rendered before chat/model changes uses the latest chat UUID, chat ID, model reference, instruction, and permission mode when submitting.
- Cancellation and steering still resolve the latest active chat.
- `ChatInputActions` does not render for a preview-only update.
- `ChatInputActions` still updates for message count, current chat identity, chat-list workspace, and run-phase changes.

### Exit criteria

- Selector-free `useChatStore()` calls are absent from `useChatRun.ts` and `ChatInputActions.tsx`.
- Preview-only changes produce zero update commits in their render-count tests.
- Existing run lifecycle tests pass.

## 5. P2-A: apply a patch batch once

### Files

- `src/shared/run/messagePatch.ts`
- `src/shared/run/__tests__/messagePatch.batch.test.ts`
- `src/renderer/src/features/chat/state/chatTranscriptStore.ts`
- `src/renderer/src/features/chat/state/__tests__/chatMessagePatch.test.ts`

### Implementation

1. Add one shared batch helper that applies `MessageSegmentPatch[]` to a message entity.
2. Copy the current segment array once and build an identity-to-index map once for the active batch state.
3. Apply patches in input order so `replaceSegments`, appended segments, repeated identities, content, tool calls, and `typewriterCompleted` retain sequential semantics.
4. Reuse unchanged segment objects and stable tool-call arrays through the existing equality helpers.
5. Create the resulting entity and body once per batch.
6. Route both visible-chat and buffered-chat batch actions through the shared helper.
7. Keep the single-patch helpers intact for their current callers.

### Tests

Use differential tests: compare the batch helper with sequential application through `applyMessageSegmentPatchToEntity()`.

Cover:

- append-only patches;
- two updates to the same segment identity;
- mixed text, reasoning, tool-call, and error segments;
- `replaceSegments` followed by updates and appends;
- content, toolCalls, and `typewriterCompleted` metadata;
- unchanged segment reference preservation;
- visible and buffered chat transcript actions.

### Exit criteria

- One batch creates one final message/body/segment-array result.
- Batch and sequential outputs are deeply equal across the covered cases.
- Unchanged segment references remain stable.

## 6. P2-B: incremental assistant projection

### Files

- `src/renderer/src/features/chat/message/assistant-message/model/assistantMessageMapper.ts`
- `src/renderer/src/features/chat/message/assistant-message/model/assistantMessageProjectionCache.ts`
- `src/renderer/src/features/chat/message/assistant-message/AssistantMessageContainer.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageProjectionCache.test.ts`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageRenderModel.test.ts`

### Implementation

1. Keep `mapAssistantMessage()` as the complete reference projection and fallback.
2. Add a pure incremental projector that accepts the previous cache snapshot, the next message source, and the mapper context.
3. Compare segment identity and object reference to find the first changed segment.
4. Move the invalidation point back to the nearest preceding visible text boundary. This preserves completed-work window semantics when reasoning or tool calls change near a boundary.
5. Reuse text items, support items, and support units before the invalidation point.
6. Rebuild the suffix through the same mapping and grouping rules used by the complete projector.
7. Use the complete projector when segments shrink, reorder, change transcript visibility, lose stable identity, switch preview/committed layers, or transition streaming state in a way that changes tail semantics.
8. Store the cache snapshot in `AssistantMessageContainer` with `useRef`. Reset it when the message identity changes.
9. Keep provider/model header resolution responsive to account and provider-definition changes.
10. Keep Zustand free of projection state.

### Tests

Every incremental result must match `mapAssistantMessage()` for:

- a 62-tool completed prefix followed by appended answer text;
- running tool updates to completed and failed;
- consecutive reasoning merge changes;
- a new visible text boundary closing completed work;
- hidden transcript segments;
- error segments that keep their standalone grouping;
- preview-to-committed transition;
- segment deletion, replacement, and reorder fallback;
- provider/account and streaming-context changes;
- stable object reuse before the invalidated suffix.

### Exit criteria

- Incremental and complete projection outputs are equivalent for all covered transitions.
- Sealed prefix render objects retain identity during append-only tail updates.
- Completion and reorder paths use the complete fallback and preserve current keys.

## 7. Verification

Run from the repository root:

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/renderer/src/features/chat/runtime/__tests__/useChatRun.test.tsx \
  src/renderer/src/features/chat/input/__tests__/ChatInputActions.performance.test.tsx \
  src/shared/run/__tests__/messagePatch.batch.test.ts \
  src/renderer/src/features/chat/state/__tests__/chatMessagePatch.test.ts \
  src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageProjectionCache.test.ts \
  src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageRenderModel.test.ts
pnpm_config_verify_deps_before_run=false pnpm run typecheck:web
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-boundaries
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-doc-paths
pnpm_config_verify_deps_before_run=false pnpm run test:renderer-architecture
git diff --check
```

Run the nearest existing lifecycle, preview batching, assistant rendering, and support-grouping suites when a touched contract is shared with them.

## 8. Runtime acceptance

Use the same development instance, current 8-turn conversation, 62 tool results, and unchanged `streamChunkDebugEnabled` setting for both captures.

1. Record React Profiler and DevTools Performance for one comparable streamed response before and after the integrated change.
2. Confirm historical Assistant rows and `ChatInputActions` have zero preview-only commits.
3. Confirm the latest Assistant produces at most one React commit per preview batch flush.
4. Confirm React commit P95 is below 8 ms and the checked stream contains no main-thread task above 50 ms attributable to rendering.
5. Confirm the batch helper output count matches preview batch flush behavior.
6. Confirm projection self-time falls by at least 50% on the 62-tool transcript fixture or remains below 2 ms P95.
7. Exercise submit, cancel, steer, regenerate, branch, search jump, manual scrolling, tail follow, and jump-to-latest.

## 9. Failure handling and rollback

- P1 rollback restores the two selector-free subscriptions and leaves P2 intact.
- P2-A rollback returns batch actions to sequential patch application and leaves the projection cache intact.
- P2-B rollback removes the component-local cache and routes every render through `mapAssistantMessage()`.
- Every rollback is renderer/shared-code only and requires no data migration.

## 10. Completion record

Implemented files:

- P1: `useChatRun.ts`, `useChatRun.test.tsx`, `ChatInputActions.tsx`, and `ChatInputActions.performance.test.tsx`.
- P2-A: `messagePatch.ts`, `messagePatch.batch.test.ts`, `chatTranscriptStore.ts`, and `chatMessagePatch.test.ts`.
- P2-B: `assistantMessageMapper.ts`, `assistantMessageProjectionCache.ts`, `AssistantMessageContainer.tsx`, and `assistantMessageProjectionCache.test.ts`.
- Documentation: this guide, `docs/README.md`, and `docs/guides/README.md`.

Implementation details:

- P1 reads the current run submission state at invocation time and subscribes input actions only to the state slices they render.
- P2-A builds one identity index and one segment-array result for each preview patch batch while retaining sequential patch semantics.
- P2-B keeps the complete mapper as its reference path, reuses stable projection prefixes, and publishes the component-local cache during React's layout commit phase.
- `tools.streamChunkDebugEnabled` remains under the existing toggle with its current value unchanged.

Automated verification on 2026-09-02:

- Focused P1/P2 suites: 6 files and 66 tests passed.
- Nearby chat streaming, batching, rendering, and performance suites: 26 files and 164 tests passed.
- Full Vitest suite: 291 files passed, 3 skipped; 1,795 tests passed, 13 skipped.
- `typecheck:web`, `check:renderer-boundaries`, `check:renderer-doc-paths`, `test:renderer-architecture`, and `git diff --check` passed.

Real-environment acceptance remains open for the before/after React Profiler and DevTools Performance capture described in section 8. Automated tests establish behavior and reference reuse; the live capture establishes commit timing, long-task attribution, and P95 targets on the current development conversation.

## P3：将预览内容订阅下移到当前助手行

`ChatWindow` 只订阅预览是否存在，用于决定 pending/committed 行结构；
`ChatTranscriptScroller` 传递 `previewRenderIndex`，当前助手行直接订阅 `preview.message.body`。
历史行的 selector 返回 `undefined`，预览内容 patch 不再触发 shell 或整个消息列表渲染。
Header 和输入区通过 `memo` 隔离父级更新，各自的状态订阅继续生效。
Jump to latest 在点击时读取最新预览，保留跳过 typewriter 的行为。

回归覆盖：20 次预览内容更新，修改前 Header、输入区和 transcript 各增加 20 次渲染；
修改后均增加 0 次。行级测试验证当前助手更新、历史行稳定、pending 预览、预览清理、
点击读取最新内容，以及已有 pending→committed 的 shell identity 契约。
这些数字证明订阅隔离；真实并行工具的帧率仍需 Electron 采样验收。

### emit 链路继续诊断的边界

当前链路为 AgentEventBus → HostRenderEventMapper/ChatRenderResponder →
RunEventEmitter/HostOutputDispatcher → 单个 IPC channel listener → per-run 顺序处理 →
PreviewPatchBatcher（rAF 合并）→ Zustand → 行级订阅。
主进程当前逐事件发送，工具开始/结束会提交完整助手消息；传输事件不写 run-event trace 表。
这些是测量点，不能单凭存在队列或 emit 层级认定为性能根因。

同时记录事件类型/频率、载荷大小、事件时间戳到 renderer 的延迟、preview/messages 引用更新次数、
Long Task 和 Long Animation Frame 的来源。区分等待模型响应与 renderer 的处理积压。
若 IPC 延迟持续增长而 reducer/render 耗时低，再考虑在发送端合并可覆盖的预览快照；
确认、终态和持久化事件必须保留顺序与交付契约。若延迟低而 React 长帧突出，继续定位渲染消费者。

本轮验证：shell/input 相关 131 项测试通过；全量 coverage 为 2,209 passed / 20 skipped，
328 个测试文件通过 / 5 skipped。Web typecheck 与 renderer boundaries、architecture、doc paths 通过。
变更文件 ESLint 与 HEAD 对比无新增 error；`ChatInputArea` 的 8 个和 history-visibility 测试的
22 个既有 error 仍是 lint 基线阻塞。

Electron 行级回放已观察到预览触发 React commit 且原有三个 spinner 节点保留；
该回放同时渲染 committed/preview 层，共六个图标，且页面 `document.visibilityState === 'hidden'`、
rAF 计数为 0、定时器降频，故不能作为三工具并行场景的帧率验收或前后性能对比。
该轮无效回放不用于判断卡顿是否消失。

### 前台真实请求采样

后续 45,003ms 采样全程 `visible`，记录两个 `run.accepted`，最多两个可见 spinner：

| 指标 | 结果 |
| --- | --- |
| preview.segment.updated / preview.updated | 4,890 / 236 |
| preview 引用更新 / messages 引用更新 | 556 / 8 |
| rAF 间隔样本 / P95 / 最大 | 5,117 / 9.4ms / 166.6ms |
| 超过 50ms 的帧间隔 | 7 |
| IPC envelope 时间戳到 renderer 收到的延迟 P95 / 最大 | 11ms / 215ms |
| Long Task | 2（52ms、108ms） |

约 19.9s 的长帧包含 React `dispatchDiscreteEvent`；随后约 163ms 的长帧主要由
React 回调组成，脚本记录的强制 layout 耗时为 0。该样本证明仍有少量 React 长帧；
时间戳延迟包含 IPC/主线程调度，不能独立证明发送队列积压。尚未分离每个 run 的延迟趋势。
现有按帧合并减少了预览状态更新，主进程逐 patch 发送仍是后续可以衡量的优化点。

本轮与之前请求内容/操作不同，不计算前后帧率提升比例；也未覆盖原截图三个同时可见 spinner。
补充 CPU profile 时请求已结束，未取得剩余长帧的组件级 profile。
下一步在同一输入、同一历史长度、前台窗口下，按 run 和时间桶采集延迟及 CPU profile，
把剩余 React 长帧定位到具体组件；只有发送端积压或重复快照开销被测量确认时再重设计传输合并层。

### 固定输入 CPU-only 采样（2026-09-30）

在原聊天中提交同一条固定英文输入，要求杭州天气、南宁天气、HGH→NNG 航班三路
全新检索；等待最终回答完成后继续采样 3 秒。Electron 原生 debugger 的 V8 Profiler
使用 1ms 目标采样间隔，得到 74,502.942ms、58,439 个样本。采样时启用了
`Emulation.setFocusEmulationEnabled`，避免此前 hidden 状态暂停 rAF；这是开发环境
聚焦模拟样本，不替代自然前台窗口的动画帧率验收。完整 Performance trace 曾因
处理数据量过大未成功导出，该轮不纳入结论。临时主进程采样钩子已恢复。

| 调用栈 | 累计采样耗时 |
| --- | --- |
| ChatStatsPanel（inclusive） | 736.09ms |
| formatCompactTokenCount | 268.08ms |
| formatProgressPercent | 193.87ms |
| StreamingMarkdownLite 顶层回调（inclusive） | 228.37ms |
| ReasoningSegmentComponent（inclusive） | 139.51ms |
| previewPatchBatcher.flush（inclusive） | 81.33ms |
| handleChatRunEventSafely（inclusive） | 75.94ms |
| IPC registry.listener（inclusive） | 69.37ms |
| ChatTranscriptScrollerBody（inclusive） | 22.25ms |
| ChatWindow（inclusive） | 2.52ms |

这些是整段采样累计耗时，inclusive 存在嵌套重叠，不能相加，也不是单帧耗时。
未采到 ChatHeader/ChatInputArea 的具名执行样本，不等于实际渲染次数为零。
idle 占 62,576.90ms；program 占 5,288.44ms，V8 CPU profile 无法单独归因其中
的原生浏览器工作。React 开发模式 JSX、调度及测量也占明显开销。

源码解释了一个仍然存在的更新放大路径：ArtifactsPanel 使用无 selector 的
`useChatStore()`，每次 preview 更新都会订阅整份 store；当前 Overview 子组件
ChatStatsPanel 随父组件更新。其 JSX 每次执行都会构造多个 Intl.NumberFormat，
即使 stats 的 useMemo 未重新计算。buildChatStatsModel 累计只有 0.16ms。
第一段流式输出期间 ChatStatsPanel 为 353.4ms，第一轮工具执行期间为 24.0ms，
热点主要出现在流式更新，而非仅工具执行阶段。建议下一步收窄 ArtifactsPanel
订阅并复用格式化器，再用相同固定输入验证；本次采样未新增这些实现变更。

事件记录：1 个 run.accepted / run.completed，8,549 个 preview.segment.updated、
327 个 preview.updated、15 个 message.updated，6 个工具开始和完成。
模型额外调用了技能/情绪工具及补充检索。工具执行区间依次为约
28.016–31.659s、31.661–33.143s、33.146–33.650s、33.651–33.653s、
33.654–33.655s、47.855–52.032s，没有执行重叠。
DefaultToolExecutorDispatcher.dispatch 的 for 循环逐个 await executeCall，
executeCall 又把单个调用传给底层 executor；该路径下模型要求并行仍会串行执行。
这是独立的调度行为，不能直接解释 spinner 卡顿，也不能用本轮宣称完成三路
同时 running 的验收。

当前证据优先支持继续隔离渲染消费者；CPU-only 样本没有测 IPC 延迟趋势、
原生 layout/paint 或长帧，因此尚不足以要求重设计整个 emit 框架。
采样产物保存在本机临时目录：ati-fixed-native.cpuprofile、
ati-fixed-native-metadata.json、ati-fixed-native-analysis.json；未写入仓库。

### Overview 订阅与数字格式化优化及复测

ArtifactsPanel 改为分别订阅 artifactsActiveTab 和 setArtifactsActiveTab。
模块级复用 compact/progress 的 Intl.NumberFormat，语言、选项、返回文案保持不变。
未增加 memo、拆分 store 或修改工具调度。回归测试覆盖 preview-only 更新不提交
ArtifactsPanel、切换 tab 正常响应，以及重复格式化的显示结果。

原聊天、同一固定输入、同一模型与同样聚焦模拟/1ms CPU-only 采样条件下，
再次提交真实请求并等待 run.completed 后 3 秒停止。结果如下：

| 指标 | 优化前 | 优化后 |
| --- | --- | --- |
| 采样时长 | 74.50s | 91.26s |
| CPU 样本数 | 58,439 | 72,202 |
| ChatStatsPanel inclusive | 736.09ms | 17.03ms |
| formatCompactTokenCount inclusive | 268.08ms | 未采到具名执行样本 |
| formatProgressPercent inclusive | 193.87ms | 1.23ms |
| ArtifactsPanel inclusive | 99.54ms | 3.77ms |
| preview.segment.updated | 8,549 | 10,230 |
| preview.updated | 327 | 1,201 |
| message.updated | 15 | 17 |
| 工具执行数量 | 6 | 7 |

目标组件累计采样耗时明显下降，与订阅隔离和 formatter 复用预期一致。
固定输入未固定模型输出、检索结果、额外调用与响应时长；历史也多了一轮，
因此不将累计差值解释为整体性能提升比例，不报告 spinner FPS 收益。
CPU-only 样本继续不提供 layout/paint 或真实长帧归因。
优化后最大的业务调用栈是 StreamingMarkdownLite 顶层回调（约 653ms inclusive），
其嵌套回调约 553ms；这些嵌套数值不能相加。后续若继续排查长帧，应将其与
实际帧时间对应后再决定调整 Markdown/typewriter。

复测产物：本机临时目录中的 ati-stats-after.cpuprofile、
ati-stats-after-metadata.json、ati-stats-comparison.json。
临时采样钩子已恢复，前后保留的 profile 未写入仓库。

本阶段验证：

- `pnpm exec vitest run src/renderer/src/features/artifacts/__tests__/ArtifactsPanel.test.tsx src/renderer/src/features/chat/input/toolbar/__tests__/chatStatsModel.test.ts src/renderer/src/features/chat/input/toolbar/__tests__/ChatStatsPanel.test.tsx`：20 项通过。
- 原全量订阅写法下，新增 preview-only 回归失败；恢复优化后全量 coverage 包含该回归通过。
- `pnpm test:coverage`：328 文件 / 2,211 测试通过，5 文件 / 20 测试跳过。
- `pnpm run typecheck:web`、四个本阶段变更文件的 ESLint（0 errors，既有格式 warnings）、`pnpm run check:renderer-doc-paths`、`git diff --check` 通过。
- Electron 中固定查询完成；恢复采样代码后 Overview 显示 791.7K / 700K、Model window 1M、Trigger at 70%、Tokens 2.1M，Overview→Tools→Overview 切换正常，面板恢复关闭。

本次仅改变订阅与格式化实例复用，不改变视觉规则、跨模块导入、共享契约或调度顺序。
自然前台三工具同时 running 的 spinner 帧率验收仍未完成。

### 流式 Markdown 块级渲染隔离

StreamingMarkdownLite 将各块交给内部 memo 的 StreamingMarkdownBlock。
增量解析保留的 ParsedMarkdownBlock 引用，加上稳定的动画/性能参数，
使稳定前缀跳过行内代码拆分和块内 JSX 构建；变化的尾块仍正常渲染。
block key 保留原来的 type/index 语义，内部没有新增 DOM wrapper。
非 append 文本会重新解析并更新所有需要变更的块；动画窗口、开关、
session/segment/mode 变化继续传到稳定块。未修改解析器、动画频率或完整
Markdown 渲染切换规则。最外层仍遍历 blocks 创建组件元素，未消除这部分 O(n) 工作。

新增组件回归在修改前：20 次尾部追加使稳定前缀的内容组件累计从 4 次增至
84 次；修改后保持 4 次，即该测试场景中的 80 次重复执行被消除。
这些计数来自测试替身，只证明块级隔离，不是实际 CPU 或 FPS 提升比例。
同时覆盖列表/引用追加、非 append 的结构替换、部分代码围栏补全、后续
段落、行内代码以及动画/性能上下文更新。已有 pending/complete 渲染与
reasoning 性能测试继续通过。

验证：

- `pnpm exec vitest run src/renderer/src/features/chat/message/typewriter/__tests__ src/renderer/src/features/chat/message/assistant-message/__tests__/ReasoningSegment.test.tsx`：7 文件 / 45 测试通过。
- `pnpm test:coverage`：329 文件 / 2,215 测试通过，5 文件 / 20 测试跳过。
- `pnpm run typecheck:web` 通过。
- `pnpm exec eslint src/renderer/src/features/chat/message/typewriter/StreamingMarkdownLite.tsx src/renderer/src/features/chat/message/typewriter/__tests__/StreamingMarkdownLite.test.tsx`：0 errors，格式/Prettier warnings 保留；代码使用仓库要求的单引号、无分号风格。
- Electron 实际提交 Markdown 验证请求并等待回答完成，观察到标题、行内代码、列表、引用、TypeScript 代码块和末尾段落正确显示。

此阶段未重新采集 CPU profile 或长帧，不宣称整体卡顿/动画流畅度验收完成。
样式规则与视觉结构保持原实现，欢迎页 LCP、emit 和工具并行调度没有本阶段变更。

### 块级隔离后的 CPU/rAF 与欢迎页启动采样

重新提交同一固定查询，1 个 run.accepted/completed、5 个工具开始/完成、
3,538 个 preview.segment.updated、203 个 preview.updated。
CPU profile 为 38,247.603ms / 28,992 样本；renderer 帧探针为约 38,326.9ms。
两者均在聚焦模拟条件下记录，visibility 全程 visible。

| 帧指标（整段采样） | 结果 |
| --- | --- |
| rAF 间隔样本 | 4,489 |
| rAF 估算平均回调频率 | 117.12/s |
| 中位数 / P95 / P99 间隔 | 8.3 / 9.3 / 9.3ms |
| 最大间隔 | 308.6ms |
| 超过 50ms 的间隔 | 5 |
| Long Task | 1，66ms |

按 run.accepted→run.completed 近似裁剪的 27.601s 中，有 3,239 个帧间隔、
约 117.35/s，3 个超过 50ms；main Date.now 与 renderer performance.now 的
边界对齐为近似值。rAF 频率不是屏幕实际呈现 FPS，也不证明三个 spinner
并行执行场景已经通过。约 315ms 长帧中记录的 React 脚本仅约 27ms，
不能把全部空隙归因于某个 React 组件；其他长帧也包含 React 调度回调。

按文件去除调用栈嵌套重叠后，StreamingMarkdownLite.tsx 累计由上一轮
661.86ms 降至本轮 66.60ms。本轮响应更短、工具调用及 preview 数量更少，
因此不将差值报告为优化百分比，仍需控制输出的回放来单独量化实现收益。
本轮最重业务调用栈为 AssistantMessageContainer 回调约 68.57ms inclusive，
handleChatRunEventSafely 54.40ms、previewPatchBatcher.flush 54.15ms。

欢迎页独立短 trace 在 query 之前停止，共约 29MB；未与 query CPU 采样
同时运行。观察器在 dom-ready 后启动，使用 buffered LCP 记录和 trace 补齐
早期图片事件；没有获得 custom emotion-asset 协议的 Resource Timing entries。
页面 HTML responseStart 119.8ms、DOMContentLoaded 2,151.3ms、load 2,155.7ms。
trace 记录 864 个 Script 请求，这是 Vite 开发环境，不代表生产启动性能。
最终 LCP 为 2,980ms 的副标题 P；原截图表情图片作为最终 LCP 的条件未复现。

| 表情资源 | 发起时刻（约） | 完整资源加载 | 大小 | 加载完成→PaintImage 命令 |
| --- | --- | --- | --- | --- |
| happiness/4 | 2,240.57ms | 7.056ms | 790,012 bytes | 9.735ms |
| neutral/9 | 2,267.87ms | 4.362ms | 707,964 bytes | 11.200ms |

上表时刻以最终 LCP 的 trace timestamp/renderTime 对齐 navigation origin，
存在毫秒级近似；PaintImage 表示记录绘制命令，不是最终呈现到屏幕。
紧邻两次图片绘制的初次 WebP Decode Image 耗时约 1.246/1.472ms，
这是时间相关的归因，没有 trace 中 URL→decode 的直接关联。
短 trace 共 46 次 Decode Image，累计 85.29ms，包含动画后续帧，
不能当成首帧解码时间。源素材确认两张都是 512×512、45 帧、2,970ms 的
动画 WebP；URL 强度分别映射到 happiness/2.webp 和 neutral/2.webp。

本轮把加载和解码成本与等待区分开：图片很晚才被请求，随后加载/初次解码
较短，实际 image presentation 时刻未单独取得，不能完整重建原截图图片 LCP。
建议优先在生产构建检查启动模块/配置初始化与首次资源发现；避免默认表情
和当前表情连续加载，并按欢迎页实际尺寸与 DPR 提供合适分辨率素材；
如考虑静态首帧后启动动画，应作为视觉行为决策验证，不默认改变现有动画。
给图片加 preload/fetchpriority 或继续压缩并不能单独消除目前观察到的
约 2s 页面准备时间。LCP 拆分参考 [web.dev](https://web.dev/articles/optimize-lcp)。

产物保留在本机临时目录：ati-blocks-after.cpuprofile、
ati-blocks-after-frames.json、ati-blocks-performance-analysis.json、
ati-welcome-startup-trace.json、ati-welcome-startup-analysis.json。
临时 main-window 采样代码已按原文件恢复，未新增业务实现或 LCP 视觉修改。

### 欢迎页表情首次加载顺序

`useWelcomeEmotionState` 初始返回 `undefined`，挂载后读取一次持久化状态。
读取期间 EmotionBadge 保留现有容器，不挂载图片或 emoji；得到有效 current
表情后直接挂载对应图片。没有状态、标签无效或读取失败时，才选择默认
`happiness/4`。图片本身加载失败时继续使用原来的 emoji 降级行为。
这里的“默认表情”是固定回退值，不会请求模型生成表情。

该调整消除持久化表情不同于默认值时的默认图片先行加载；不改变素材、
动画或图片协议缓存，也不宣称解决欢迎页初始化等待或取得 LCP 收益。
组件回归覆盖读取中没有图片、有状态直接挂载对应图片、无状态才挂载
默认图片，并验证每次挂载读取一次。旧 hook 下这三项回归失败，恢复后通过。
