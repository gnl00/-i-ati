# Welcome Assistant Selector

## 背景

`SmartWelcomeEntrance` 的主任务是帮助用户快速开始一次对话：展示问候语、智能推荐消息，并把选中的推荐 prompt 回填到输入框。

assistant 选择、新增和编辑属于对话配置能力。此前入口以底部 badge row 的形式出现在欢迎内容流中，和智能推荐消息处在同一视觉层级。新增编辑能力后，底部区域会承载选择、新增、编辑三类操作，整体信息密度上升。

本次改动把 assistant 管理收敛为右上角的轻量状态入口，完整操作放进 popover 和 drawer 中。

## 目标

- 欢迎页主内容聚焦问候和智能推荐消息。
- 当前 assistant 以低存在感状态入口呈现。
- assistant 列表、切换、新增、编辑通过渐进披露完成。
- 编辑能力复用现有 `AddAssistantDrawer`，减少重复表单实现。
- 窄屏下入口保持可访问，并避免挤压主内容。

## 组件结构

```text
SmartWelcomeEntrance
├── SmartAssistantSelector
│   ├── PopoverTrigger
│   ├── PopoverContent
│   │   ├── General assistant option
│   │   ├── Assistant option list
│   │   └── New Assistant action
│   ├── AddAssistantDrawer create
│   └── AddAssistantDrawer edit
├── SmartGreetingHero
└── SmartMessageStack
```

相关文件：

- `src/renderer/src/features/chat/welcome/SmartWelcomeEntrance.tsx`
- `src/renderer/src/features/chat/welcome/SmartWelcomeEntrance.css`
- `src/renderer/src/features/chat/input/toolbar/AddAssistantDrawer.tsx`

## 交互设计

### 默认状态

右上角只展示一个单行 ghost pill：

```text
[Bot icon] Current Assistant [Chevron]
```

默认样式保持低存在感：

- 透明背景
- 透明边框
- 无阴影
- `opacity: 0.58`
- 高度 `28px`
- 单行 assistant 名称

hover、focus 或 popover 打开时，入口提升到 `opacity: 0.94`，并显示轻量背景和边框。

### 展开状态

点击入口打开 assistant popover：

- 顶部展示当前 assistant 名称和描述。
- 第一项为 `General`，代表默认对话配置。
- assistant 列表项展示名称、描述或模型名称。
- 当前选中项展示 `Check`。
- 每个 assistant 行右侧提供 `Pencil` 编辑按钮。
- 底部提供 `New Assistant` 动作。

编辑按钮默认隐藏，hover、focus-within 或当前选中时显示。这样列表保持可扫读，管理能力在需要时出现。

### 新增和编辑

新增 assistant：

```ts
setCreateDrawerOpen(true)
```

编辑 assistant：

```ts
setAssistantToEdit(assistant)
setEditDrawerOpen(true)
```

popover 会先关闭，再打开对应 drawer，避免两个浮层同时竞争焦点。

## AddAssistantDrawer 扩展

`AddAssistantDrawer` 新增了受控打开能力和自定义 trigger 支持：

```ts
trigger?: React.ReactElement | null
open?: boolean
onOpenChange?: (open: boolean) => void
```

用途：

- 默认用法保持原有 compact/card trigger。
- `trigger={null}` 时只渲染 drawer 内容，由外层组件控制打开状态。
- `open/onOpenChange` 支持 `SmartAssistantSelector` 统一管理 create/edit drawer。

这个扩展让 welcome selector 复用已有创建和编辑表单，同时保持其他调用方的原有行为。

## 状态来源

`SmartAssistantSelector` 读取：

```ts
const { getModelOptions, providersRevision } = useAppConfigStore()
const { assistants, currentAssistant, setCurrentAssistant, loadAssistants, isLoading } = useAssistantStore()
```

本地状态：

```ts
const [popoverOpen, setPopoverOpen] = useState(false)
const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
const [editDrawerOpen, setEditDrawerOpen] = useState(false)
const [assistantToEdit, setAssistantToEdit] = useState<Assistant | null>(null)
```

assistant detail 显示优先级：

1. `assistant.description`
2. `modelOptions` 中匹配的模型 label
3. `Custom instructions`

## 样式边界

TSX 中保留静态结构和 Tailwind class：

- trigger 尺寸和默认视觉状态
- popover 内容布局
- assistant option 行
- 新增和编辑操作按钮

CSS 文件只处理跨状态和响应式规则：

- `.smart-assistant-selector` 绝对定位
- 默认和交互态 opacity
- container query 下的居中布局

窄屏规则：

```css
@container (max-width: 560px) {
  .smart-assistant-selector {
    left: 18px;
    right: 18px;
    top: 14px;
    display: flex;
    justify-content: center;
  }
}
```

## 可访问性

- trigger 使用 `aria-label` 表达当前 assistant。
- trigger 使用 `aria-expanded` 表达 popover 状态。
- assistant 切换按钮使用 `aria-pressed` 表达选中状态。
- 编辑按钮使用 `aria-label` 和 `title` 表达编辑目标。
- hover 显示的编辑按钮在 focus-visible 时也可见，键盘用户可以访问。

## 验证

已执行：

```bash
pnpm run typecheck:web
git diff --check
```

## 相关提交

```text
4797684 refactor: simplify welcome assistant selector
```

## 后续方向

- 把 `SmartAssistantSelector` 拆成独立文件，降低 `SmartWelcomeEntrance.tsx` 体积。
- 为 assistant option 增加键盘方向键导航。
- 在 popover 中展示 assistant 绑定模型的 provider 名称。
- 为 assistant 编辑 drawer 增加删除入口和安全确认流程。
