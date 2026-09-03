# ChatWindow 内容层入场动画实施指南

状态：实现完成，自动化验证通过；实窗逐帧与完整交互矩阵待补

日期：2026-09-02
前置：[历史聊天首屏优化](chat-history-first-paint-optimization.md)

## 1. 目标与范围

历史聊天保持首帧可读，由 ChatWindow 正文外层统一执行一次 180ms 透明度入场，缓和聊天切换的生硬感。保留此前的历史正文直出、按需挂载、选择版本校验和 Welcome 新提交过渡。

| Before | After | Why |
| --- | --- | --- |
| 正文加载完成后直接切换 | 正文表面 opacity 0.6 → 1 | 内容即时可读，视觉变化更柔和 |
| 历史消息独立保持最终可见状态 | 消息状态保持原样，ChatWindow 编排整区动画 | 动画数量固定为一个 |
| Header、composer、Artifacts 各自承担交互 | 这三个区域及任务浮层维持现有呈现 | 保持操作焦点与视觉锚点 |

本次范围仅含 Renderer 展示和聚焦测试。数据库、IPC、依赖、调试开关、MessageScroller 注册及滚动算法保持原状；本轮交付为工作区修改，git 提交另行执行。

## 2. 动画契约

- 对象：ChatWindow 中包裹 ChatTranscriptScroller 的单一可视容器；使用维持原尺寸的 `h-full min-h-0` 等必要布局类。
- 关键帧：`[{ opacity: 0.6 }, { opacity: 1 }]`。
- 时长：180ms；曲线：`cubic-bezier(0.22, 1, 0.36, 1)`；delay 为 0；执行一次。
- 采用原生 `Element.animate()`。浏览器承载动画播放，React 负责成功选择事件和生命周期。
- 常态 opacity 为 1；无动画 API、减少动态效果、失败或取消时，内容直接保持常态。
- transform、scale、filter、尺寸、边距及继承 CSS 变量均保持常值。动画期间内容可交互。
- 维持已有组件 key、消息 identity、provider identity 与挂载时机。动画使用稳定容器 ref，完整 transcript 与 Markdown 无额外复制。
- 加载和渲染照常执行；动画完成与否独立于 hydration、scroll hint 和正文挂载。Welcome 的 220ms fresh-submission 生命周期保持原契约。

## 3. 触发与失效

动画只对应一次真实、成功、由指针发起的历史聊天选择。ChatSheet 是已有异步选择流程入口，需在该流程成功提交并校验当前目标后发布最小展示请求。

1. 在首个 await 前捕获 `event.detail > 0`，作为指针入口资格；`detail === 0` 的键盘/辅助技术/程序触发使用即时显示。保留稳定 callback。
2. 复用已有 requestId + coordinator selectionEpoch 校验；hydrate 完成、目标 ID/UUID 匹配后发布请求，搜索结果的已有 scroll hint 流程继续执行。
3. 请求放入现有 sheetStore，使用 `{ chatUuid, selectionEpoch }` transient 对象。每次成功选择创建新对象，以对象身份区分同一 epoch 内的多次选择；选择 authority 保持在现有 coordinator。
4. ChatWindow 仅在请求匹配当前目标、loading 结束、正文容器已挂载时执行。首次 Welcome → 历史、历史 A → B、从其他聊天进入搜索结果均适用。
5. 同一聊天点击/同聊天搜索、失败、过期请求、New Chat、workspace/reset、后台 ready-chat、fresh submit 使用原有即时显示或各自已有动效。
6. 流式追加、preview 更新、历史补载、工具展开、任务变化和尺寸变化均保持本次动画的原生命周期，完成后维持常态。
7. 新选择开始、目标改变、reset、unmount 时取消旧动画并使旧展示请求失效；连续快速选择以最新目标为准，最多一个有效动画。
8. `prefers-reduced-motion: reduce` 跳过动画；播放期间切换为 reduce 立即取消。恢复普通偏好时保持当前内容，下一次合法选择再播放。
9. React StrictMode 清理/重建可安全重放 setup，但同一时刻最多一个有效动画；普通 rerender 保持动画实例，旧请求在组件重新挂载后保持已消费状态。

滚动 hint 是滚动控制器的协议，保持其消费机制；展示请求拥有独立且很小的生命周期。避免使用 messages 数组、消息数量或已消费 scroll hint 作为重复动画的触发器。

## 4. 文件与分工

一个 `gpt-5.6-luna` / `max` subagent 负责：

- `src/renderer/src/features/chat/state/sheetStore.ts`：最小展示请求契约。
- `src/renderer/src/features/chat/shell/ChatSheet.tsx`：成功选择时发布请求，取消/键盘路径处理。
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`：稳定正文容器与动画接入。
- 必要时增加一个 chat shell 局部 hook，控制 WAAPI 与清理；保持职责单一。
- 最近的 `__tests__`：事件资格、成功提交、动画参数、生命周期及回归。

主 agent 负责本文、DESIGN.md、renderer architecture 和索引同步，独立检查 source diff、运行验证、真实 Electron 验收。双方保留前一轮尚未提交的全部修改。实现 agent 先阅读 AGENTS.md、DESIGN.md、Tailwind v4 规则、前置指南及直接 callers；全部编辑使用 apply_patch。

## 5. 自动化验收

新增测试至少证明：

- 指针成功选择只发布一次请求；键盘、同聊天、失败、stale selection 和外部 reset 均正确处理。
- 动画只作用于一个正文外层；准确验证 0.6 → 1、180ms、曲线及无 delay/transform/filter。
- 正文在动画开始前已挂载；动画期间和结束后保持同一 DOM/组件实例与滚动位置。
- streaming、消息增长、工具展开等普通 rerender 保持一次播放；A → B → A 可分别播放。
- 快速切换与 unmount 取消旧 Animation；StrictMode、缺失 WAAPI 和 reduced-motion（包含运行时偏好变化）行为正确。
- Header/composer/Artifacts 保持动画目标外；历史 opacity、按需挂载、loading authority、Welcome 过渡既有测试继续通过。

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run src/renderer/src/features/chat/shell/__tests__ src/renderer/src/features/chat/title/__tests__ src/renderer/src/features/chat/state/__tests__
pnpm_config_verify_deps_before_run=false pnpm run typecheck:web
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-boundaries
pnpm_config_verify_deps_before_run=false pnpm run check:renderer-doc-paths
pnpm_config_verify_deps_before_run=false pnpm run test:renderer-architecture
pnpm_config_verify_deps_before_run=false pnpm exec vitest run --silent --reporter=dot
git diff --check
```

生产打包在隔离副本运行 `pnpm exec electron-vite build`，保持正在运行的 dev 输出原状。完整 build 的既有 Main 类型检查问题另行记录。测试计数以本轮实际结果为准。

## 6. 实窗验收与交付

在当前 Electron dev 窗口检查：首次历史选择、A/B 切换、快速切换、搜索目标、上翻补载、回到底部；确认正文一次淡入，Header/composer/Artifacts 稳定。核对 Light/Dark 和 reduced-motion，保留用户调试开关设置。避免发送真实 provider 请求；实时流式路径使用自动化回归，验收缺口明确列出。

如采集临时探针，仅记录动画目标、参数、数量、耗时和 DOM 身份；聊天正文、凭据与会话日志不写入仓库。完成后清理探针并恢复用户原聊天和主题。交付时记录已通过检查和剩余真实环境验收项。

## 7. 完成记录

### 实现与主审

- 一个 `gpt-5.6-luna` / `max` subagent 完成 3 个生产文件与 2 个聚焦测试文件；主 agent 完成独立检查、补强断言和验证。
- ChatSheet 在首个 await 前读取 `event.detail`，成功 hydrate 且目标与 epoch 匹配、存在正文时发布请求。新选择、同聊天、新聊天及组件清理消费旧请求。
- ChatWindow 使用稳定的 `chat-transcript-entrance-surface` 容器与单个原生 Animation 句柄。展示请求开始播放后即消费，后续消息更新维持当前实例。
- 主审修正了同 epoch 的 A → B → A 去重、旧 Animation 的 finish 回调身份检查、空聊天请求失效；补强了键盘成功 hydration 与动画期间 DOM/scroll/外围节点稳定性断言。
- 组件清理使用 microtask 生命周期校验，兼容 StrictMode 的模拟卸载；目标/epoch 改变、再次加载与 reduced-motion 切换立即取消现有动画。
- 实现沿用原生 API 和现有 sheetStore，符合本轮 ponytail 与 emil-design-eng 对单层、短时、可取消动效的要求。消息组件、滚动器、依赖和调试开关均保持本轮开始时的版本。

### 自动化结果（2026-09-02）

| 检查 | 结果 |
| --- | --- |
| ChatWindow / ChatSheet 聚焦测试 | 2 文件，29 项通过 |
| shell / title / state 聚焦回归 | 14 文件，116 项通过 |
| 全量 Vitest | 296 文件通过、3 文件跳过；1848 项通过、13 项跳过 |
| `pnpm run typecheck:web` | 通过 |
| `pnpm run check:renderer-boundaries` | 通过 |
| `pnpm run check:renderer-doc-paths` | 通过 |
| `pnpm run test:renderer-architecture` | 5 项通过 |
| 隔离副本 `pnpm exec electron-vite build` | main / preload / renderer 均通过，保留既有 chunk 提示 |
| `git diff --check` | 通过 |

上述 pnpm 命令均使用 `pnpm_config_verify_deps_before_run=false`。隔离副本额外执行回归有效性检查：换回本轮开始前的 3 个生产文件，入场用例以“预期 animate 调用 1 次，实际 0 次”失败；恢复最终实现后 29 项聚焦测试通过。

`pnpm run typecheck:node` 仍在 `src/main/tools/webTools/__tests__/webToolsUnits.test.ts:352` 报 TS18048（`engine` possibly undefined）。这是本轮开始前已存在的错误，完整 `pnpm build` 仍受此门禁阻挡。

### 实窗证据与验收边界

- 当前 Electron dev 实例已通过原生 UI 检查：刷新后 Welcome 正常显示、聊天列表可展开、短历史聊天及切回原聊天的正文与 Header/composer 正常呈现。
- DevTools 自动化输入多次出现 clipboard timeout，动画探针未取得可重复的逐帧记录。本轮自动化测试证明参数与生命周期；真实 180ms 播放、掉帧、完整 A/B/搜索/上翻路径及 Dark/reduced-motion 矩阵保留为实窗验收项。
- Renderer 刷新清除了临时页面探针；已恢复用户原聊天、保持 Light 与原调试设置，并关闭 DevTools。验收未发送真实 provider 请求，流式路径由回归测试覆盖。
- 以上为 2026-09-02 实现交付记录。2026-09-03 阶段提交同时收录首屏优化、入场动画和 Renderer 文档标题 `@i`；提交前修复了同 identity 的 `CHAT_READY` 误使 pending selection 失效的问题，详见[首屏指南修复记录](chat-history-first-paint-optimization.md#2026-09-03-checkpoint-correction)。远端发布保持独立操作。
