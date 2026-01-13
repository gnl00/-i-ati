# 方案 4 完整实现示例

## 修改内容

### 1. ChatInputArea.tsx 已修改

**新增 props**：
```typescript
interface ChatInputAreaProps {
  onMessagesUpdate: () => void
  suggestedPrompt?: string  // 新增：接收来自 WelcomeMessage 的建议
}
```

**新增状态**：
```typescript
const [showQuickSendButton, setShowQuickSendButton] = useState<boolean>(false)
```

**新增逻辑**：
- 监听 `suggestedPrompt` 变化，自动填充到 textarea
- 显示快速发送按钮
- 用户编辑时自动隐藏快速发送按钮

**新增 UI**：
- textarea 右下角的快速发送按钮（带动画效果）

### 2. 父组件集成示例

```typescript
import React, { useState } from 'react'
import WelcomeMessage from './WelcomeMessageNext2'
import ChatInputArea from './ChatInputArea'

const ChatWindow = () => {
  const [suggestedPrompt, setSuggestedPrompt] = useState<string>('')

  const handleSuggestionClick = (suggestion: Suggestion) => {
    // 将建议的 prompt 传递给 ChatInputArea
    setSuggestedPrompt(suggestion.prompt)
  }

  const handleMessagesUpdate = () => {
    // 处理消息更新后的逻辑
    console.log('Messages updated')
  }

  return (
    <div className="chat-window">
      {/* 欢迎/建议区域 */}
      <WelcomeMessage onSuggestionClick={handleSuggestionClick} />

      {/* 聊天输入区域 */}
      <ChatInputArea
        onMessagesUpdate={handleMessagesUpdate}
        suggestedPrompt={suggestedPrompt}  // 传递建议的 prompt
      />
    </div>
  )
}

export default ChatWindow
```

## 工作流程

1. **用户点击示例卡片**
   - WelcomeMessageNext2 触发 `onSuggestionClick`
   - 传递完整的 `Suggestion` 对象（包含 prompt）

2. **父组件接收建议**
   - 调用 `setSuggestedPrompt(suggestion.prompt)`
   - 将 prompt 传递给 ChatInputArea

3. **ChatInputArea 处理建议**
   - `useEffect` 监听到 `suggestedPrompt` 变化
   - 自动填充到 textarea
   - 显示快速发送按钮
   - 聚焦到 textarea

4. **用户可以选择**：
   - ✅ 点击快速发送按钮 → 立即发送
   - ✅ 按 Shift+Enter → 发送
   - ✅ 编辑内容 → 快速发送按钮消失，正常发送

## 关键特性

### 自动隐藏逻辑
```typescript
// 用户编辑时隐藏快速发送按钮
const onTextAreaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
  setInputContent(e.target.value)
  if (showQuickSendButton) {
    setShowQuickSendButton(false)
  }
}, [showQuickSendButton])
```

### 平滑动画
```css
/* 快速发送按钮动画 */
animate-in slide-in-from-bottom-2 fade-in duration-300
```

### 样式亮点
- 使用 `bg-primary` 和 `text-primary-foreground` 自动适配主题
- 阴影和 hover 效果
- 小巧的 CornerDownLeft 图标提示 Enter 键

## 下一步优化建议

1. **自动隐藏超时**：3 秒后自动隐藏按钮
   ```typescript
   useEffect(() => {
     if (showQuickSendButton) {
       const timeout = setTimeout(() => {
         setShowQuickSendButton(false)
       }, 3000)
       return () => clearTimeout(timeout)
     }
   }, [showQuickSendButton])
   ```

2. **撤销功能**：显示 toast 提供撤销选项

3. **键盘快捷键提示**：在按钮旁显示 "Shift+Enter" 提示

4. **状态反馈**：发送中显示 loading 状态

## 测试清单

- [ ] 点击卡片后，prompt 正确填充到 textarea
- [ ] 快速发送按钮正确显示
- [ ] 点击快速发送按钮，消息成功发送
- [ ] Shift+Enter 也可以发送
- [ ] 编辑内容后，快速发送按钮消失
- [ ] 发送后，按钮消失，input 清空
- [ ] 按钮动画流畅
- [ ] 在亮色/暗色主题下都正常显示

## 文件修改总结

### ChatInputArea.tsx
- Line 50: 添加 `suggestedPrompt?: string` prop
- Line 91: 添加 `showQuickSendButton` 状态
- Line 206-229: 修改 `onTextAreaChange` 和添加 `useEffect` 监听 `suggestedPrompt`
- Line 592-604: 添加快速发送按钮 UI

### 需要创建的文件
- `ChatWindow.tsx` 或类似父组件，连接 WelcomeMessageNext2 和 ChatInputArea
