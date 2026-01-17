# 欢迎页面融合球效果说明

## 🎨 效果介绍

我为你的欢迎页面添加了一个**SVG metaballs（融合球）**效果，灵感来自你提供的项目。这个效果会在页面背景中显示 3 个跟随鼠标移动的半透明球体，它们会产生流体般的融合效果。

## ✨ 特性

### 1. 鼠标跟随动画
- **3 个不同大小的球体**：小（60px）、中（80px）、大（128px）
- **不同的跟随速度**：
  - Blob 1（小球）：快速跟随（15% 插值）
  - Blob 2（大球）：慢速跟随（8% 插值）
  - Blob 3（中球）：中速跟随（12% 插值）

### 2. SVG 滤镜融合效果
使用 SVG 的 `feGaussianBlur` 和 `feColorMatrix` 滤镜创造流体融合效果：
```xml
<filter id="goo">
  <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="20" />
  <feColorMatrix
    in="blur"
    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
  />
</filter>
```

### 3. 契合 App 配色
- 使用 `bg-primary/20`、`bg-primary/15`、`bg-primary/18` 等半透明颜色
- 深色模式下自动调整透明度（`dark:bg-primary/10` 等）
- 完全融入你的设计系统

## 🔧 技术实现

### 核心原理

1. **鼠标位置追踪**
   - 监听容器的 `mousemove` 事件
   - 计算相对于容器的鼠标坐标

2. **平滑跟随动画**
   - 使用 `requestAnimationFrame` 实现 60fps 动画
   - 线性插值（lerp）算法：`newPos = oldPos + (target - oldPos) * speed`
   - 不同速度创造层次感

3. **SVG 滤镜**
   - `feGaussianBlur`：模糊球体边缘
   - `feColorMatrix`：增强对比度，创造融合效果

### 性能优化

- ✅ 使用 `requestAnimationFrame` 而非 `setInterval`
- ✅ 球体使用 `pointer-events-none` 避免干扰交互
- ✅ 使用 CSS `transform` 而非 `left/top`（GPU 加速）
- ✅ 组件卸载时清理动画帧

## 🎛️ 自定义配置

### 调整球体大小

在 `WelcomeMessageWithBlob.tsx` 中修改：

```tsx
{/* Blob 1 - 小球 */}
<div className="absolute w-16 h-16 rounded-full" /> {/* 改为 w-20 h-20 */}

{/* Blob 2 - 大球 */}
<div className="absolute w-32 h-32 rounded-full" /> {/* 改为 w-40 h-40 */}

{/* Blob 3 - 中球 */}
<div className="absolute w-20 h-20 rounded-full" /> {/* 改为 w-24 h-24 */}
```

### 调整跟随速度

修改插值系数（0-1 之间，越大越快）：

```tsx
// Blob 1: 快速跟随
setBlob1Pos(prev => ({
  x: prev.x + (mousePos.x - prev.x) * 0.15, // 改为 0.2 更快
  y: prev.y + (mousePos.y - prev.y) * 0.15
}))
```

### 调整颜色和透明度

修改球体的颜色类名：

```tsx
{/* 使用不同的颜色 */}
<div className="bg-blue-500/20 dark:bg-blue-400/10" />
<div className="bg-purple-500/15 dark:bg-purple-400/8" />
<div className="bg-pink-500/18 dark:bg-pink-400/9" />
```

### 调整融合强度

修改 SVG 滤镜参数：

```tsx
<feGaussianBlur stdDeviation="20" /> {/* 增大数值 = 更模糊 = 更强融合 */}
<feColorMatrix values="... 0 0 0 18 -7" /> {/* 调整最后两个数值 */}
```

## 📦 组件对比

### WelcomeMessageSimple.tsx
- ✅ 保留原设计的打字机效果
- ✅ 使用 app 配色系统
- ✅ 移除 emoji，使用纯文本
- ❌ 无特殊视觉效果

### WelcomeMessageWithBlob.tsx（当前使用）
- ✅ 保留原设计的打字机效果
- ✅ 使用 app 配色系统
- ✅ 移除 emoji，使用纯文本
- ✅ **新增融合球跟随效果**

## 🔄 如何切换组件

在 `ChatWindowComponentV2.tsx` 中修改导入语句：

```tsx
// 使用融合球版本（当前）
import WelcomeMessage from "@renderer/components/chat/WelcomeMessageWithBlob"

// 或使用简约版本
import WelcomeMessage from "@renderer/components/chat/WelcomeMessageSimple"

// 或使用原始版本
import WelcomeMessage from "@renderer/components/chat/WelcomeMessage5"
```

## 📝 总结

我为你的欢迎页面添加了一个优雅的融合球效果：

1. ✅ **保留了你喜欢的设计** - 打字机效果、循环提示、整体布局
2. ✅ **契合 app 配色** - 使用 `primary` 颜色系统，自动适配深色模式
3. ✅ **性能优化** - 使用 RAF 和 GPU 加速，流畅运行
4. ✅ **克制的视觉效果** - 半透明球体，不会过于抢眼
5. ✅ **无需额外依赖** - 纯 React + CSS，无需 react-spring

现在你可以运行 app 查看效果了！鼠标移动时，3 个半透明球体会以不同速度跟随，并产生流体般的融合效果。
