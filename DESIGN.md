# Design

## 文档定位

本文档是 @i 桌面应用的视觉设计入口，覆盖应用外壳、Chat、Welcome、Chat Sheet、Settings、Artifacts、弹窗、选择器和输入区域。它记录当前已经落地的设计语言，也规定后续 Dark Mode 一体化改造的方向。

实现以当前代码为准，核心来源包括：

- `src/renderer/src/shared/assets/main.css`：应用级语义 token、Chat 别名、背景和全局动效。
- `src/renderer/src/shared/assets/base.css`：字体栈与基础渲染。
- `src/renderer/src/shared/components/ui/`：共享控件与按钮 token。
- `src/renderer/src/features/chat/`：Chat、Welcome、Sheet、composer 和消息结构。
- `src/renderer/src/features/settings/common/SettingsLayout.tsx`：Settings 布局与控件原语。
- `docs/ui/settings-design-language.md`：Settings 详细设计规则。
- `docs/ui/smart-welcome-message-stack.md`：Welcome 消息入口与空间动效。
- `docs/guides/development/tailwindcss-v4-syntax-rules.md`：Tailwind CSS v4 语法。

`.impeccable.md` 保存产品用户、品牌气质与设计背景。本文档负责可执行的全局视觉规范，功能专项文档负责组件内部机制。

## 1. 视觉主题与气质

@i 是面向开发者、操作者和高频 AI 用户的桌面工作台。Chat 是视觉中心，Settings、Artifacts、任务、确认卡片和 selector 为当前会话提供上下文与控制能力。

整体气质由四个关键词定义：

- **Calm**：大面积中性色承载长时间阅读，色彩集中在状态和关键行动。
- **Capable**：高信息密度、稳定尺寸和清晰状态让高级功能保持可控。
- **Technical**：精确边界、紧凑标签、等宽数据和结构化面板表达工具属性。
- **Warm**：Welcome、emotion 和轻量动效为日常使用保留人格感。

视觉风格是原生桌面工作台与轻质数字纸面的结合：

- 浅色模式使用暖白画布、半透明白色 surface、柔和阴影和细边界。
- 暗色模式使用低彩度 graphite 画布，通过亮度阶梯、hairline border 和局部阴影建立层级。
- Chat 背景保留低透明度点阵纹理，点阵服务于空间感和长内容定位。
- 内容区域保持克制，主行动和语义状态获得明确强调。

## 2. 颜色体系与语义 token

### 2.1 CSS 策略

项目采用一套 CSS 策略：Tailwind CSS v4 utility class 配合 `main.css` 中的语义 CSS custom properties。复杂空间变换、伪元素、keyframe、container query 和 reduced-motion 分支保留在组件 CSS 中。

新组件先选择语义 token，再组合 Tailwind v4 utility。变量引用使用 v4 语法，例如 `dark:bg-(--app-surface-raised)`。

### 2.2 应用级 surface

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `--app-canvas` | `#f9f9f9` | `oklch(19% 0.006 250)` | 应用画布、Sheet 和大型弹窗底层 |
| `--app-surface` | `rgb(255 255 255 / 0.78)` | `oklch(22.5% 0.007 250)` | 主面板和连接型工作区 |
| `--app-surface-raised` | `rgb(255 255 255 / 0.88)` | `oklch(25% 0.009 250)` | 卡片、selector、popover 和抬升控件 |
| `--app-surface-hover` | `rgb(248 250 252 / 0.82)` | `oklch(27% 0.011 250)` | hover、active tab 和当前选项 |
| `--app-surface-inset` | `#f1f5f9` | `oklch(17.5% 0.006 250)` | 输入框、搜索框和内部列表 |
| `--app-scrim` | `rgb(15 23 42 / 0.18)` | `rgb(0 0 0 / 0.46)` | Sheet 与模态层遮罩 |

暗色层级按以下顺序使用：

```text
inset 17.5% < canvas 19% < surface 22.5% < raised 25% < hover 27%
```

层级主要由亮度差表达。边框负责结构确认，阴影负责浮层与大型悬浮容器。

### 2.3 边界、文字与强调

| Token | Dark value | 角色 |
|---|---|---|
| `--app-border-subtle` | `rgb(218 225 234 / 0.06)` | 内部分隔、连续列表和低优先级轮廓 |
| `--app-border-standard` | `rgb(218 225 234 / 0.105)` | 控件、卡片、popover 和 panel 边界 |
| `--app-text-primary` | `oklch(92.5% 0.006 250)` | 标题、关键值、选中项和正文强调 |
| `--app-text-body` | `oklch(81.5% 0.012 250)` | 正文、主要标签和默认图标 |
| `--app-text-secondary` | `oklch(65% 0.018 250)` | 次级信息、元数据和辅助操作 |
| `--app-text-muted` | `oklch(55% 0.018 250)` | placeholder、时间、不可用状态和说明 |
| `--app-accent` | `oklch(69% 0.04 250)` | focus、链接、活动指示和低幅强调 |
| `--app-accent-strong` | `oklch(77% 0.045 250)` | hover 后的强调与高优先级可交互文字 |

`--chat-*` 是应用 token 的 Chat 语义别名。Chat、composer、message、header 和 tool segment 使用别名，视觉数值与应用级层级同步。

### 2.4 语义色

中性色承担界面主体，语义色承担明确含义：

- emerald 和 teal：成功、已连接、完成、视觉能力。
- amber 和 orange：待处理、队列、MCP、提醒。
- rose 和 red：停止、失败、删除和风险确认。
- blue 和 sky：工作区、焦点、局部选中和信息状态。
- violet 和 purple：Artifacts、能力分类和特定功能域。

语义色以文字、图标、细边框、浅 tint 或状态点呈现。大面积背景继续使用 graphite 层级。品牌图标保留品牌色，单色图标使用语义文字色和 CSS mask。

## 3. 排版规则

### 3.1 字体栈

应用使用系统优先的无衬线字体：

```css
Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif
```

代码、路径、token 数量和调试数据使用 `font-mono`。界面保持 `text-rendering: optimizeLegibility` 与平台字体平滑。

### 3.2 字号与层级

| 场景 | 推荐规格 |
|---|---|
| Welcome hero | `clamp(34px, 5.6cqi, 62px)`，600，紧字距 |
| 页面或大型弹窗标题 | 15px 至 22px，600 |
| Chat 标题与正文 | 14px，正文 400，标题和 strong 600 |
| Composer 输入 | 15px，500，24px 行高 |
| Settings section 标题 | 13.5px，600，轻微紧字距 |
| Settings 字段标签 | 12px 至 12.5px，500 |
| 工具栏、按钮和 meta | 10px 至 11px，500 或 600 |
| Uppercase eyebrow | 10px 至 11px，600，`0.14em` 至 `0.22em` 字距 |

中文与英文共享同一层级。长标题采用 truncate 或 line-clamp，正文采用明确 wrap，数字状态使用 `tabular-nums` 保持稳定。

## 4. 组件样式

### 4.1 应用外壳与 Header

- Header 高度保持 40px，窗口拖拽区域使用 `app-dragable`，交互元素使用 `app-undragable`。
- 标题居中，左右操作保持固定方形尺寸和稳定间距。
- 暗色 Header 使用半透明 `--chat-header-surface` 与顶部材料连续性。
- 图标按钮使用透明默认态、轻 surface hover、standard border hover 和 `active:scale-95`。
- emotion 是人格入口，尺寸克制，动效集中在出现、更新和退出。

### 4.2 按钮与行动层级

- Primary action 使用高对比填充、11px 中等字重、`h-7` 或场景指定高度。
- Send、Stop、New Chat 等核心行动保留可识别的横向宽度和稳定 hit area。
- Secondary action 使用透明或 outline surface，hover 提升至 `--app-surface-hover`。
- Icon action 采用固定 `h-8 w-8`，语义由 `aria-label`、tooltip 和状态共同表达。
- Destructive action 保留 rose 色文字与边界，确认态提高对比。
- Press feedback 采用 `scale(0.97)` 至 `scale(0.99)`，布局尺寸保持稳定。

### 4.3 输入框与 composer

- Chat composer 是界面的主要操作锚点，展开态使用 24px 圆角、raised surface 和 44px 底部 action row。
- Welcome composer 的折叠态使用 pill 轮廓，展开后进入完整输入面板。
- 输入正文使用透明背景，外层 surface 负责材质、边界和 focus 层级。
- Model selector、approval mode、Workspace 和 Send 共享高度、圆角、间距与暗色 material。
- 输入、搜索和内部编辑区使用 `--app-surface-inset`，形成向内的空间关系。
- placeholder 使用 muted text，focus 通过 border、ring 和 surface 变化表达。

### 4.4 Selector、popover 与 menu

- trigger 使用 raised surface、8px 至 10px 圆角和 standard border。
- popover 使用 10px 圆角、raised surface、standard border 和受控阴影。
- search 区使用 inset surface，provider header 使用安静的 sticky 分组样式。
- hover 与键盘 current state 使用 `--app-surface-hover`，selected state 同时显示 check 或明确图标。
- Settings selector 使用独立 `variant="settings"`，Chat 与 drawer variant 保持各自密度和交互契约。
- Dark Mode 浮层使用清晰材质边界，backdrop blur 收敛到 0。

### 4.5 Tabs

- tab bar 使用固定高度和紧凑间距，活动项通过轻背景、细边框和 600 字重表达。
- 活动项采用完整圆角矩形，顶部和底部 padding 保持视觉居中。
- 顶层 tab content 切换采用同步呈现，内容区域保持已挂载状态时维持稳定生命周期。
- 内容内部的 loading、empty state 和进度反馈可以使用局部进入动效。
- 对外文案使用 `Overview`，内部稳定状态键可以继续使用 `stats`。

### 4.6 卡片、列表与 disclosure

- 常规卡片使用 12px 圆角，紧凑控件和 disclosure 使用 8px 至 10px 圆角。
- Settings section 使用 raised surface、standard border 和连续 footer 或 inset region。
- 连续工具调用与任务列表使用外层容器加 subtle separator，减少重复卡片边框。
- Think、Work completed 和 tool call header 使用一致宽度、padding、10px 圆角与状态布局。
- 状态图标、duration 和 chevron 保持固定槽位，展开时内容与 header 边界连续。

### 4.7 Sheet、Settings 与右侧面板

- Chat Sheet 使用 app canvas、standard 外边界和 app scrim，New Chat 是清晰的主行动。
- Task Board 使用一层 raised panel，内部 summary、状态和任务通过 spacing 与 separator 组织。
- Settings 使用一体化工作区：标题、保存状态、tab bar 和 active content 共享外框。
- Settings 内容采用四阶材料：popover canvas、settings surface、raised content panel、inset input/list。
- Providers 保留低幅蓝色 selection rail 和品牌图标反馈，表单与列表继续使用 graphite token。
- 右侧 Artifacts panel 使用 surface 外壳、raised tab bar 和 compact tabs。Overview、Tools、Preview、Files 共享一致的切换体验。

## 5. 布局与空间原则

- Chat 保持最大的阅读面积，消息列和 composer 是主布局锚点。
- 工具栏、selector 和状态控件采用稳定高度，内容变化通过 truncate、wrap 和 tooltip 消化。
- Settings 采用高密度桌面布局，section 内部使用 8px 至 16px 的节奏。
- Welcome 使用容器查询和 `clamp()`，hero、卡片堆栈和 composer 随可用空间缩放。
- Side panel 在宽容器中使用 push layout，在 648px 以下使用 overlay layout。
- Side panel 目标最小宽度为 320px，overlay 最大宽度为 480px，视口保留 24px inset。
- 弹窗和 selector 使用 viewport 约束，例如 `min(380px, calc(100vw - 2rem))`。
- 长会话中的 composer 固定在可达位置，消息区承担滚动。

常用空间节奏：

```text
4px  微调、图标内部间距
8px  紧凑控件与 toolbar gap
12px 字段和卡片内部节奏
16px section padding 与主要行间距
24px 独立区域和大型 surface 间距
```

## 6. 深度、边界与阴影

深度遵循以下规则：

1. 大型背景使用 canvas。
2. 连接型工作区使用 surface。
3. 独立卡片、popover 和 selector 使用 raised。
4. 输入与搜索使用 inset。
5. hover 和 active control 使用 hover surface。

Dark Mode 的 border 通常使用 6% 或 10.5% 的浅色透明度。内部 separator 使用 subtle，控件轮廓和浮层使用 standard。

阴影按浮动程度分配：

- 内嵌列表、连续 row 和 Settings section 使用零阴影或极轻阴影。
- composer、popover、Sheet 和大型弹窗使用低透明度黑色阴影。
- Welcome 卡片可使用更宽的软阴影表达空间深度。
- 边界和亮度阶梯已经清楚时，阴影保持最低有效强度。

Blur 是浅色玻璃材质与特定遮罩的辅助工具。Dark Mode 主 surface、popover、composer 和内容 panel 使用清晰 graphite 材质。Header、Sheet scrim 和少量氛围层可以保留轻 blur。

## 7. 动效与反馈

动效用于入口、状态改变、层级展开和直接操作反馈。

- 控件 hover 和 press：150ms 至 200ms。
- popover：打开 150ms，关闭 100ms，使用 scale 与 4px 内的位移。
- 普通内容进入：200ms 至 300ms，低幅 opacity 与 translate。
- Welcome 和 composer 结构变化：360ms 至 560ms，使用 `cubic-bezier(0.16, 1, 0.3, 1)`。
- 侧栏：spring duration 约 420ms，低 bounce。
- progress、spinner 和 shimmer 只出现在运行状态。

所有持续动画和位移动效提供 `prefers-reduced-motion` 分支。Tab 切换优先保证首帧内容完整，顶层 tab panel 使用同步显隐。Hover motion 以颜色、边框、阴影、opacity 和小幅 scale 为主。

## 8. 推荐做法与约束

| 推荐做法 | 约束 |
|---|---|
| Surface 使用 `--app-*` 或 `--chat-*` token | 功能代码中的新 surface 颜色保持语义化 |
| 状态色表达成功、警告、危险和能力类别 | 大面积工作区由中性色承担 |
| 通过亮度阶梯和 separator 组织连续内容 | 每一行保持稳定高度和对齐槽位 |
| 复用 Settings、button、selector 和 Radix primitives | 新原语需要明确的跨 feature 复用价值 |
| 为图标按钮提供 `aria-label` 和 tooltip | 单靠图标形状的操作保持可解释 |
| 品牌图标保留色彩，单色图标跟随主题 | 图标状态由语义文字色统一管理 |
| 每个 section 最多使用一个圆点装饰主题 | 重复信息优先采用 chip、line、icon 和结构形状 |
| 高级操作保持紧凑，核心行动保持可识别宽度 | 所有交互目标保留稳定 hit area |
| Electron 真实窗口同时检查 Light 与 Dark | CSS、测试和 build 作为结构验证 |

## 9. 响应式与无障碍

- 组件以可用容器为基准，优先使用 container query、`min()`、`max()` 和 `clamp()`。
- 窄窗口保持主要操作可达，secondary label 可以 truncate，图标和状态槽位维持稳定。
- Sheet 和 side panel 在窄容器切换为 overlay，主 Chat 继续保持最小可读宽度。
- focus-visible 使用 semantic accent 或 standard border，ring 保持清晰且贴合控件圆角。
- 颜色、图标和文字共同表达重要状态。
- hover、focus、active、disabled、loading、empty 和 error 都有明确视觉反馈。
- 动态区域维持稳定挂载或提供清楚 loading state，键盘操作与屏幕阅读器标签同步更新。

## 10. Dark Mode 一体化方向

Dark Mode 的目标是一个连续的 graphite 桌面工作台。应用外壳与功能面板共享同一条材料链，局部 feature 通过内容结构和语义色表达身份。

一体化顺序：

1. 应用外壳、Header、Chat canvas 和主 composer 统一 `--app-*` 与 `--chat-*`。
2. Welcome、Chat Sheet、Settings 和 Artifacts 使用相同 canvas、surface、raised、hover、inset 阶梯。
3. selector、approval menu、tooltip、popover、drawer 和 confirmation 使用统一浮层材料。
4. tool call、Think、Work completed、任务和列表使用统一 disclosure 与 separator 规则。
5. 局部 `gray`、`slate` 和 `zinc` surface 在改造时映射到语义 token。
6. 语义色、品牌图标、代码高亮和数据可视化保留各自功能色。

完成标准：

- 相邻 surface 的层级通过亮度、边界和空间关系清晰可读。
- 同类控件在 Chat、Settings、Sheet 和 side panel 中拥有一致状态反馈。
- popup 与宿主页面保持同一色温和同一 graphite 轴。
- 内容密集页面维持清晰文字层级，长时间阅读保持平静。
- Light Mode 同步检查结构、padding、active state 和文字层级。

## 11. Agent 实施指南

进行 UI 改动时遵循以下顺序：

1. 阅读本文件、相关 feature 文档、组件 exports、直接 callers 和共享 utilities。
2. 确认组件所属层级：canvas、surface、raised、hover 或 inset。
3. 使用现有 token 与 primitive，保留功能状态和交互契约。
4. 在 TSX 中承载布局、静态样式和常规状态。
5. 在组件 CSS 中承载复杂 transform、keyframe、伪元素、container query 和 reduced-motion。
6. 为视觉状态添加聚焦测试，覆盖 active、open、selected、disabled 或 mount lifecycle。
7. 在 Electron 真实窗口检查 Light、Dark、桌面宽度和紧凑宽度。

验证命令：

```bash
pnpm run typecheck:web
pnpm run check:renderer-boundaries
pnpm run check:renderer-doc-paths
pnpm run test:renderer-architecture
pnpm exec electron-vite build
```

视觉改动的交付记录应包含影响面、验证命令、真实窗口检查结果和截图路径。设计 token、共享组件契约或全局视觉规则发生变化时，同步更新本文档与相关专项文档。
