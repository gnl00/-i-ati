# 打字机效果：setInterval vs requestAnimationFrame

## 方案 1：使用 setInterval

### 优点
1. **精确的时间控制**：可以精确设置每个字符的间隔时间（如 50ms）
2. **简单直观**：代码逻辑更容易理解
3. **后台执行**：标签页不可见时仍然继续（可能是优点也可能是缺点）

### 缺点
1. **性能问题**：不与浏览器渲染周期同步，可能导致：
   - 掉帧（frame drops）
   - 视觉卡顿
   - 不必要的重绘
2. **闭包陷阱**：在 React 中容易出现闭包问题（如我们遇到的）
3. **资源浪费**：标签页不可见时仍然执行，浪费 CPU
4. **动态调速困难**：需要不断清除和重建 interval

### 代码示例
```typescript
const dequeue = () => {
  if (queue.length === 0) return

  const char = queue.shift()
  setDisplayedText(prev => prev + char)

  // 动态调整速度需要重建 interval
  clearInterval(timer)
  const newSpeed = calculateSpeed(queue.length)
  timer = setInterval(dequeue, newSpeed) // 问题：闭包陷阱
}

timer = setInterval(dequeue, 50)
```

---

## 方案 2：使用 requestAnimationFrame（当前实现）

### 优点
1. **流畅的动画**：与浏览器刷新率同步（60fps），视觉效果更平滑
2. **性能优化**：
   - 浏览器自动优化渲染
   - 标签页不可见时自动暂停，节省资源
   - 避免不必要的重绘
3. **避免闭包陷阱**：函数在 useEffect 内定义，自动捕获最新状态
4. **动态调速简单**：每帧都可以重新计算速度，无需重建定时器

### 缺点
1. **时间精度较低**：受限于浏览器刷新率（通常 16.67ms/帧）
   - 无法实现小于 16ms 的间隔
   - 实际间隔可能略有偏差
2. **标签页不可见时暂停**：可能不适合某些场景（但对打字机效果是优点）

### 代码示例
```typescript
const animate = (timestamp: number) => {
  if (queue.length === 0) return

  // 动态计算速度
  const speed = calculateSpeed(queue.length)

  // 检查是否到达下一个字符的时间
  if (timestamp - lastUpdate >= speed) {
    const char = queue.shift()
    setDisplayedText(prev => prev + char)
    lastUpdate = timestamp
  }

  // 继续下一帧（无需重建，无闭包问题）
  if (queue.length > 0) {
    requestAnimationFrame(animate)
  }
}

requestAnimationFrame(animate)
```

---

## 性能对比

### setInterval
- CPU 使用：持续占用，即使标签页不可见
- 内存：可能因闭包导致内存泄漏
- 渲染：可能与浏览器渲染周期不同步，导致掉帧

### requestAnimationFrame
- CPU 使用：标签页不可见时自动暂停，节省 CPU
- 内存：更少的闭包问题
- 渲染：与浏览器渲染周期完美同步，流畅度更高

---

## 实际测试对比

### 场景 1：快速打字（20ms 间隔）
- **setInterval**：可能出现卡顿，因为 20ms 接近浏览器渲染周期
- **requestAnimationFrame**：流畅，但实际间隔约为 16-32ms（受限于 60fps）

### 场景 2：正常打字（50ms 间隔）
- **setInterval**：基本流畅，但可能有轻微卡顿
- **requestAnimationFrame**：完全流畅，视觉效果更好

### 场景 3：长文本（1000+ 字符）
- **setInterval**：可能导致浏览器卡顿，尤其是动态调速时
- **requestAnimationFrame**：流畅处理，浏览器自动优化

### 场景 4：标签页切换
- **setInterval**：后台继续执行，浪费资源
- **requestAnimationFrame**：自动暂停，切回时继续，节省资源

---

## 结论

### 对于打字机效果，推荐使用 requestAnimationFrame

**原因：**
1. ✅ 视觉效果更流畅
2. ✅ 性能更好，自动优化
3. ✅ 避免闭包陷阱
4. ✅ 代码更简洁
5. ✅ 标签页不可见时自动暂停

**唯一的权衡：**
- 时间精度略低（但对打字机效果影响不大，人眼难以察觉）

### 何时仍然使用 setInterval？
- 需要精确的时间间隔（如倒计时）
- 后台任务必须持续执行（如轮询 API）
- 不涉及 UI 渲染的定时任务

---

## 混合方案（可选）

如果需要精确的时间控制 + 流畅的动画，可以结合两者：

```typescript
// 使用 setInterval 控制节奏
setInterval(() => {
  queue.push(nextChar)
}, 50)

// 使用 requestAnimationFrame 渲染
const render = () => {
  if (queue.length > 0) {
    const char = queue.shift()
    setDisplayedText(prev => prev + char)
  }
  requestAnimationFrame(render)
}
requestAnimationFrame(render)
```

但对于打字机效果，单独使用 requestAnimationFrame 已经足够好了。
