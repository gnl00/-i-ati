# ToolResult Group 动画优化方案

## 文档元信息

- **创建日期**: 2026-07-11
- **相关组件**: `ToolCallResult.tsx`, `SupportSegmentGroup.tsx`
- **影响范围**: Tool call 渲染、Support segment 分组动画
- **优先级**: 中高

## 当前实现分析

### 现有动画机制

#### 1. ToolCallResult 单个项动画
**位置**: `ToolCallResult.tsx:1069-1073`

```tsx
<motion.div
  initial={{ opacity: 0, y: 8, scale: 0.985 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  transition={{ type: 'spring', stiffness: 360, damping: 30 }}
>
```

**特点**: 使用 spring 动画，有弹性效果

#### 2. Group 内行项动画
**位置**: `SupportSegmentGroup.tsx:719-726`

```tsx
<motion.div
  layout={shouldReduceMotion ? false : 'position'}
  initial={shouldReduceMotion ? false : { opacity: 0, x: -16, scale: 0.97 }}
  animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0, scale: 1 }}
  exit={shouldReduceMotion ? undefined : { opacity: 0, x: -8, scale: 0.98 }}
  transition={supportSegmentRowAppendTransition}
>
```

**特点**: 水平滑入配合 scale 变换，使用 spring 动画

#### 3. Panel 展开/折叠动画
**位置**: `ToolCallResultPanel.tsx:920-924`

```tsx
<motion.div
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.18, ease: 'easeOut' }}
>
```

**特点**: 简单的淡入 + 位移动画

---

## 核心问题诊断

### 问题 1: 动画方向不自然

**现象**: toolresult 垂直淡入显得突兀，缺乏明确的插入方向感

**根本原因**:
- 使用 **垂直位移** (`y: 3`) 配合淡入
- 元素像是"从上方落下"或"凭空出现"
- 不符合用户对"插入"操作的心理模型
- 缺少明确的方向性引导

**表现**:
```
视觉流程:
0ms     新项从正上方开始淡入
        ↓ 垂直位移
200ms   元素"落"到最终位置

问题：方向不明确，感觉突然
```

### 问题 2: 插入时的布局跳跃

**位置**: `SupportSegmentGroup.tsx:1001-1008`

```tsx
<SizeAnimatedPanel
  expanded={!shouldRenderCollapsed}
  reducedMotion={shouldReduceMotion}
  contentClassName="flex flex-col gap-0.5"
>
  {displayPlan.collapsedPreview.hiddenPhases.map(renderPhase)}
</SizeAnimatedPanel>
```

**问题细节**:
1. `SizeAnimatedPanel` 处理高度变化
2. 新增项同时执行淡入 + 位移
3. 相邻元素的 `layout="position"` 重排与新项进入动画使用不同曲线
4. 导致"内容先出现，容器后撑开"的视觉错位

### 问题 3: ToolCallResultPanel 弹出不流畅

**当前实现**:
- Panel 打开时只有 `opacity` 和 `y` 动画
- 缺少 `scale` 变换，缺乏"生长感"
- `duration: 0.18` (180ms) 偏快，视觉上感觉"跳出"而非"展开"
- 没有考虑父容器的 layout 变化

---

## 优化方案

### 方案 A: 协调动画曲线与时序（采用）

> 以下初稿参数保留为方案演进记录。实际实施以“实施决策”中的属性级 transition 为准。

#### 1. 协调行项缓动参数

**配置位置**: `SupportSegmentGroup.tsx`

```typescript
/**
 * Keeps row insertion and sibling repositioning visually coordinated:
 * - layout uses a responsive spring for smooth repositioning
 * - x (horizontal slide) uses spring for natural entrance from left
 * - opacity uses fixed duration for predictable fade-in
 * - scale uses spring for organic growth feeling
 * New rows slide in from the left, establishing clear directionality.
 */
const supportSegmentRowAppendTransition: Transition = {
  layout: { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 },
  x: { type: 'spring', stiffness: 400, damping: 30, mass: 0.7 },
  opacity: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
  scale: { type: 'spring', stiffness: 420, damping: 32, mass: 0.6 }
}
```

**原理**:
- **水平滑入 (x)**: 从左侧滑入，符合 LTR 阅读习惯，方向明确
- **缩放 (scale)**: 配合滑入产生"生长"效果，增加有机感
- **透明度 (opacity)**: 使用固定时长确保内容快速可见
- **布局 (layout)**: Spring 让其他元素重排更自然
- 不使用 `willChange`，让 Framer Motion 自动管理合成层

#### 2. 改进 Group 内行项动画

**修改文件**: `SupportSegmentGroup.tsx`

**位置**: 第 717-734 行

```tsx
<AnimatePresence initial={false}>
  {phase.items.map((item, index) => (
    <motion.div
      key={item.key}
      layout={shouldReduceMotion ? false : 'position'}
      initial={shouldReduceMotion ? false : {
        opacity: 0,
        x: -16,      // 从左侧 16px 滑入
        scale: 0.97  // 3% 缩放
      }}
      animate={shouldReduceMotion ? undefined : {
        opacity: 1,
        x: 0,
        scale: 1
      }}
      exit={shouldReduceMotion ? undefined : {
        opacity: 0,
        x: -8,       // 向左滑出 8px
        scale: 0.98  // 退出时微缩
      }}
      transition={supportSegmentRowAppendTransition}
    >
      <SupportToolPhaseTimelineRow
        item={item}
        isFirst={index === 0}
        isLast={index === phase.items.length - 1}
        showTimeline={hasMultipleTools}
      />
    </motion.div>
  ))}
</AnimatePresence>
```

**改进点**:
1. ✅ 从垂直 (y) 改为水平 (x) 滑入，方向明确
2. ✅ 使用 -16px 偏移，产生明显但不夸张的滑入效果
3. ✅ 添加 `scale` 变换，配合滑入产生"生长"感
4. ✅ 退出动画对称（x: -8），保持视觉一致性
5. ✅ 移除 `willChange`，避免长聊天累积合成层

#### 3. 优化 ToolCallResultPanel 弹出

**修改文件**: `ToolCallResult.tsx`

**位置**: 第 920 行附近

```tsx
<motion.div
  initial={shouldReduceMotion
    ? { opacity: 0 }
    : { opacity: 0, y: 4, scale: 0.985 }}
  animate={shouldReduceMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0, scale: 1 }}
  transition={{
    duration: shouldReduceMotion ? 0.12 : 0.21,
    ease: [0.22, 1, 0.36, 1]
  }}
  className="relative overflow-hidden rounded-2xl"
>
```

**改进点**:
1. ✅ 添加 `scale` 变换，让 panel 有"展开"的感觉
2. ✅ 使用 210ms ease-out 保持可预测的打开时序
3. ✅ Reduced Motion 下仅保留 120ms opacity

#### 4. 处理 SizeAnimatedPanel 插入卡顿

**需要检查**: `src/renderer/src/components/ui/size-animated-panel.tsx`

**优化方向**:

```tsx
<AnimatePresence mode="popLayout">  {/* 关键：使用 popLayout 模式 */}
  {!shouldRenderCollapsed && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{
        height: {
          type: 'spring',
          stiffness: 400,
          damping: 32
        },
        opacity: {
          duration: 0.15,
          ease: 'easeOut'
        }
      }}
    >
      {displayPlan.collapsedPreview.hiddenPhases.map(renderPhase)}
    </motion.div>
  )}
</AnimatePresence>
```

**关键改进**:
- `mode="popLayout"`: 确保退出元素立即从布局流中移除
- 高度使用 spring，透明度使用固定时长
- 两个属性分开配置，避免同步问题

---

### 方案 B: 分阶段渲染（延后）

**适用场景**: 大量 toolresult 快速连续出现时

#### 核心思路

采用"预留空间 → 淡入内容"两阶段渲染：

```tsx
const [mountedItems, setMountedItems] = useState<Set<string>>(new Set())

useEffect(() => {
  const newKeys = phase.items.map(item => item.key)
  const unmountedKeys = newKeys.filter(key => !mountedItems.has(key))

  if (unmountedKeys.length > 0) {
    // 第一阶段：立即预留空间（无内容）
    // 这样相邻元素可以先完成位移
    const timer = setTimeout(() => {
      // 第二阶段：淡入内容
      setMountedItems(prev => new Set([...prev, ...unmountedKeys]))
    }, 50) // 50ms 延迟保证空间先渲染

    return () => clearTimeout(timer)
  }
}, [phase.items])

// 渲染时：
{phase.items.map((item) => {
  const isFullyMounted = mountedItems.has(item.key)

  return (
    <motion.div
      key={item.key}
      layout="position"
      initial={{ height: 0, opacity: 0 }}
      animate={{
        height: 'auto',
        opacity: isFullyMounted ? 1 : 0
      }}
      transition={{
        height: {
          type: 'spring',
          stiffness: 440,
          damping: 32
        },
        opacity: {
          delay: 0.08,      // 等待高度动画
          duration: 0.15
        }
      }}
    >
      {isFullyMounted && <SupportToolCallGroupRow item={item} />}
    </motion.div>
  )
})}
```

**优势**:
- ✅ 消除"内容撑开容器"导致的抖动
- ✅ 相邻元素先完成重排，再显示新内容
- ✅ 视觉上更连贯

**劣势**:
- ❌ 增加状态管理复杂度
- ❌ 需要额外的 timeout 管理
- ❌ 可能在快速操作时积累延迟

---

### 方案 C: Web Animations API（延后）

**适用场景**: 性能瓶颈明确、需要极致优化时

```tsx
const itemRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (!itemRef.current) return

  const animation = itemRef.current.animate([
    {
      opacity: 0,
      transform: 'translateY(6px) scale(0.96)'
    },
    {
      opacity: 1,
      transform: 'translateY(0) scale(1)'
    }
  ], {
    duration: 240,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    fill: 'forwards'
  })

  return () => animation.cancel()
}, [])

return <div ref={itemRef}>...</div>
```

**优势**:
- ✅ 原生 API，性能最佳
- ✅ 不依赖 React 渲染周期
- ✅ 可以直接使用 GPU 加速

**劣势**:
- ❌ 失去 Framer Motion 的 layout 动画能力
- ❌ 需要手动管理动画生命周期
- ❌ 代码可读性降低

---

## 实施建议

### 优先级排序

#### Phase 1: 当前实施
- Group 行追加使用属性级 transition
- ToolResult panel 增加 reduced-motion 感知的克制入场
- 更新相邻单元测试与手动验收场景

#### Phase 2: 性能证据驱动的后续工作
- 录制 Electron Performance trace
- 检查 Long Animation Frame、React commit 和聊天滚动锚点
- 仅在 trace 指向明确瓶颈时评估分阶段渲染或原生动画

### 性能指标

| 指标 | 验收目标 | 测量方法 |
|-----|---------|---------|
| 连续追加稳定性 | 连续追加 3–5 项时无二次弹跳 | 录屏逐帧检查 |
| 布局耗时 | 动画期间无明显 Long Animation Frame | Electron DevTools Performance |
| 滚动锚点 | 展开、折叠和追加期间底部锚点稳定 | 正式聊天窗口手动测试 |
| Reduced Motion | 关闭空间位移与 layout 动画 | 系统设置与组件测试 |

---

## 调试与测试

### 可选的开发模式诊断工具

以下诊断代码仅用于出现可复现性能问题后的临时采样，不进入本轮生产实现。

```tsx
// 添加到 SupportSegmentGroup.tsx 或 ToolCallResult.tsx

if (import.meta.env.DEV) {
  useEffect(() => {
    console.log('[Tool Animation Debug]', {
      itemKey: item.key,
      timestamp: Date.now(),
      phase: 'enter',
      parentLayout: 'repositioning',
      transitionConfig: TOOL_RESULT_ENTER_TRANSITION
    })
  }, [item.key])
}
```

### 性能监控钩子

```tsx
/**
 * 监控动画帧率
 * 在低 FPS 时发出警告
 */
function useAnimationPerformance(enabled: boolean) {
  const metricsRef = useRef({
    startTime: 0,
    frameCount: 0
  })

  useEffect(() => {
    if (!enabled) return

    let rafId: number
    metricsRef.current.startTime = Date.now()
    metricsRef.current.frameCount = 0

    const measureFrame = () => {
      metricsRef.current.frameCount++
      rafId = requestAnimationFrame(measureFrame)
    }

    rafId = requestAnimationFrame(measureFrame)

    return () => {
      cancelAnimationFrame(rafId)
      const elapsed = Date.now() - metricsRef.current.startTime
      const fps = metricsRef.current.frameCount / (elapsed / 1000)

      if (fps < 50) {
        console.warn('[Animation Performance]', {
          fps: fps.toFixed(2),
          frames: metricsRef.current.frameCount,
          duration: `${elapsed}ms`
        })
      }
    }
  }, [enabled])
}

// 使用：
useAnimationPerformance(import.meta.env.DEV && hasLiveTiming)
```

### 测试场景

#### 场景 1: 单个 toolresult 出现
1. 触发一个 tool call
2. 观察进入动画是否流畅
3. 检查是否有布局跳跃

#### 场景 2: 多个 toolresult 连续出现
1. 快速触发 3-5 个 tool call
2. 观察它们是否按序流畅出现
3. 检查相邻元素的重排动画

#### 场景 3: toolresult 插入到已存在的 group
1. 已有一个展开的 tool group
2. 新增一个 tool call 到中间位置
3. 观察插入动画和现有元素的位移

#### 场景 4: group 展开/折叠
1. 折叠状态下添加新 toolresult
2. 点击展开
3. 观察 SizeAnimatedPanel 的动画

---

## 关键改进点总结

| 问题 | 现状 | 优化方案 | 实现状态 |
|-----|------|---------|---------|
| 插入方向不明确 | 垂直淡入 (y: 3) | 水平滑入 (x: -16/-12) | ✅ 已实施 |
| 缺少生长感 | 仅 opacity + y | 添加 scale: 0.97/0.98 | ✅ 已实施 |
| Panel 打开生硬 | 仅 opacity + y | 添加 scale + 调整时长 | ✅ 已实施 |
| 行项动画时序不协调 | 单一 duration 控制全部属性 | 按 layout/x/opacity/scale 分配 transition | ✅ 已实施 |

**验收方式**: 录屏逐帧分析 + Chrome Performance trace 帧率验证

---

## 相关文档

- [Chat Message Rendering Optimization](./chat-message-rendering-optimization.md)
- [Typewriter Stability Guidelines](./typewriter-stability-guidelines.md)
- [Render Pipeline Optimization](../render-pipeline-optimization.md)

---

## 变更历史

- **2026-07-11**: 初始文档创建，分析当前实现并提出优化方案
- **2026-07-11**: 实施水平滑入动画，从垂直 (y) 改为水平 (x) 方向，添加 scale 变换
