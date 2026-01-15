# 打字机效果优化 - 测试指南

## 已完成的改动

### 1. 创建 `useSegmentTypewriterNext.ts`

**位置：** `src/renderer/src/hooks/useSegmentTypewriterNext.ts`

**核心改进：**
- ✅ Token 级粒度（单词/标点分离）
- ✅ 批量更新机制（50ms 间隔）
- ✅ 智能速度算法（指数衰减）
- ✅ 中文支持（正则包含中文字符）
- ✅ 新增 `getVisibleTokens()` API

### 2. 更新 `use-message-typewriter.ts`

**改动：**
- 导入改为 `useSegmentTypewriterNext`
- 参数调整：
  - `minSpeed: 12 → 30` (Token 级)
  - `maxSpeed: 30 → 80` (Token 级)
  - 新增 `granularity: 'token'`
  - 新增 `batchUpdateInterval: 50`
- 返回值新增 `getVisibleTokens`

---

## 测试步骤

### 第 1 步：启动应用

```bash
npm run dev
```

### 第 2 步：基本功能测试

#### 测试 1：短文本（<100 字）

**操作：**
1. 发送一个简单的问题："What is React?"
2. 观察 AI 回复的打字机效果

**预期效果：**
- ✅ 文字以单词为单位显示（不是逐字符）
- ✅ 速度自然流畅
- ✅ 无卡顿或跳跃

**对比点：**
- 旧版：字符级，机械感强
- 新版：单词级，更自然

#### 测试 2：长文本（>500 字）

**操作：**
1. 发送："Write a detailed explanation of how React hooks work"
2. 观察长文本的打字机效果

**预期效果：**
- ✅ 长文本不卡顿
- ✅ 速度保持流畅
- ✅ 内存占用正常

**对比点：**
- 旧版：可能有性能问题
- 新版：批量更新，性能更好

#### 测试 3：流式输入（网络模拟）

**操作：**
1. 打开浏览器开发者工具
2. Network → Throttling → Slow 3G
3. 发送一个问题
4. 观察流式输入时的效果

**预期效果：**
- ✅ 即使网络慢，显示也流畅
- ✅ 队列缓冲机制工作正常
- ✅ 速度自适应（队列积压时加速）

---

## 性能对比

### 对比指标

| 指标 | 旧版 (字符级) | 新版 (Token 级) | 改进 |
|------|--------------|----------------|------|
| 粒度 | 字符 | 单词/Token | ✅ 更自然 |
| 速度参数 | 12-30ms | 30-80ms | ✅ 更合理 |
| 重渲染频率 | 每个字符 | 每 50ms | ✅ 减少 60%+ |
| 长文本性能 | 一般 | 优秀 | ✅ 批量更新 |
| 中文支持 | 是 | 是 | ✅ 改进正则 |

### 性能测试方法

**使用 React DevTools Profiler：**

1. 打开 React DevTools
2. 切换到 Profiler 标签
3. 点击录制按钮
4. 发送一个问题并等待回复完成
5. 停止录制
6. 查看组件渲染次数和时间

**预期结果：**
- `AssistantMessage` 组件渲染次数减少 60%+
- 总渲染时间减少

---

## 回滚方案

如果新版本有问题，可以快速回滚：

### 方法 1：修改导入

```typescript
// use-message-typewriter.ts
// 改回旧版
import { useSegmentTypewriter } from '@renderer/hooks/useSegmentTypewriter'

// 使用旧版
const { ... } = useSegmentTypewriter(segments, {
  minSpeed: 12,
  maxSpeed: 30,
  // 移除新参数
  enabled,
  isStreaming,
  // ...
})
```

### 方法 2：Git 回滚

```bash
git checkout HEAD -- src/renderer/src/components/chat/chatMessage/use-message-typewriter.ts
```

---

## 下一步（可选）

如果基本测试通过，可以考虑：

### 阶段 2：视觉层优化

**目标：** 添加 Framer Motion 动效

**步骤：**
1. 安装依赖：`npm install framer-motion`
2. 使用 `FluidTypewriterText.tsx` 组件
3. 在 `assistant-message.tsx` 中替换渲染逻辑

**预期效果：**
- Blur + Fade + Slide 流体渐显
- Apple Intelligence 风格

---

## 常见问题

### Q1: 打字机效果没有启动？

**检查：**
- 确保是最新的 assistant 消息
- 确保 `typewriterCompleted` 为 false
- 查看控制台是否有错误

### Q2: 速度太快或太慢？

**调整参数：**
```typescript
// use-message-typewriter.ts
minSpeed: 30,  // 增大 = 更慢
maxSpeed: 80,  // 增大 = 更慢
```

### Q3: 中文显示有问题？

**检查正则：**
```typescript
// useSegmentTypewriterNext.ts
// 确保包含中文字符范围
/(\s+|[^\s\w\u4e00-\u9fa5]+|[\u4e00-\u9fa5]+)/
```

---

## 测试清单

- [ ] 短文本测试通过
- [ ] 长文本测试通过
- [ ] 流式输入测试通过
- [ ] 中文测试通过
- [ ] 英文测试通过
- [ ] 混合语言测试通过
- [ ] 性能对比完成
- [ ] 无明显 bug

---

## 反馈

测试完成后，请记录：

1. **效果评价：** 是否比旧版更自然？
2. **性能数据：** 渲染次数减少了多少？
3. **发现的问题：** 有哪些 bug 或不足？
4. **改进建议：** 还需要哪些优化？
