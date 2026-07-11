# 等待输出动画优化方案

## 背景

当前 AI 等待输出时，使用 `LoadingDots`（三个弹跳圆点）展示"思考中"状态。有两个问题：

1. **硬切无过渡** — LoadingDots 和文本段之间直接切换，缺少交叉淡入淡出，视觉突兀
2. **位置不友好** — LoadingDots 位于消息流中，长对话时需要滚动到底部才能看到，无法扫一眼就确认"AI 是否在工作"

## 决策

**移除 LoadingDots**，改用"往返梭子"（indeterminate marquee progress bar）动画，放置在 **Input Area 顶部边框位置**。

## 效果示意

```
┌─────────────────────────────────────┐
│  ════ ┄┄┄┄┄┄┄┄┄┄┄┄┄ ════          │  ← 2px 光条（AI 思考中时出现）
├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤  ← 原始 border
│                                     │
│  textarea...                        │
│                                     │
│  [toolbar]                          │
└─────────────────────────────────────┘
```

光条在输入区域顶部来回扫动，扫一眼就知道 AI 正在工作。不需要滚动，不占用消息区空间。

## 相关文件

| 文件 | 角色 | 操作 |
|------|------|------|
| `src/renderer/src/components/chat/chatMessage/assistant-message/LoadingDots.tsx` | 现有 LoadingDots 组件 | **删除** |
| `src/renderer/src/components/chat/chatMessage/assistant-message/AssistantMessageBody.tsx` | 引用 LoadingDots（`textItems.length === 0 && isLatest`） | **移除 LoadingDots 引用和条件渲染** |
| `src/renderer/src/components/chat/chatMessage/assistant-message/renderers/AssistantTextSegmentList.tsx` | 引用 LoadingDots（`items.length === 0 && isLatest`） | **移除 LoadingDots 引用和条件渲染** |
| `src/renderer/src/components/chat/chatInput/SharedPromptSurface.tsx` | 光条放置的目标组件 | **新增 shuttle 动画** |
| `src/renderer/src/components/chat/chatInput/SharedPromptSurface.css` | 光条样式和动画定义 | **新增 CSS** |
| `tailwind.config.js` | `loading-dot` keyframe 定义 | **移除**（LoadingDots 删除后不再需要） |

## 实现

### 位置

方案 A：**覆盖在现有 `border-top` 上**（✅ 选定）

- 用绝对定位 div + `overflow: hidden` 裁剪圆角
- 不影响现有布局，进出无 layout shift
- 和原始 border 分离控制，光条 `opacity` 过渡不影响边框

```
  .shared-prompt-surface（父容器, overflow: hidden）
  ┌─────────────────────────────────┐
  │  ═══ ┄┄┄┄┄┄┄┄ ═══  ← div 绝对定位 top:0  │
  │  (原始 border: 1px solid ...)   │
  │  textarea                       │
  └─────────────────────────────────┘
```

### 触发条件

AI 正在生成回复时显示（`runPhase === 'submitting' || runPhase === 'streaming'`），完成后隐藏。

### 动画规格

| 属性 | 值 |
|------|-----|
| 光条高度 | 2px |
| 光条宽度 | 40%（容器宽度） |
| 光条颜色 | 渐变：`transparent → primary/60 → transparent` |
| 运动方式 | `translateX(-100%) → translateX(350%)` 循环 |
| 运动曲线 | `ease-in-out` |
| 周期 | 1.2s |
| 进出过渡 | opacity 0.15s ease-out |

```css
@keyframes shuttle {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
```

## 移除 LoadingDots 的影响

1. 首次 token 到达前的"空等待"状态不再显示弹跳点
2. 视觉上由 badge（谁在说）→ 光条（正在想）→ 文字（输出）串联
3. 光条在 input 位置固定可见，不需要滚动查找

## 后续可能的优化

- 光条颜色与 emotion 联动（如思考中→accent 色，忙碌→warning 色）
- 支持 prefers-reduced-motion 时降级为纯 opacity 呼吸
