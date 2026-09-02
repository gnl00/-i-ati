# Chat Message 与 MessageScroller 接入实施指导

Owner: Chat renderer maintainers<br>
Status: Implemented (automated gates complete; Electron manual validation pending)<br>
Started: 2026-09-02<br>
Completed: 2026-09-02<br>
Target: 使用 shadcn/ui Message 统一无头像消息行结构，并由 MessageScroller 统一承担 Chat transcript 的打开位置、回合锚定、流式跟随、历史位置保持、消息跳转和跳回最新<br>
Exit criteria: React 运行时版本完成对齐；Message 与 MessageScroller 接入生产 Chat；旧 TanStack Virtual 滚动控制器退出；文档、聚焦测试、renderer 边界检查、构建和 Electron 实际滚动验收完成<br>
Related design: [`DESIGN.md`](../../../../DESIGN.md)<br>
Related architecture: [Renderer architecture](../../../architecture/renderer-architecture.md)<br>
Supersedes: [ChatWindow 滚动与虚拟列表优化方案](../../../archive/2026/chat/chat-window-next-scroll-virtual-list-optimization-plan.md)<br>
External reference: [Message](https://ui.shadcn.com/docs/components/base/message)、[MessageScroller](https://ui.shadcn.com/docs/components/base/message-scroller)

## 背景与结论

当前 Chat 由 `ChatWindow.tsx`、TanStack Virtual、`useScrollManagerTop.ts` 和
`scroll-anchor.ts` 共同维护滚动行为。现有实现覆盖三类模式：
`tail-follow`、`anchor-lock`、`manual`，并额外维护动态 bottom spacer、
ResizeObserver 校正、用户滚动意图、search hint、jump-to-latest transaction 和
虚拟行测量。

shadcn/ui MessageScroller 已提供相同产品语义：

- `defaultScrollPosition` 控制首次打开位置；
- `scrollAnchor` 把新回合固定到阅读起点；
- `autoScroll` 在 live edge 跟随流式增长；
- 用户滚动自动释放 following；
- `preserveScrollOnPrepend` 保持历史插入前的可见位置；
- `scrollToMessage`、`scrollToStart`、`scrollToEnd` 提供命令式导航；
- `MessageScrollerButton` 管理跳回最新的可见性和交互；
- `scrollMargin` 与 `scrollPreviousItemPeek` 控制顶部遮挡和上一轮上下文。

本次改造采用完整 MessageScroller item 模型。每个可见 transcript row 保持为真实
`MessageScrollerItem`，MessageScroller 成为唯一滚动所有者，TanStack Virtual 与旧
滚动控制器在同一阶段退出生产路径。

实施结果：React runtime 已固定为 `19.2.3`，接入 `@shadcn/react@0.3.0` 的本地
Message/MessageScroller wrappers，provider 以 chat UUID 隔离，scroll hint、latest
anchor、搜索跳转校正和 jump button 均集中在 `ChatTranscriptScroller`。上游包通过
`patches/@shadcn__react@0.3.0.patch` 修复首次内容挂载时 anchor registry 尚未建立的
时序问题，补丁注释关联 shadcn/ui issue #11128。

## 目标结构

```text
ChatWindow
└── MessageScrollerProvider key={chatUuid} autoScroll
    └── MessageScroller
        ├── MessageScrollerViewport
        │   └── MessageScrollerContent
        │       ├── MessageScrollerItem messageId scrollAnchor
        │       │   └── Message align="end"
        │       │       └── MessageContent → UserMessage
        │       ├── MessageScrollerItem messageId
        │       │   └── Message align="start"
        │       │       └── MessageContent → AssistantMessage
        │       └── MessageScrollerItem → pending assistant / marker
        └── MessageScrollerButton direction="end"
```

Provider 下方使用一个聚合型 `ChatTranscriptScroller` 组件。该组件读取
`useMessageScroller()`，消费 `scrollHint`，渲染 viewport、content、items 和按钮。
滚动命令、row identity 与顶部遮挡参数集中在该边界，避免再次把控制逻辑拆散到多个
hook。

## 视觉与组件边界

视觉方向继续遵循 `DESIGN.md` 的 Calm / Capable / Technical / Warm 桌面工作台：

- 单一 CSS 策略保持 Tailwind CSS v4 utility 与现有 `--chat-*` 语义 token；
- Message 省略 `MessageAvatar`；
- 首次接入使用 `Message` 与 `MessageContent`，现有 UserMessage 和
  AssistantMessage 继续拥有正文、Markdown、Reasoning、工具调用和操作区；
- `MessageGroup`、`Bubble`、Attachment 和 Marker 扩展留给各自真实需求；
- jump-to-latest 使用现有视觉密度和语义 token，保持真实 `<button>`、`aria-label`、
  focus-visible 与 reduced-motion；
- hover 和 press 只使用颜色、opacity、shadow 与小幅 scale，避免布局属性动画和
  `transition-all`；
- 全局 scrollbar 外观继续由 `main.css` 管理，Viewport 只声明 overflow、overscroll、
  gutter 和滚动语义。

## 依赖决策

### React 对齐

`@shadcn/react@0.3.0` 的 peer dependency 要求 React 19。项目已经使用
`@types/react@19.2.9` 和 `@types/react-dom@19.2.3`，运行时仍为 React 18.3.1。

实施时执行以下对齐：

```text
react      -> 19.2.3
react-dom  -> 19.2.3
@shadcn/react -> 0.3.0
```

使用精确版本，避免核心滚动行为随 semver 范围漂移。依赖安装后检查 lockfile 中
renderer 依赖只解析一套 React/ReactDOM 19.2.3。

### Registry 组件

通过项目现有 shadcn 配置添加 `message` 与 `message-scroller`。安装后逐行审查生成内容：

- imports 使用 `@renderer/shared/*` aliases；
- Button 复用 `src/renderer/src/shared/components/ui/button.tsx`；
- Tailwind class 符合 v4 语法；
- scrollbar class 与项目全局 scrollbar 规则协调；
- registry 默认颜色替换为现有语义 token；
- `MessageScrollerItem` 保留 `content-visibility` 优化，同时允许当前回合和显式跳转目标
  使用真实布局尺寸。

## 场景合同

| 场景 | 实施合同 |
| --- | --- |
| Welcome 退出后首次挂载 transcript | Provider 按当前 `chatUuid` 建立，Viewport 挂载后应用 `defaultScrollPosition="end"` |
| 普通切换对话 | Provider 通过 `key={chatUuid}` 重建，历史加载完成后定位到 end |
| 用户发送消息 | 新 user item 设置 `scrollAnchor=true`，使用 `scrollMargin={topOcclusionPx}` 定位到可读区域顶部 |
| 短 user + pending assistant | Provider 的 tail spacer 保留可供回复向下生长的空间 |
| assistant 流式输出 | `autoScroll` 只在 following live edge 时生效；锚定回合先占据当前阅读区域，内容填满后进入 live edge following |
| 用户向上浏览 | wheel、pointer、touch 和键盘滚动释放 following，后续 token 在视口外增长 |
| 用户点击跳回最新 | `MessageScrollerButton` 调用 end scroll 并重新进入 following |
| 用户手动滚回底部 | Button 依据 scroller 的 end 状态自动收起 |
| 搜索结果跳转 | `scrollToMessage(String(messageId), { align: 'start', behavior: 'auto' })`，目标遵守动态 `scrollMargin` |
| 打开长内容、图片、KaTeX 或工具结果 | ResizeObserver 驱动 scroller 重新计算；当前阅读位置遵循 provider mode |
| pending assistant 转 committed assistant | row 具备稳定 React key；MessageScrollerItem 的真实 `messageId` 在 committed 后更新 |
| 历史 prepend | `preserveScrollOnPrepend=true`，稳定 `messageId` 保持当前可见行 |
| 计划栏高度变化 | `topOverlayHeight` 继续测量并映射为 Provider `scrollMargin`，计划栏保持 transcript 外层覆盖结构 |

普通打开保持 end 语义。`last-anchor` 作为后续产品选择保留在 Provider API 中，本次生产默认值固定为 `end`。

## 上游缺陷与防护

`@shadcn/react@0.3.0` 是新组件，实施必须覆盖以下已公开回归：

1. mount-time anchors 在等量 row 替换后被识别为新 anchor；
2. anchored streaming turn 在用户滚动后出现 tail spacer 异常；
3. `content-visibility` 历史行让长列表 `scrollToMessage` 产生落点偏差；
4. 嵌套代码块或工具结果的 wheel 事件释放 live-edge following；
5. iframe portal 的跨 realm element 判断。本应用 transcript 位于顶层 Electron document，
   该场景作为依赖升级回归记录。

采用以下本地防护：

- Provider 按 `chatUuid` 重建，隔离不同对话的 anchor bookkeeping；
- row 使用稳定 key，pending 到 committed 的更新保持同一 transcript row identity；
- 当前 user anchor、当前 assistant、pending assistant 和显式搜索目标覆盖为
  `content-visibility: visible`；历史行继续使用 registry 默认优化；
- 搜索跳转先调用 `scrollToMessage` 释放 following，再在下一 layout frame 对目标执行
  `scrollIntoView({ block: 'start', behavior: 'auto' })` 进行真实布局校正；目标 item 使用
  `scroll-margin-block-start: topOcclusionPx`；
- 为 mount-time anchor bookkeeping 添加最小 `pnpm patch`，固定在
  `@shadcn/react@0.3.0`，patch 注释引用对应上游 issue；
- patch 只修复初始化时登记现有 anchors 的缺口。滚动策略与 registry wrapper 保持上游
  API，便于后续版本删除 patch。

## 实施阶段

### 阶段一：React 运行时对齐

1. 将 `react`、`react-dom` 固定为 `19.2.3`。
2. 更新 lockfile，并确认单一运行时版本。
3. 运行 renderer typecheck、现有 renderer 架构测试和 Electron build。
4. 记录 React 19 引出的测试环境、act、ref callback 或第三方 peer 问题并在本阶段修复。

该阶段独立可合并，价值是消除 React 19 types 与 React 18 runtime 的版本错位。

### 阶段二：无头像 Message 行结构

1. 添加共享 `message.tsx`。
2. `ChatMessageComponent` 对普通 user/assistant row 使用 `Message`：user 为 `align="end"`，
   assistant 为 `align="start"`。
3. 省略 Avatar slot，使用 `MessageContent className="w-full"` 保留现有 transcript column。
4. schedule/Telegram marker 保持独立 transcript row；Telegram assistant 消息主体继续使用
   Message。
5. 更新 UserMessage、AssistantMessage 渲染测试，锁定无头像、角色对齐和 footer 操作。

该阶段保留现有滚动实现并独立可合并。

### 阶段三：MessageScroller 完整切换

1. 添加 `@shadcn/react@0.3.0`、共享 `message-scroller.tsx` 与最小 pnpm patch。
2. 新增或提取 `ChatTranscriptScroller`，集中 Provider、hooks、Viewport、Content、Item、
   Button 和 scroll hint 消费。
3. 每条可见消息使用字符串 `messageId`；pending row 使用 chat-scoped 稳定 id。
4. 普通 user row 设置 `scrollAnchor`；pending/assistant/schedule marker 保持普通 item。
5. search-result hint 映射为 `scrollToMessage`；conversation-switch 由 keyed Provider +
   `defaultScrollPosition="end"` 处理；user-sent 由新增 anchor 处理。
6. 清除已消费的 scroll hint，保留 store 作为 ChatSheet、send lifecycle 与 transcript 之间的
   解耦事件合同。
7. 使用 `MessageScrollerButton` 取代现有绝对定位 `<div id="jumpToLatest">`。
8. 删除 Chat 生产路径中的 `useVirtualizer`、virtual row measurement、dynamic bottom spacer、
   `tail-follow / anchor-lock / manual` state、scroll suppression、jump transaction、
   `useScrollManagerTop` 和只服务旧实现的 `scroll-anchor.ts` helpers。
9. 删除空 export、失效测试和未使用的 `@tanstack/react-virtual` 依赖；在全仓确认没有其他
   生产消费者后再移除 package dependency。
10. 更新 renderer architecture，说明 MessageScroller 是 transcript 滚动所有者；完成后将
    superseded 旧计划移动到 `docs/archive/2026/chat/`。

该阶段完成后只保留 MessageScroller 一套滚动写入者。

## 文件范围

预计主要触达：

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml` 或 pnpm patch 配置位置
- `patches/@shadcn__react@0.3.0.patch`
- `src/renderer/src/shared/components/ui/message.tsx`
- `src/renderer/src/shared/components/ui/message-scroller.tsx`
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
- `src/renderer/src/features/chat/shell/ChatTranscriptScroller.tsx`
- `src/renderer/src/features/chat/message/ChatMessageComponent.tsx`
- `src/renderer/src/features/chat/shell/ChatTranscriptScroller.tsx`
- `src/renderer/src/features/chat/shell/__tests__/ChatWindow.message-scroller.test.tsx`
- `src/renderer/src/features/chat/message/**/__tests__`
- `docs/architecture/renderer-architecture.md`
- 本指导文档与 superseded 旧计划

工作区当前包含其他功能 WIP。实施过程只编辑上述接入范围，遇到已修改文件时逐 hunks
保留用户现有内容，禁止批量格式化或覆盖无关改动。

## 自动化验收

### 组件与合同测试

1. Message user row：`align=end`，无 avatar slot，现有内容与操作可达。
2. Message assistant row：`align=start`，Header/Body/Footer 内容保持。
3. schedule、Telegram、pending assistant 拥有稳定 row identity。
4. 每条可定位 row 使用稳定字符串 `messageId`。
5. 新 user row 设置 `scrollAnchor`，assistant 与 pending row 保持普通 item。
6. Provider 使用 `autoScroll`、`defaultScrollPosition="end"`、动态 `scrollMargin`。
7. search-result 调用 `scrollToMessage` 并完成一次真实布局校正。
8. scroll hint 只消费一次，并在 Welcome 延迟挂载后继续生效。
9. jump button 由 `MessageScrollerButton` 的 active state 控制。

### 上游回归 fixtures

1. 20 轮初始历史 + pending row 等量替换 committed assistant，视口保持当前回合。
2. 新 user anchor + 短 pending assistant，user row 位于 top occlusion 下方。
3. assistant 流式增长未填满 viewport，anchor 保持；填满后进入 following。
4. 流式期间用户向上滚动，后续 token 继续增长且视口保持阅读位置。
5. 用户点击 jump-to-latest 后恢复 following。
6. 150 条不等高历史，搜索跳转目标落在 `scrollMargin` 允许误差 1px 内。
7. 嵌套代码输出横向滚动与纵向 transcript 滚动分别验证。
8. Chat A 与 Chat B 等量消息列表切换，Provider state 互相隔离。

### 性能 fixture

构造 1000 条混合 transcript rows：

- 普通 user/assistant Markdown；
- 代码块、GFM table、KaTeX；
- Reasoning disclosure；
- completed work 与 tool result；
- 当前 assistant 流式更新。

验收目标：

- 打开后直接呈现 end，无旧消息顶部闪烁；
- 交互滚动过程中无持续长任务和重复整表 React rerender；
- 当前流式 row 的更新保持输入与滚动响应；
- 历史 row 的 `content-visibility` 生效；
- Electron 实际窗口持续滚动无抖动、位置回弹或底部锁死。

性能门槛在真实 Electron 窗口失败时，阶段三保持未完成状态并回滚 MessageScroller
生产切换。性能问题进入有界的消息分页设计，避免保留两套生产滚动控制器。

## 验证命令

根据实际文件名调整 focused Vitest 路径，同时保留以下 gate：

```bash
pnpm run typecheck:web
pnpm run check:renderer-boundaries
pnpm run check:renderer-doc-paths
pnpm run test:renderer-architecture
pnpm exec vitest run \
  src/renderer/src/features/chat/shell/__tests__/ChatWindow.message-scroller.test.tsx \
  src/renderer/src/features/chat/message/__tests__/ChatMessageComponent.test.tsx \
  src/renderer/src/features/chat/shell/__tests__/ChatTranscriptScroller.test.ts
pnpm exec electron-vite build
git diff --check
```

React 19 与 dependency cutover 完成后运行 `pnpm test:run`。若仓库基线测试量或环境导致
全量命令受阻，交付记录必须提供 focused 结果、失败原文、基线归因和未完成的真实验证。

本次实施记录：

- `pnpm_config_verify_deps_before_run=false pnpm run typecheck:web` 通过。
- `pnpm run check:renderer-boundaries`、`pnpm run check:renderer-doc-paths` 和
  `pnpm run test:renderer-architecture` 通过。
- focused MessageScroller/Message 测试 8 项通过。
- `electron-vite build` 通过。
- `git diff --check` 通过。
- `pnpm test:run`（等价直接执行 `vitest run`）完成 285 个测试文件，1761 项通过，
  13 项跳过，1 项失败：既有 `assistantMessageRenderModel.test.ts` 的 support-window
  presentation 断言；本次改动未触及该 model 或其 fixture。
- Node typecheck 仍有既有 `webToolsUnits.test.ts:352` 的可选字段诊断；web typecheck
  已单独通过。

## Electron 手工验收

Light 与 Dark Mode 各执行一次：

1. 从 Welcome 打开包含长历史的对话，首帧直接落在最新消息。
2. 发送短消息，确认 user row 位于顶部计划栏下方，上一轮保留少量上下文。
3. 观察短回复、超长回复、Markdown、代码块和工具结果流式增长。
4. 流式期间向上滚动，确认视口保持；点击跳回最新，确认恢复 following。
5. 使用滚轮、触控板、拖动 scrollbar、PageUp/PageDown、Home/End。
6. 在代码块和长 Parameters/Results 内滚动，确认嵌套容器与 transcript 行为清晰。
7. 搜索并跳转到首段、中段、末段消息，确认落点避开顶部计划栏。
8. 快速切换两段等量历史的对话，确认各自打开位置稳定。
9. 展开/收起 Reasoning、tool call、completed work，确认当前阅读位置稳定。
10. 调整 side panel 和主窗口宽度，确认 Markdown reflow 期间视口稳定。

## 文档完成动作

实现完成后：

1. 将本文件 Status 更新为 `Implemented`，记录完成日期、最终依赖版本、patch 原因和验证结果。
2. 更新 renderer architecture 的 Chat ownership 描述。
3. 将旧虚拟列表计划移动到 `docs/archive/2026/chat/` 并标记 superseded。
4. `DESIGN.md` 只在共享视觉规则、semantic token 或 scrollbar 规则发生变化时更新；结构替换
   继续沿用现有视觉规范。

## 回滚

本次改造没有数据库、IPC、消息 schema 和持久化迁移。回滚只涉及 renderer 与依赖：

1. 恢复旧 ChatWindow virtualizer、scroll policy、scroll manager 和 jump button。
2. 移除 MessageScroller registry wrapper、`@shadcn/react` 与 pnpm patch。
3. Message 行壳层可以独立保留。
4. React 19 阶段可以独立保留；若发现应用级兼容问题，再单独恢复 React 18 runtime。
5. 恢复 renderer architecture 与计划状态，保留失败 fixture 作为后续依赖升级依据。
