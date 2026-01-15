# 命令执行确认流程

## 概述

本文档描述了命令执行确认的完整流程，从用户触发命令到最终执行的整个过程。

**核心改进：** 使用优雅的 UI 组件替代原生 `window.confirm` 对话框。

---

## 架构设计

### 核心组件

1. **CommandConfirmation** - 确认 UI 组件
2. **useCommandConfirmationStore** - 确认状态管理 (Zustand)
3. **CommandInvoker** - 命令调用器
4. **AssistantMessage** - 消息展示组件

### 流程图

```
用户触发命令
    ↓
CommandInvoker.invokeExecuteCommand()
    ↓
Main Process 风险评估
    ↓
requires_confirmation = true
    ↓
CommandInvoker.showCommandConfirmationDialog()
    ↓
useCommandConfirmationStore.requestConfirmation()
    ↓
AssistantMessage 渲染 CommandConfirmation 组件
    ↓
用户点击 "Execute Anyway" 或 "Cancel"
    ↓
store.confirm() 或 store.cancel()
    ↓
Promise resolve(true/false)
    ↓
CommandInvoker 重新执行或取消
```

## 详细实现

### 1. CommandConfirmation 组件

**文件：** `src/renderer/src/components/chat/chatMessage/CommandConfirmation.tsx`

**功能：** 显示命令确认 UI

**特性：**
- 使用 `Item` 组件库构建优雅的 UI
- 根据风险级别显示不同的图标和颜色
  - `dangerous`: 红色，ShieldAlert 图标
  - `risky`: 橙色，AlertTriangle 图标
- 显示命令内容和风险原因
- 提供 "Cancel" 和 "Execute Anyway" 按钮

**Props：**
```typescript
interface CommandConfirmationProps {
  request: CommandConfirmationRequest
  onConfirm: () => void
  onCancel: () => void
  className?: string
}
```

### 2. useCommandConfirmationStore

**文件：** `src/renderer/src/store/commandConfirmation.ts`

**功能：** 管理命令确认的状态和流程

**状态：**
```typescript
{
  pendingRequest: CommandConfirmationRequest | null  // 当前待确认的请求
  resolver: ((confirmed: boolean) => void) | null    // Promise resolver
}
```

**操作方法：**
- `requestConfirmation(request)` - 请求用户确认，返回 Promise<boolean>
- `confirm()` - 用户确认执行
- `cancel()` - 用户取消执行
- `clear()` - 清除当前请求

**工作原理：**
1. `requestConfirmation` 创建一个 Promise 并保存 resolver
2. 设置 `pendingRequest` 触发 UI 渲染
3. 用户点击按钮调用 `confirm()` 或 `cancel()`
4. resolver 被调用，Promise resolve
5. 清除状态

### 3. CommandInvoker

**文件：** `src/tools/command/renderer/CommandInvoker.ts`

**功能：** 调用命令执行并处理确认流程

**关键修改：**
```typescript
// 旧方式：使用 window.confirm
const confirmed = window.confirm(`${title}\n\n${message}`)

// 新方式：使用 store
const confirmed = await useCommandConfirmationStore.getState().requestConfirmation({
  command,
  risk_level: risk_level as 'risky' | 'dangerous',
  risk_reason
})
```

**流程：**
1. 调用 Main Process 执行命令
2. 如果 `requires_confirmation = true`，调用 `showCommandConfirmationDialog`
3. 使用 store 请求确认，等待 Promise resolve
4. 根据结果重新执行或取消

### 4. AssistantMessage 集成

**文件：** `src/renderer/src/components/chat/chatMessage/assistant-message.tsx`

**功能：** 在消息流中渲染确认组件

**集成方式：**
```typescript
// 1. 导入组件和 store
import { CommandConfirmation } from './CommandConfirmation'
import { useCommandConfirmationStore } from '@renderer/store/commandConfirmation'

// 2. 在组件中使用 store
const pendingRequest = useCommandConfirmationStore(state => state.pendingRequest)
const confirm = useCommandConfirmationStore(state => state.confirm)
const cancel = useCommandConfirmationStore(state => state.cancel)

// 3. 在 segments 渲染后添加确认组件
{pendingRequest && (
  <CommandConfirmation
    request={pendingRequest}
    onConfirm={confirm}
    onCancel={cancel}
  />
)}
```

**渲染位置：** 在所有 segments 渲染完成后，Operations 之前

## 测试说明

### 手动测试步骤

1. **启动应用**
   ```bash
   npm run dev
   ```

2. **触发危险命令**
   - 在聊天中输入：`执行命令 rm -rf /tmp/test`
   - 或使用 CommandExecutionTest 组件测试

3. **验证确认 UI**
   - 确认组件应该在消息流中显示
   - 检查风险级别图标和颜色是否正确
   - 检查命令内容是否正确显示

4. **测试用户操作**
   - 点击 "Cancel" - 命令应该被取消
   - 点击 "Execute Anyway" - 命令应该执行

5. **检查控制台日志**
   ```
   [ExecuteCommandInvoker] Command requires user confirmation
   [ExecuteCommandInvoker] Risk level: dangerous
   [ExecuteCommandInvoker] User confirmed/cancelled
   ```

### 测试危险命令示例

**Risky 级别命令：**
- `git reset --hard`
- `npm install -g`
- `chmod 777`

**Dangerous 级别命令：**
- `rm -rf /`
- `dd if=/dev/zero`
- `mkfs.ext4`

---

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/renderer/src/components/chat/chatMessage/CommandConfirmation.tsx` | 确认 UI 组件 |
| `src/renderer/src/store/commandConfirmation.ts` | 确认状态管理 |
| `src/tools/command/renderer/CommandInvoker.ts` | 命令调用器 |
| `src/renderer/src/components/chat/chatMessage/assistant-message.tsx` | 消息展示组件 |
| `src/tools/command/main/CommandProcessor.ts` | 命令处理器（风险评估） |

## 总结

### 核心改进

1. **优雅的 UI** - 使用 Item 组件替代原生 window.confirm
2. **状态管理** - 使用 Zustand store 管理确认流程
3. **Promise 模式** - 异步等待用户确认，代码更清晰
4. **视觉反馈** - 根据风险级别显示不同的颜色和图标
5. **响应式设计** - 支持移动端和桌面端

### 优势

**旧方式（window.confirm）：**
- ❌ UI 不美观，无法自定义样式
- ❌ 阻塞浏览器，用户体验差
- ❌ 无法显示详细的风险信息
- ❌ 不支持深色模式

**新方式（CommandConfirmation）：**
- ✅ 优雅的 UI，与应用风格一致
- ✅ 非阻塞，用户体验好
- ✅ 显示详细的命令和风险信息
- ✅ 支持深色模式
- ✅ 响应式设计，适配各种屏幕

## 未来改进建议

### 1. 添加"记住我的选择"功能
- 允许用户为特定命令设置默认行为
- 存储在本地配置中

### 2. 命令白名单
- 允许用户添加信任的命令到白名单
- 白名单命令跳过确认流程

### 3. 更详细的风险说明
- 显示命令可能造成的具体影响
- 提供相关文档链接

### 4. 命令预览
- 在确认前显示命令的预期效果
- 使用 dry-run 模式（如果命令支持）

### 5. 历史记录
- 记录用户的确认/取消历史
- 用于分析和改进风险评估

---

## 相关文档

- `docs/message-compression-flow.md` - 消息构建流程
- `docs/message-builder-design.md` - MessageBuilder 设计
- `src/tools/command/README.md` - 命令工具文档








