# WelcomeMessageNext2 使用说明

## 方案 4 实现：预览 + 快速发送

### 核心设计

当用户点击示例卡片时：
1. 将 prompt 填充到 chatinput 的 TextArea
2. 在 chatinput 旁边显示"快速发送"按钮
3. 用户可以：
   - 按 Enter 发送
   - 点击"快速发送"按钮
   - 或先编辑内容再发送

### 组件接口

```typescript
interface Suggestion {
  icon: string
  title: string
  description: string
  prompt: string  // 完整的 prompt 文本
}

interface WelcomeMessageProps {
  className?: string
  onSuggestionClick?: (suggestion: Suggestion) => void
}
```

### 父组件实现示例

```typescript
import React, { useState, useRef } from 'react'
import WelcomeMessage from './WelcomeMessageNext2'

const ChatContainer = () => {
  const [inputValue, setInputValue] = useState('')
  const [showQuickSend, setShowQuickSend] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSuggestionClick = (suggestion: Suggestion) => {
    // 1. 填充到 TextArea
    setInputValue(suggestion.prompt)

    // 2. 显示快速发送按钮
    setShowQuickSend(true)

    // 3. 聚焦到 TextArea（可选）
    textareaRef.current?.focus()
  }

  const handleQuickSend = () => {
    // 发送消息
    sendMessage(inputValue)
    setShowQuickSend(false)
    setInputValue('')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    // 用户编辑时隐藏快速发送按钮（可选）
    if (e.target.value !== suggestion?.prompt) {
      setShowQuickSend(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleQuickSend()
    }
  }

  return (
    <div>
      <WelcomeMessage onSuggestionClick={handleSuggestionClick} />

      <div className="chatinput-container">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
        />

        {/* 快速发送按钮 */}
        {showQuickSend && (
          <button
            onClick={handleQuickSend}
            className="quick-send-button"
          >
            Send ↵
          </button>
        )}
      </div>
    </div>
  )
}
```

### 样式建议

快速发送按钮的样式：

```css
.quick-send-button {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 6px 12px;
  background: primary;
  color: primary-foreground;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  animation: slideIn 0.2s ease-out;
}

.quick-send-button:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 交互流程

1. **用户点击卡片** → `handleSuggestionClick` 被调用
2. **填充 prompt** → `setInputValue(suggestion.prompt)`
3. **显示快速发送** → `setShowQuickSend(true)`
4. **用户可以**：
   - 直接点击"快速发送"按钮
   - 按 Enter 键发送
   - 编辑内容后发送
   - 点击其他地方隐藏按钮

### 优化建议

1. **自动隐藏**：用户开始编辑时，隐藏快速发送按钮
2. **超时隐藏**：3 秒后自动隐藏按钮
3. **动画过渡**：按钮出现/消失时添加平滑动画
4. **状态反馈**：发送时显示 loading 状态

### 下一步

需要在实际项目中：
1. 找到 chatinput 组件的位置
2. 修改 chatinput 组件以支持快速发送按钮
3. 在父组件中连接 WelcomeMessageNext2 和 chatinput
