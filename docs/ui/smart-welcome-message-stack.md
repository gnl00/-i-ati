# Smart Welcome Message Stack

## 目标

`SmartWelcomeEntrance` 把欢迎页从卡片列表改成一个有空间深度的消息入口。它表达的是一个主推荐和两个潜在推荐，通过层级、错位、透明度、模糊和轻微浮动让用户理解下面还有可选内容。

入口保持克制：页面负责给出一个明确行动建议，点击后把可执行 prompt 回填到 ChatInput，用户可以继续编辑再发送。

## 组件结构

```text
SmartWelcomeEntrance
├── SmartGreetingHero
├── SmartMessageStack
│   └── SmartMessageLayer × 3
└── SmartFooterHint
```

相关文件：

- `src/renderer/src/components/chat/welcome/SmartWelcomeEntrance.tsx`
- `src/renderer/src/components/chat/welcome/SmartWelcomeMessage.css`
- `src/renderer/src/components/chat/ChatWindowComponentNext.tsx`
- `src/renderer/src/components/chat/chatInput/ChatInputArea.tsx`

## 文案模型

Smart message 使用两份文案：

```ts
interface SmartStackMessage {
  id: string
  title: string
  body: string
  actionPrompt: string
}
```

- `body`：展示给用户看的 trigger copy，语气可以更轻，例如 `Need a focused plan for today's work session?`
- `actionPrompt`：回填到输入框的明确指令，例如 `Help me create a focused plan for today's work session.`

这个拆分避免把疑问句或引导句直接发送给模型，也让后续可以单独优化展示文案和执行 prompt。

## 交互状态

`SmartMessageStack` 维护两个 index：

```ts
const [hoverIndex, setHoverIndex] = useState<number | null>(null)
const [activeIndex, setActiveIndex] = useState<number | null>(null)
const highlightIndex = hoverIndex ?? activeIndex
```

- `hoverIndex`：鼠标 hover 或键盘 focus 时的临时突出层。
- `activeIndex`：最近一次激活的层。
- `highlightIndex`：最终用于渲染 `hovered` / `dimmed` 的状态源。

hover/focus 时同步写入 `hoverIndex` 和 `activeIndex`。点击后 ChatInput 会获得焦点，message button 会 blur，`hoverIndex` 被清空，但 `activeIndex` 保留，所以视觉不会跳回第一层。

## 视觉规则

默认层级由 `depth` 计算生成。第一层作为基准，后续层按 index 推导 offset、scale、opacity、blur 和 z-index。

```ts
const direction = depth === 0 ? 0 : depth % 2 === 1 ? -1 : 1
const offsetX = depth === 0 ? 0 : direction * Math.max(24, 46 - depth * 5)
const offsetY = depth * 84
const offsetZ = 90 - depth * 46
```

这个规则避免写死三层样式。新增第四条、第五条 message 时，会自然沿 y 轴向下展开，并按奇偶层轻微左右错位。

高亮层：

- `opacity: 1`
- `blur: 0`
- `z-index: 5`
- 轻微 scale up
- shadow 增强
- arrow action 显示

非高亮层：

- `opacity: 0.42`
- `blur: 2.5px`
- scale 小幅降低
- `z-index: 0`

## 动效

动效只服务三个目标：

1. 进入时建立页面层次。
2. idle 时保留轻微呼吸感。
3. hover/focus 时强调当前可操作 message。

三层 bubble 都有浮动，幅度按深度递减：

- top：`-3px`
- mid：`-2px`
- bottom：`-1.5px`

CSS 提供 `prefers-reduced-motion` 分支，关闭入口和浮动动画，并缩短 transition。

## ChatInput 回填链路

点击 smart message 后执行：

```ts
onSuggestionClick?.(message.actionPrompt)
```

`ChatWindowComponentNext` 持有 `ChatInputAreaHandle`：

```ts
const chatInputRef = useRef<ChatInputAreaHandle>(null)

const handleWelcomeSuggestionClick = useCallback((prompt: string) => {
  chatInputRef.current?.fillInput(prompt)
}, [])
```

`ChatInputArea` 通过 `forwardRef` 暴露：

```ts
export interface ChatInputAreaHandle {
  fillInput: (text: string) => void
}
```

`fillInput` 会同步：

- React state：`inputContent`
- textarea DOM value
- slash command input state
- textarea focus
- caret overlay

## 样式边界

基础布局、排版、颜色、按钮外观尽量使用 Tailwind class 放在 TSX 中。CSS 文件只保留 Tailwind 不适合承载的部分：

- CSS variables
- 3D stack transform
- hovered / dimmed 状态组合
- pseudo-elements
- keyframes
- container query
- reduced motion

这个边界让组件结构和静态样式更容易在 TSX 中阅读，同时保留复杂空间状态的可维护性。

## 后续优化方向

- 为 `SmartStackMessage` 增加来源上下文，例如最近聊天、任务计划或本地 follow-up。
- 给 arrow action 扩展直接发送能力，bubble 点击继续保持回填。
- 增加键盘操作说明和更明确的 `aria-describedby`。
- 根据当前时间段或工作区上下文动态生成 `actionPrompt`。
