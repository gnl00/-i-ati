# Smart Welcome Greeting Refresh

## 背景

`SmartWelcomeEntrance` 的 greeting subtitle 原先在组件挂载时随机生成一次。欢迎页长时间停留时，slogan 和 `Good Morning/Afternoon/Evening/Night` 会保持首次挂载时的时段。

这个问题集中在 renderer 层：

- `SmartWelcomeEntrance` 负责 greeting 展示和打字机效果。
- smart message 生成和刷新属于 main 层后台调度。
- 欢迎页有消息后会退出并卸载，空会话停留时才需要持续校准 greeting。

## 方案

本次优化采用 renderer 侧独立调度，把 greeting 的时间逻辑拆成纯函数，再由组件管理生命周期。

核心边界是四个本地时段切换点：

- `05:00` night -> morning
- `12:00` morning -> afternoon
- `18:00` afternoon -> evening
- `22:00` evening -> night

组件挂载时立即刷新一次 greeting，然后通过 `setTimeout` 精准等待到下一个时段边界。边界触发后重新选择当前时段的随机 subtitle，并安排下一次刷新。

## 实现

新增 `src/renderer/src/components/chat/welcome/smartGreeting.ts`：

- `getTimeOfDay(hour)`：把本地小时映射为 `morning | afternoon | evening | night`。
- `pickSmartGreeting(now, random)`：根据当前时段选择一条 subtitle，支持注入随机源用于测试。
- `getNextTimeOfDayBoundary(now)`：计算下一次时段边界。
- `getMsUntilNextSmartGreetingRefresh(now)`：返回距离下一次刷新所需的毫秒数。

更新 `SmartWelcomeEntrance.tsx`：

- 移除组件内的固定文案和时段计算。
- 使用 `pickSmartGreeting()` 更新 `timeOfDay` 和 `subtitleText`。
- 使用边界 `setTimeout` 调度下一次刷新。
- 在 `window.focus` 和 `document.visibilitychange` 回到可见时重新校准，覆盖系统睡眠、后台挂起和窗口重新激活。

## 验证

新增 `src/renderer/src/components/chat/welcome/__tests__/smartGreeting.test.ts`，覆盖：

- 时段边界映射。
- 不同时段的随机 subtitle 选择。
- 下一时段边界计算。
- 距离下一次刷新所需毫秒数。

已通过：

```bash
pnpm exec vitest run src/renderer/src/components/chat/welcome/__tests__/smartGreeting.test.ts
pnpm run typecheck:web
```
