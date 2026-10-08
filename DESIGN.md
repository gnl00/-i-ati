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

### 2.5 全局 scrollbar

可见滚动容器共用 `src/renderer/src/shared/assets/main.css` 的 Chromium WebKit scrollbar 外观。交互通道为 10px，静止 thumb 的视觉宽度约 4px，hover 与 active 状态扩大到约 6px；track 与 corner 保持透明，thumb 使用完整圆角，状态切换保持即时呈现。

- Light 使用 slate 中性色 thumb，Dark 使用低彩度浅灰 thumb，`color-scheme` 跟随当前主题。
- 固定深色代码与输出容器使用 `scrollbar-code-surface`，通过局部 scrollbar token 保持浅色 thumb 与 `#09090b` 材质的对比度。
- `no-scrollbar`、composer textarea、横向 toolbar、tabs 与搜索结果 carousel 继续使用隐藏型 scrollbar 规则。
- 全局规则负责 scrollbar 外观；每个容器继续拥有 `overflow`、`overscroll`、scroll chaining、virtualizer anchoring 与 `scrollbar-gutter` 行为语义。
- macOS 主窗口开启 Electron 内建 `scrollBounce`，由 Chromium 提供滚动边界回弹；消息列表保留 `overscroll-contain`，其他滚动容器遵循各自的 chaining 规则。此开关作用于主窗口内所有滚动区域；Windows 和 Linux 保持平台默认行为。

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

### 3.3 Assistant Markdown

助手正文采用 14px、400 字重、1.8 行高；标题与重点使用 600 字重。
段落上下间距为 10px，标题上方 24px、下方 12px。普通渲染与流式渲染共用
`chat-assistant-prose`。正文采用清晰的中性墨色（Light `#343940`，Dark `#d0d3d7`）。

行内代码使用等宽字体、正文 88% 的字号、400 字重、1px / 3px padding 与 3px 圆角；
Light 使用 `#f0f2f4` 底色和 `#343a41` 文字，Dark 使用 `#2e3135` 底色和 `#e0e2e5`
文字。隐藏装饰性反引号，长 token 允许换行。链接沿用现有强调与下划线，
独立代码块沿用原有高亮与复制控件。

用户消息与助手正文的完整 Markdown 渲染将单美元符按字面文本显示，保留
`$20`、`$30 / Plus $100` 等货币内容。行内公式使用 `$$…$$`，块级公式使用
独占行的 `$$` 分隔符；`$x$` 显示为普通文本。

表格采用 Ledger 样式：完整浅色 / graphite 表面、9px 圆角细外框、首列轻底色与
列分隔线，表头使用中性 inset 底色。表格文字为 13px、1.75 行高，表头 padding
为 10px / 16px，单元格为 16px。外部滚动容器提供局部横向滚动与上方 16px、
下方 32px 的留白，末行不重复绘制底边。两列表格最小宽度为 700px，
首列为 24% 且至少 230px；首列内代码作为任务标签使用系统字体和 500 字重、无底块。
表格采用自动布局，保留 Markdown 对齐与语义结构。

## 4. 组件样式

### 4.1 应用外壳与 Header

- Header 高度保持 40px，窗口拖拽区域使用 `app-dragable`，交互元素使用 `app-undragable`。
- macOS 使用系统原生交通灯：绿色按钮默认切换全屏，按住 Option 时切换为 Zoom；窗口态下 Renderer 为原生控件保留 52px 布局宽度，进入全屏后移除整段占位并在退出全屏时恢复。左侧业务按钮组保持持久挂载，通过 160ms strong ease-out position FLIP 衔接全屏事件引发的水平位移；初始状态查询与 reduced-motion 使用即时落位。Windows 与 Linux 使用自绘窗口控制。
- 标题居中，左右操作保持固定方形尺寸和稳定间距。
- Light 与 Dark Header 共用半透明 `--chat-header-surface`；浅色 token 从 `--chat-canvas` 混合 82% 画布色，让顶部磨砂层与 Chat 纸面连续。
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
- Chat 模型选择弹层使用 380px 宽度并受视口可用宽度约束，模型行保持单行；名称占据剩余宽度，超长名称通过 title 提示完整内容。Vision 与 Thinking 使用 12px 图标、英文语义标签及 title 提示，不带能力徽标底色；列表不展示 Thinking 档位文字，档位在底部模型入口与子菜单中展示。勾号仅在选中行出现，不预留空槽位，使用无底框样式；能力图标与子菜单箭头保持紧凑排列，Thinking 子菜单保持原交互。
- Chat 与 Welcome composer 的模型入口共用名称优先和轻量档位展示规则，按内容自然取宽，最小 206px、最大 280px；模型名称使用 11px semibold，Thinking 档位使用 10px medium 次级文字与句首大写（`Extra high`），不带徽标底色。两者共用单一模型菜单入口，名称超长时截断并保留完整名称 tooltip，档位与箭头保持可见。Welcome baseline 的模型与审批组合最大 360px，模型入口填满自身 flex 槽位并允许在窄容器收缩，长名称在按钮内截断，避免溢出覆盖审批按钮；保留 baseline 材质与交互生命周期。
- composer 底部 workspace 按钮：默认 `workspaces/<UUID>` 与 `workspaces/tmp` 显示 `tmp`，包括定时任务继承的源会话目录，自选目录显示末级目录名，未确定路径时显示 `Workspace`；已有路径的悬浮提示保留完整路径。三个按钮变体共用这一规则。
- Welcome composer 的折叠态使用 pill 轮廓，展开后进入完整输入面板。工具栏焦点与模型、审批菜单交互保持输入面板展开；只有正文 textarea 焦点激活 Welcome 背景反馈。菜单关闭期间持续保持展开，退出动画结束并完成 trigger 焦点恢复后再释放交互保持状态；底部 action row 隔离 click，disabled Send 保留自身 hit area。
- Chat 与 Welcome composer 共用磨砂材质：浅色乳白背景约 75% 不透明，深色 graphite raised 背景约 80% 不透明，使用 `backdrop-filter: blur(20px)`、细边框与轻阴影；正文和操作控件保持清晰，Chat 消息视口延伸至窗口底部，composer 覆盖其上；消息列表底部留白随 composer 实际高度更新，滚动到底时最后一条消息完整露出，跳至最新按钮保持在 composer 上方。输入区底部 4px 留白使用 `--chat-canvas` 遮底，避免消息从窗口底边清晰露出。
- 提交、流式输出和取消期间，composer 玻璃层及其父层保持整体 opacity 为 1，避免背景采样边界改变；运行状态通过 Stop 按钮和进度条表达，控件弱化仅作用于具体控件。
- 单次文本粘贴达到 8,000 字符，或至少 2,000 字符且达到 100 行时，生成 `pasted-text-N.txt` 文本附件。附件在正文上方独立占位，使用现有 Chat surface、细边界与 12px 名称、10px 元数据；纯文本预览即时展开，内部最大 160px 滚动。附件区最大 240px 内部滚动，名称截断且完整名称可访问，显示 UTF-8 字节数与行数。操作为 `Paste as text`、`Download`、`Remove`，恢复正文时回到粘贴锚点与输入焦点；只含附件时允许发送。历史消息沿用同一附件展示，保留原始换行，内容以纯文本显示。
- 已激活 skills 在 Chat 与 Welcome composer 内使用独立 `Skills` 插槽，位于队列条下方、附件和正文上方，插槽使用 16px 水平内边距。标签使用中性 hover surface、细边界、6px 圆角、24px 高度和 11px 等宽名称；超长名称在 160px 内截断，保留完整 title 和可访问文本。默认显示前 3 个，`+N` 展开其余项，`Show less` 收起；技能区域换行并在 96px 高度内滚动。显示当前会话的持久化激活状态，发送正文后保留，切换会话重置展开状态；有激活技能时 Welcome 保持展开。每个标签末端使用始终可见的独立 × 停用按钮，保留完整名称的 `Deactivate <name>` 提示与键盘焦点样式；只点击 × 执行停用。运行、技能更新、阻塞后处理、未答问题或队列编辑期间禁用停用。停用完成后刷新当前会话的持久化激活状态，失败时保留标签并提示；展开与停用保持正文、附件、焦点和选区。
- 输入正文使用透明背景，外层 surface 负责材质、边界和 focus 层级。Chat 与展开后的 Welcome composer 正文从 96px 起随内容增长，上限为 `min(240px, 25dvh)`，超出后正文内部滚动；底部 action row 保持可见，Chat 底部锚定并向上增长。附件在正文上方独立占位，删除与清空即时回缩，逐行增长不添加高度过渡。Chat 顶部保留拖动条；手动调整后正文使用固定高度（96px 至 60dvh），随窗口缩小受 60dvh 约束；双击拖动条或按 Enter / Home 恢复自动高度，方向键每次调整 24px。手动高度仅保留在当前挂载的 Chat 输入区，不持久化；Welcome 保持自动高度。
- Model selector、approval mode、Workspace 和 Send 共享高度、圆角、间距与暗色 material。
- 输入、搜索和内部编辑区使用 `--app-surface-inset`，形成向内的空间关系。
- placeholder 使用 muted text，focus 通过 border、ring 和 surface 变化表达。Composer 使用 textarea 原生 placeholder，共享正文的字号、行高和内边距；textarea 与自绘光标位于同一个文字区域，附件增删只移动该区域，避免独立定位偏差。
- 自绘光标保持 3px 蓝色核心、柔和光晕、1.5s 呼吸和蓝色输入 / 红色退格拖尾；位置过渡保留 120ms，使用 `cubic-bezier(0.16, 1, 0.3, 1)` 快速起步、柔和收尾，拖尾仍为 300ms 渐隐。输入、选区、滚动、聚焦与 resize 合并到帧调度；拖尾只由当前动画清理，并按使用顺序复用。相同文字、UTF-16 选区与布局复用坐标，滚动只更新偏移，文字 / 选区 / 布局 / 字体加载变化后重新测量；reduced-motion 下保留即时位置反馈，关闭位移过渡、呼吸和拖尾。

### 4.4 Selector、popover 与 menu

- trigger 使用 raised surface、8px 至 10px 圆角和 standard border。
- popover 使用 10px 圆角、raised surface、standard border 和受控阴影。
- Chat 与 Welcome 的 slash command 面板与 textarea 等宽并左对齐，在其上方保持 10px 间隔。面板使用 10px 圆角、raised surface、standard border 和轻阴影；通过 Portal 挂到 `document.body`，浅色使用 88% 乳白底与 24px backdrop blur，模糊背后正文并保持命令文字清晰，深色使用 graphite raised 实底且关闭 backdrop blur。命令行最小 40px 高，标题为 13px semibold，说明与等宽命令为 11px secondary text。选中与 hover 使用中性 surface-hover，当前行右侧显示裸 Enter 提示并保留固定槽位。面板容器小于 520px 时隐藏说明，完整说明保留在可访问名称中；命令保持完整可见，标题可截断。键盘打开、筛选和切换立即呈现，不使用弹簧缩放。
- `/sk:` 复用 slash command 面板列出可用 skills，已激活项显示轻量 `Active` 文字。候选列表高度上限为 `min(320px, 40dvh)`，超出后内部滚动，键盘选中项保持可见；加载、失败与无匹配状态在相同面板内用 secondary text 呈现。完整技能名称精确匹配；非精确名称先通过方向键或点击选择，Enter 提示只出现在可实际执行的选中项。
- search 区使用 inset surface，provider header 使用安静的 sticky 分组样式。
- hover 与键盘 current state 使用 `--app-surface-hover`，selected state 同时显示 check 或明确图标。
- Chat 模型 selector 的 thinking 子菜单使用 184px 宽度、10px 圆角与 32px 选项高度，直接从档位列表开始；当前模型档位使用轻背景与右侧裸勾，其他模型的默认档位使用 `Default` 标记。模型列表使用能力图标，不显示具体档位；入口与子菜单中的 `xhigh` 展示为 `Extra high`。档位选择一次确认模型与档位，并关闭菜单。
- Thinking 子菜单通过独立 Portal 脱离父菜单的 backdrop-filter 层：浅色使用 84% 乳白底与 24px backdrop blur，保留背景色块并模糊正文；深色使用 graphite raised 实底、standard border、轻背景选中态与受控阴影。
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
- 助手消息操作行的 token usage 位于右侧时间戳前，使用 12px 用量图标与 11px 系统字体数值，图标与数值间隔 4px；背景透明，无 badge padding、边框或圆角。操作图标、用量图标与数值、时间戳统一使用 Chat muted text token，用量图标不单独降低 opacity；按钮 hover 使用 Chat secondary text 与 hover surface，禁用按钮沿用同色并降至 50% opacity；usage 与时间戳之间使用 1×10px standard border token 竖线，竖线两侧各间隔 12px，仅两项同时存在时显示。详细用量保留在 tooltip 中。usage 与时间戳同组靠右，窄窗口时整组可换行靠右，整行沿用消息 hover 显示规则。
- 长用户消息使用 140px 折叠预览，实际内容超过 164px 时显示折叠操作。仅预览末尾 32px 渐隐，不叠加模糊；左下角使用 11px 次级文字与小箭头的 `Show more` / `Show less`，按钮左边缘与正文左边缘对齐，默认透明，hover 显示轻背景，保留 28px 点击高度。展开与收起即时切换，展开正文随内容自然增长；收起时若消息顶部已被视口或顶部 overlay 遮住，通过 MessageScroller 将该消息顶部恢复到可读位置。
- 用户消息的上传图片在正文气泡上方独立成行，与气泡右对齐并间隔 8px；单图 128×96px，多图 96×96px、8px 间距，窄窗口等比缩小，保留原图比例。最多显示四个缩略图，超过四张时末格以 `+N` 汇总包含该格在内的剩余图片；点击打开大图，支持左右切换、方向键、Escape 和关闭后焦点恢复。折叠只作用于正文，纯图片不显示空气泡，整条消息共用一组操作；Markdown 内嵌图片保持正文位置。图片加载失败显示固定尺寸 `Image unavailable` 占位。 缩略图默认使用 subtle border，hover 仅提升至 standard border 和轻 hover surface，颜色过渡 150ms；键盘 focus-visible 保留 accent ring。
- 消息与输入区附件共用 `shared/components/image-viewer` 图片查看器，统一预览、多图导航、错误占位和焦点恢复。输入区缩略图边框随图片比例贴合：高度上限沿用 Chat 64px / Welcome 58px，附件条保留横向滚动并隐藏滚动条以避免挤压图片，宽度自适应且最大 160px（均含边框与 2px padding）；宽图触及宽度上限时等比降低高度，极窄或极扁图保留 28px 最小按钮尺寸以容纳删除操作，保留原图自身白边，加载失败显示紧凑占位。删除按钮独立于预览触发器，hover 和键盘 focus 时可见，删除按钮 hover 保留图标 180° 旋转（300ms ease-in-out），reduced-motion 下不旋转；查看器覆盖 Welcome composer，附件删除、清空或替换时关闭旧预览。
- `image_show` 的输出图片保留在助手正文中，处理过程收起后仍可见。缩略图容器按原图比例收缩，最大 320×192px，随窗口宽度等比缩小，完整展示原图且不添加额外留白；说明和 Telegram 投递状态放在下方，以 secondary text 呈现。复用共享图片查看器、错误占位、键盘操作和关闭后焦点恢复。Telegram 状态使用 `Sent to Telegram`、`Telegram delivery failed`、`Telegram delivery pending` 或 `Telegram delivery unconfirmed`；历史加载只恢复图片和状态。
- 图片预览遵循来源轨迹：指针打开时，从当前缩略图的实际图片区域等比展开至大图（220ms strong ease-out），关闭时重新测量并回到当前图片的缩略图（180ms）；隐藏图片回到 `+N` 汇总格并渐隐。图片四周空白和外层遮罩均可点击关闭，图片、错误占位和导航按钮的点击保留自身行为；关闭后恢复当前缩略图焦点。遮罩同步渐变，控件在入场后段淡入，多图切换只在查看器内淡入（120ms）。快速关闭从当前视觉位置接续；来源离开可视区时使用 120ms 渐隐。键盘操作、reduced-motion 和缺少 WAAPI 时即时切换；窗口改变、偏好改变或卸载时取消旧动画。
- Settings section 使用 raised surface、standard border 和连续 footer 或 inset region。
- 连续工具调用与任务列表使用外层容器加 subtle separator，减少重复卡片边框。
- Chat 的整轮处理过程使用无卡片边框的次级文字标题、小箭头与连续列表；执行中展开，正常完成后统一收起。所有 text 分段按文本原序保留在正文，包括过程说明；后续 thinking 或工具调用不将先前正文移入 Work details。Work details 仅收纳 reasoning、工具与错误详情。短思考直接展示，工具行突出动作描述；独立工具详情保留原有布局。
- 处理过程内部的 reasoning 收起时以第一句作为可点击预览，后续有内容时追加省略号；无句末标点时取第一行。小号低对比度箭头放在首句前，收起向右、展开向下；触发区域默认透明，整行 hover 显示轻背景，箭头与文字同步提亮，颜色过渡 150ms（reduced-motion 即时切换）。展开后原位置显示整行可点击的 `Hide`，全文下沉至控件下方，首句只出现一次。鼠标展开时正文以 24px 下移与透明度过渡进入，收起文字从左向右显现，两者均为 220ms、`cubic-bezier(0.22, 1, 0.36, 1)`；键盘操作、初始展开和 reduced-motion 即时呈现，收起即时切换。正文保留选择、复制与 Markdown 交互，并保留高度上限与内部滚动。
- reasoning 内部滚动遵循原生 scroll chaining：内容可滚动时优先滚动内部，到达顶部或底部后继续滚动外层 Chat；wheel 和 touchmove 事件保持冒泡。
- reasoning 展开时的 1px 浅色引导线从开头箭头下方沿图标列延伸到内容底部；正文与收起态首句及相邻 toolcall 标题对齐。
- Work details 内重复的完成勾选与 reasoning 箭头采用 10px 可见尺寸、30% 默认不透明度；工具右侧展开箭头为 10px、20% 默认不透明度。保留原有图标槽位与文字起点，hover、键盘 focus-visible 和展开态提升至 80%。运行、失败和审批状态图标保留原尺寸与对比度；整轮标题箭头及独立工具行维持原样。
- 处理过程内的工具详情以 `Tool` 为首个区块标题，右侧紧凑排列等宽工具名浅底标识、低对比度耗时和参数复制入口；下方直接展示参数，不再单独占一行元信息。
- 处理过程标题与操作使用英文；耗时（不足一分钟如 `9s`，达到一分钟如 `3m45s`，整分钟如 `4m`）和工具次数（如 `3 tool calls`）使用低对比度浅色 badge，信息之间不使用圆点分隔。
- 状态图标、duration 和 chevron 保持固定槽位，展开时内容与 header 边界连续。

### 4.7 Sheet、Settings 与右侧面板

- Chat Sheet 使用 app canvas、standard 外边界和 app scrim，New Chat 是清晰的主行动。
- 左侧 Chat Sheet 出场使用 150ms ease-out，列表刷新延后至出场结束；关闭保持 300ms。角落提示的收起计时与 Sheet 出入场动画独立。
- 聊天与 Tasks 页面共用工作区左上角的透明触发角，位于 Header 下方，20×20px，层级在 Tasks 页面之上、Sheet 遮罩之下。静止时无可见提示；鼠标进入角落立即展开贴角的 56×56px 四分之一圆提示，浅色使用低不透明度冷灰磨砂玻璃，深色使用清晰的 graphite 材质，内部仅有指向右下的箭头。提示以左上角为原点，用小幅缩放与透明度在 190ms 内展开、140ms 内收起；键盘聚焦及 reduced-motion 下即时呈现。提示显示时，点击圆形或重叠的透明触发角均展开 Chat Sheet；提示隐藏时点击透明角区不展开。提示 2.5 秒后自动收起；鼠标进入提示时暂停计时，离开后重新计时；再次进入角落则收起提示。键盘聚焦角落可显示提示，提示支持 Enter 与 Escape。展开、外部打开或卸载时清理计时。
- 左侧 Chat Sheet 在 New Chat 上方保留紧凑 Task Board 摘要，仅显示最早 pending 任务与 Next run；无待执行任务时保留可点击空状态。整块点击关闭抽屉并进入主内容区 Tasks 页面。完整页面保留全局 Header 和左上角 hover 入口，以 All / Active / History 筛选、任务标题优先的紧凑列布局展示全局任务；窄屏改为堆叠行。页面仅保留全局 Header 标题，正文直接从筛选栏开始；通过侧栏选择会话或 New Chat 返回聊天，聊天正文保持挂载和布局尺寸以保留草稿及滚动位置。
- Tasks 列表通过标题旁的小箭头展开行内详情，展示真实任务指令、调度规则、时区和关联聊天入口。固定 UI 文案使用英文，任务原文保持原样；时间使用本地日历的 Today／Tomorrow 及完整日期 tooltip；取消任务与移除记录使用紧凑文字按钮，取消保持行内确认。Execution chat 在没有执行结果时显示 `--`，有结果时链接到结果消息所在会话。详情沿用轻 surface 与细分隔线，筛选栏保持现有样式。
- Settings 使用一体化工作区：标题、保存状态、tab bar 和 active content 共享外框。Header 采用紧凑两层：首行左侧仅显示 Settings，右侧显示静态保存状态与固定高度 Save；次行显示分类 tabs。省略品牌、版本、副标题、保存区背景与竖向分隔线；未保存使用静态 amber 圆点，禁用 Save 使用 inset surface 与 muted text，tabs 使用 subtle 边界并移除选中阴影。标题、tabs 与内容外壳共享 4px 左侧 inset。
- Settings 内容采用四阶材料：popover canvas、settings surface、raised content panel、inset input/list。
- Providers 保留低幅蓝色 selection rail 和品牌图标反馈，表单与列表继续使用 graphite token。
- 右侧 Artifacts panel 使用 surface 外壳、raised tab bar 和 compact tabs。Overview、Tools、Preview、Files 共享一致的切换体验；窄宽度下标签保持紧凑并允许横向滚动。任务更新保持当前标签和侧栏开关状态。
- Overview 内容统一使用 16px section padding、11px 次级标题和 12px 标题到数据间距。Auto Compact 标题右侧显示当前状态，数值与百分比同行；Activity 使用无独立卡片背景的三列数据和细分隔线，Light/Dark 保持相同结构。

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

历史会话首屏直接呈现已加载正文，保持文本与代码初始可见；Welcome 退场与消息进入动效用于新提交和实时响应。切换会话的异步加载期间保留当前内容或 Welcome，并提供轻量、非阻塞的 polite 状态反馈。历史消息壳保持连续布局，视口内及明确跳转目标的正文优先挂载。

指针选择历史会话成功后，ChatWindow 正文可视容器统一执行一次 180ms 的 `opacity: 0.6 → 1` 过渡，曲线为 `cubic-bezier(0.22, 1, 0.36, 1)`。Header、composer、Artifacts 和任务浮层保持原有呈现；正文容器保持稳定挂载与尺寸。键盘/辅助技术入口和 reduced-motion 使用即时显示，流式更新、历史补载及 disclosure 展开维持既有呈现。具体生命周期见[ChatWindow 入场指南](docs/guides/development/chat-window-entrance-animation.md)。

所有持续动画和位移动效提供 `prefers-reduced-motion` 分支。Tab 切换优先保证首帧内容完整，顶层 tab panel 使用同步显隐。Hover motion 以颜色、边框、阴影、opacity 和小幅 scale 为主。`hover:translate-x-*` 和 `hover:translate-y-*` 仅用于具有明确布局含义、符合空间关系的交互反馈。

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
4. 处理过程由单一 disclosure 管理，内部工具和思考使用轻量连续布局；任务和独立详情沿用共享 disclosure 原语。
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

## 12. 交互终端

TUI 沿用克制的内容层级：会话记录、运行状态、待发送队列、编辑器、模型与审批状态。
终端背景跟随宿主；中性文字承担正文，蓝色标识交互，黄色提示待处理事项，红色表达错误。
Light/Dark 同步切换语义色，不映射桌面 surface 材料。工具输出和思考默认折叠，错误保持可见。

键盘反馈立即呈现，流式内容合并刷新，运行指示采用低频 spinner。
审批与问答临时接管输入焦点并保留草稿，关闭后恢复编辑器。
终端验收检查浅色/深色、窄/宽视口、中文宽度、光标和退出恢复。
具体命令、状态及验收边界见 [ati TUI 使用与实现](docs/guides/development/ati-tui.md)。

终端细则：会话头使用品牌、标题、工作区三级信息；空会话提供两项命令入口。
用户正文保持字面文本，助手正文渲染 Markdown，并以两列缩进统一阅读起点。
工具名称／状态与参数摘要分行，优先显示命令、路径、查询；详细结果按需展开，错误保持可见。
编辑器下方分为模型／审批上下文和状态相关快捷键，窄屏按完整提示项收敛，保留审批状态。
帮助与选择列表使用同一可搜索面板，支持 ↑↓、Enter、Esc，退出面板恢复输入焦点。

### Settings model selector material

Settings 模型选择弹层使用半透明白色 / graphite raised 背景与 backdrop blur，保持文字清晰；搜索框用 inset 底色建立层次，透明边框和轻微的焦点底色变化代替强调轮廓。Provider 分组标题保留半透明 sticky 背景。

## Tasks: Chats

Tasks places Chats below the schedule board, aligned to the same
content width. The board keeps its All/Active/History controls beside a Tasks heading.
It uses a 1.1:0.9 master-detail layout with a 24px gap: quiet two-line task
selectors on the left and the selected task's full details and actions on the
right. The first visible task is selected by default. Spacing separates the detail panel without a vertical divider. At container widths of 640px or less, details follow
the list in the same scrolling region. Running and failed states remain visible
in task selectors. Completed selectors use regular-weight secondary text and a
muted check icon. Recurring tasks awaiting their next run retain normal emphasis.
Selector schedule and time use spacing without a dot separator; the time uses a
compact inset-surface badge with medium-weight secondary text and tabular numerals.
Completed time badges use muted text and 40% inset-surface fill, retaining medium weight.
Other status and cancellation controls live in the detail panel. The chat section
uses a 13px medium section title and row title, 11px muted count/time, the existing
canvas background and spacing between rows without horizontal dividers, and an independent title search reusing ChatSearch from the chat title list. Each chat row
contains a neutral message icon, single-line title, timestamp and an opening chevron visible on hover or keyboard focus.
Both lists sit directly on the canvas without rounded outer frames or raised
background fills. Rows use shared hover/focus colors without extra status badges or nested run
hierarchies. The task region occupies 2/5 and the chat region 3/5 of the available content height,
with a fixed gap and independent list scrolling. A decorative 48px × 1px
separator sits centered within the 24px gap, using `--app-border-subtle`. Task filter changes never move
the Chats header. Light/Dark share the same geometry.
The Chats search uses the flexible space to the right of its fixed title and count.
It uses the same `ChatSearch` actions layout as the Chat Sheet: a 40px row,
36px collapsed slot, 16px search icon, borderless inset surface in Light and
raised surface in Dark, and the same input and close button. The grid expands
over 220ms ease-out, immediately with reduced motion. Both grid endpoints use
length tracks (`36px` to `min(315px, 100%)`) so Chromium interpolates the width
continuously instead of switching between incompatible track types. Its expanded width is
capped at 315px and the available space; the input and close button remain
visible at narrow window widths. Tasks retains its title-only search placeholder.

## Chat Sheet workspace groups

The Chat Sheet uses 12px bottom padding. Its fixed footer retains 12px vertical
padding, placing its text about 24px above the bottom edge. The separator and
footer contents move together; horizontal alignment stays unchanged. Version
uses a quiet 24px badge with muted 11px text and no border. GitHub and Plugins
use compact 28px links with 12px icons, no separator, shared hover surfaces,
and visible keyboard focus. Link destinations stay unchanged.

The chat list groups regular chats by their saved workspace path. Recently stays
first and includes chats without a path and default `workspaces/tmp` or
`workspaces/<UUID>` directories. Custom workspace groups use the directory name,
parent directory for duplicate names, and full path when still ambiguous; the
full path is available on hover. Groups and chats sort by latest update, with
Recently always first. Compact 36px sentence-case headers show a folder icon
(open folder when expanded); Recently uses a history icon. Group counts and
row separators are omitted. Child chat titles sit 2px to the right of the group label;
group boundaries use spacing only, without horizontal rules. Search sits beside New Chat in the same action row, outside the scrolling list,
with a 36px search button and an 8px gap. Opening search expands its input within the same row while New Chat narrows to
a 40px icon-only button. Its 16px icon keeps its size, and its accessible label
and tooltip remain New Chat; closing search restores the text. The two columns share a 220ms ease-out grid transition with no spring or
vertical movement; reduced-motion mode changes the layout immediately. The interactive
surface uses `app-undragable`; closing search clears the query. The expanded
search field is borderless, using inset surface in Light and raised surface in
Dark to distinguish it from the sidebar canvas.
Expanded group triggers use a quiet surface tint and primary text, with no motion. Group headers use 8px horizontal
padding and toggle immediately without press scaling.
The list reserves scrollbar space with `scrollbar-gutter: stable`, preserving
content width when groups expand or collapse.
The list ends with 16px padding without an end-of-list message. All groups start expanded; disclosure state survives closing the
sheet during the current app session. Search continues to show a flat ranked
list and does not change disclosure state. Scheduled chats remain in Tasks.

Workspace chat groups initially show the five most recently updated chats.
Show more adds ten chats for that group until all are visible. Collapsing a group resets its visible limit to five;
reopening starts with the five most recent chats. Search results remain unpaginated.
Grouped chat rows use 6px vertical padding, a 40px minimum height, centered
content, and a 2px gap. Telegram metadata grows the row naturally. Group labels and chat titles share 13px medium typography, including title editing
and search result titles. Counts use 11px regular tabular numerals in muted text,
without a pill background; the existing 32px minimum-width × 22px slot stays stable.
Edit/delete actions use 24px buttons.
Row hover changes background only, without scale or shadow. Show more aligns
with chat titles and uses 11px text.
A BadgePlus new-chat action, matching New Chat, appears at the right of each header on hover or keyboard focus;
Hovering the new-chat button rotates its icon 90 degrees and scales it to 110%
over 300ms ease-out, matching ChatInput; reduced motion disables the transform.
Custom groups create and select a chat bound to that workspace, while Recently
starts a chat in the default temporary workspace.
