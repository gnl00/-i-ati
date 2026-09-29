# 等待输出状态动画

Last verified against source: 2026-09-29.

当前等待提示由输入区顶部的 shuttle 光条承担。
[SharedPromptSurface](../../src/renderer/src/features/chat/input/SharedPromptSurface.tsx)
在 `runPhase` 为 `submitting` 或 `streaming` 时显示光条，其余阶段隐藏。
正文区已移除旧 LoadingDots 等待组件。

## 实际规格

规格来自 [SharedPromptSurface.css](../../src/renderer/src/features/chat/input/SharedPromptSurface.css)。

| 属性 | 当前值 |
| --- | --- |
| 位置 | 输入 surface 顶部，绝对定位，不增加消息区高度 |
| 高度 | 2px |
| 宽度 | 容器的 40% |
| 颜色 | 透明 → `rgb(59 130 246 / 0.6)` → 透明 |
| 位移 | `translateX(-100%)` → `translateX(350%)` |
| 周期与曲线 | 1.5s，`ease-in-out`，循环 |
| 显隐过渡 | 150ms，由 progress 容器控制 |
| Reduced motion | 2s opacity 呼吸，范围 0.3 至 1，停止横向移动 |

颜色目前使用 CSS 中的固定蓝色。若要改成共享语义 token 或与 emotion 联动，
需要同时更新实现、[DESIGN.md](../../DESIGN.md) 和本文。

修改后在 Electron 的 Light/Dark Mode 下检查提交、流式、完成、失败、取消、
顶部附件和 reduced-motion 状态。本文记录代码规格，运行时视觉验收另行执行。
