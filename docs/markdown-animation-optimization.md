# Markdown 动画优化纪要（Streaming / Typewriter）

本文记录一次从「禁用 markdown 动画」到「恢复动画并解决抖动/位移」的优化过程，目标是让流式输出在保持 Markdown 渲染的同时拥有更轻量、更稳定的动效。

## 背景与目标

- 现状：部分动画由 `framer-motion` 实现，Streaming 场景下性能/一致性不佳；后续曾禁用 markdown 动画。
- 目标：
  - 恢复 markdown 的动画表现。
  - 替换 `framer-motion` 为 CSS `transition`（组合动效：Blur + Opacity + TranslateY）。
  - Streaming 下尽量避免抖动（jitter）与“排版位移”（layout shift）。

## 关键结论（为什么会抖/会位移）

### 1) “切换渲染模式”是抖动的主要来源

当 Streaming 期间使用 Token 级渲染（大量 `<span>`）并在结束时切到完整 `ReactMarkdown`（大量块级元素如 `<p>/<ul>/<pre>`），会发生：

- DOM 结构变化：`<span>` 流 → 块级结构。
- 盒模型变化：`prose-p:mt/mb`、`line-height`、`whitespace` 等规则只对 `<p>` 等生效。
- 结果：结束瞬间出现 reflow / “掉半行”级别位移；crossfade/锁高也只能缓解，难以彻底消除。

### 2) 容器级动画的“触发时机”很关键

流式文本更新频繁时，如果动画触发逻辑被 throttle 或在 paint 之后才重置起始态，会出现：

- 只在开始几次（甚至仅第一次）看到 blur/位移
- 后续增量更新看起来“无动画”

因此需要确保每次更新都能触发一次可见的过渡（并避免不当节流）。

## 最终策略（当前落地）

### A) 默认：Streaming 直接渲染 Markdown（最稳定、最丝滑）

实践证明：在当前项目里“Streaming 时照样渲染 markdown（不降配）”是最顺滑的路径，且不会引入“切换导致的抖动/位移”。

- 渲染入口：`src/renderer/src/components/chat/chatMessage/assistant-message.tsx`
- 调试开关：
  - `window.__STREAMING_TEXT_RENDER_MODE = 'markdown'`（默认）
  - `window.__STREAMING_TEXT_RENDER_MODE = 'switch'`（对比用）

### B) 可选：Switch 模式升级为“块级固化（Solidify）”

为了在仍需 typewriter/token 动效时尽量避免位移，`switch` 模式不再做“整段 typewriter → 整段 markdown”的切换，而是：

- 将“已完成的块”提前用 Markdown 固化渲染（段落空行边界、已闭合的 fenced code block）
- 仅对最后未完成块应用 typewriter

这样切换发生在“块完成”边界上，且只影响尾部区域，大幅减轻 reflow/位移。

- 实现：`src/renderer/src/components/chat/chatMessage/StreamingMarkdownSwitch.tsx`

## 动画实现（从 framer-motion 到 CSS transition）

### 1) Token 动效：`FluidTypewriterText` 去掉 framer-motion

- 原：`framer-motion` 的 `motion.span`
- 现：纯 CSS `transition` + `useEnterTransition` 触发（Blur + Opacity + TranslateY）
- 文件：`src/renderer/src/components/chat/chatMessage/FluidTypewriterText.tsx`

### 2) Markdown 容器动效：CSS transition（Blur + TranslateY + Opacity）

Markdown 直接渲染时（`ReactMarkdown`）的入场/更新动效由容器 class 控制。

- 文件：`src/renderer/src/components/chat/chatMessage/assistant-message.tsx`

### 3) 动画触发 Hook：`useEnterTransition`

通过 `requestAnimationFrame` 将状态从“起始态”切到“结束态”，触发 CSS transition。

- 文件：`src/renderer/src/components/chat/chatMessage/use-enter-transition.ts`

## 验证与排障

### 1) 观察模式差异

- `markdown`：无切换，最稳。
- `switch`：可保留尾部 token 动效，但若不做“块级固化”，必然更容易位移。

### 2) “只在第一个 token 有动画”的常见原因

- 触发逻辑被 throttle 跳过，后续更新没有回到起始态
- 或者更新发生在 paint 之后导致过渡不可见

## 后续可选优化（未默认开启）

如果未来遇到复杂内容（`rehypeRaw` / Katex / 代码高亮）导致 Streaming 卡顿：

- Streaming 期间先不启用最重的部分（延迟 `rehypeRaw/rehypeKatex/代码高亮`）
- 在 `isTyping=false`（完成）后再一次性启用完整渲染

