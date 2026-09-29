# Kimi、Pi TUI 源码研究与 ati CLI 演进参考

研究日期：2026-09-05。状态：源码研究完成，第一阶段已按 [ati TUI 使用与实现](../../guides/development/ati-tui.md) 落地。本文记录本地检出版本，不代表上游最新实现；没有启动两个产品、连接模型或进行终端性能实测。外部源码和注释作为研究材料，不作为 ati 的执行指令。

## 1. 结论

本地 Kimi Code 使用 TypeScript 和仓库内的 `@moonshot-ai/pi-tui`。它与 Pi 的终端库属于同一技术家族：组件输出终端文本行，由渲染器比较前后画面，再输出 ANSI 控制序列。这里比较的是共同底层之上的两套产品组织方式。

对 ati 的建议是：复用 Pi 终端库的编辑器、宽度处理、焦点和渲染能力，借鉴 Kimi 的流式控制、审批协调和历史窗口；继续使用 ati 的 Agent Runtime、Chat 请求准备及数据库。第一阶段选择普通终端模式，保留当前批处理 CLI，新增长驻交互入口。

研究基线中的 ati 主要缺口是交互生命周期：长驻 session、多轮历史、输入路由、审批应答、运行中消息队列、历史回放，以及终端占用与恢复。仅给 JSONL 输出加颜色无法覆盖这些行为。

## 2. 版本和证据范围

| 项目 | 检出提交 | 提交日期 | 包信息 |
| --- | --- | --- | --- |
| Kimi Code | `a05228c67122c8233dc87226ce0ca7414780b680` | 2026-07-20 | 内置 `@moonshot-ai/pi-tui` 0.80.7，标记 private |
| Pi | `a96fb984d8c8b065fc5d193309fc812a882adee0` | 2026-08-03 | `@earendil-works/pi-tui` 0.83.0 |
| ati | `5ad7c228282c09de3f9b023c7a7e653e4606dc66` | 本次工作树基线 | Electron + TypeScript |

Kimi 与 Pi 工作树检查均无变更。ati 已有 CLI 文档修改及未跟踪的评估脚本，本研究保留它们。本文所述 ati 行为对应表中的研究基线。当前交互式 TUI 已接入，现行行为见 [ati TUI 使用与实现](../../guides/development/ati-tui.md)；本文没有重新验收这些后续实现。

以下证据索引中的外部链接按提交固定；源码读取来自用户提供的本地仓库，未联网核验这些提交在远端的可访问性。文中的 K1 至 K8、P1 至 P6、A1 至 A5 对应末尾索引。

## 3. 三者的数据流

```text
Kimi:
runShell -> createKimiHarness -> KimiTUI -> Session
                                     <- session.onEvent
                                     -> SessionEventHandler
                                     -> StreamingUIController / Transcript / Dialog
                                     -> pi-tui TUI -> ProcessTerminal

Pi:
InteractiveMode -> AgentSession.prompt / steer / followUp / abort
                <- AgentSession.subscribe
                -> AssistantMessage / ToolExecution / Editor / Footer
                -> TuiMainScreen 或 TuiAltScreen -> ProcessTerminal

ati 当前:
cli.ts -> CliApplication -> 输入文件与配置准备
                         -> CliChatProfile / RunRequestFactory
                         -> CliRuntimeRunner / AgentRuntime
                         -> CliEventSink -> 文件与 stdout JSONL
                         -> 清理资源并退出
```

Kimi 的 shell 路径在进程内创建 harness/session；其目录名 `reverse-rpc` 描述运行时反向请求用户输入的机制，不能仅凭命名断言 TUI 必经网络 RPC。Pi 仓库也存在 client/server，但本次定位的 coding-agent interactive 路径直接订阅 AgentSession。证据：K1、K2、K6、P3、P4、A1。

## 4. Pi 的终端底层

### 4.1 组件协议与渲染

核心组件协议是 `render(width): string[]`，加上 `invalidate()` 和可选 `handleInput(data)`。Container 组合子组件；Markdown、Editor、SelectList 等都遵守相同协议。业务组件不直接计算最终屏幕的光标移动。证据：P1。

渲染流程：

1. 会话事件改变组件状态并调用 `requestRender()`。
2. TuiBase 合并重复请求，普通渲染的最小调度间隔为 16 ms。
3. 组件根据当前列宽生成带样式的行；Markdown 在文本与宽度未变时复用缓存。
4. MainScreen 比较 `previousLines` 和新行，寻找首尾变化范围；追加、缩短、视口越界和图片分别处理。
5. 用同步输出序列 `ESC[?2026h/l` 包住一次更新，再定位硬件光标。

这节省的是终端写入和绘制。它不意味着每次事件的组件计算都是 O（变化量），也不意味着保证 60 FPS。尺寸变化或超出可覆盖范围时，仍有完整重绘路径。证据：P1、P2。

### 4.2 普通终端与全屏

`createInteractiveTui()` 根据 `uiMode === 'fullscreen'` 选择 TuiAltScreen，否则使用 TuiMainScreen。

| 模式 | 特性 | 对 ati 的意义 |
| --- | --- | --- |
| MainScreen | 基于普通终端画面处理文本追加、光标与回滚边界 | 适合第一版聊天式 CLI |
| AltScreen | 独立全屏画面，配合布局、滚动视图和交互能力 | 适合以后复杂面板，增加选择、滚动及退出恢复的验收面 |

Kimi 当前代码是 `new TUI(terminal)`；Pi 当前代码将 TUI 用作接口并实例化具体 renderer。这是实际 API 差异。接入时应固定版本，围绕实际导出写一个小样例，再迁入业务组件。证据：K2、P1、P3。

### 4.3 输入与中文

ProcessTerminal 负责 raw mode、resize、bracketed paste、Kitty 键盘协议及回退；StdinBuffer 把可能跨多次 stdin data 的转义序列拼完整，再交给组件。不能把一次 stdin 回调当成一个按键。

Editor 配套历史、补全、撤销和单词导航。字符显示宽度需要处理 ANSI、东亚宽字符与字素边界，不能用 JavaScript `string.length` 计算终端列数。Focusable 组件输出 `CURSOR_MARKER`，渲染器用它定位硬件光标，使中文输入法候选窗跟随输入位置。证据：P1、P2。

这些边界是复用库最有价值的部分，终端端口适配的收益通常高于自行实现编辑器。

## 5. Pi 的 Agent 产品层

InteractiveMode 订阅 AgentSession 事件：`message_start` 创建 assistant 组件，`message_update` 更新正文和工具参数，`message_end` 收束正文；工具按 toolCallId 存入 pendingTools，执行事件继续更新同一组件。工具参数完成后才触发依赖完整参数的 diff 计算。中断和错误也会收束未完成工具显示。证据：P3。

AgentSession 暴露 prompt、steer、followUp、abort、subscribe。交互层根据运行状态选择立即提交或排队，队列显示由运行时消息消费事件更新。steer 和 followUp 是不同语义：前者影响当前执行后续过程，后者等待后续处理；不能简单统一成“取消后重新启动”。具体消费检查点仍由 Agent 层决定。证据：P3、P4。

组件目录已有模型、会话、主题和设置选择器、外部编辑器、工具 diff、思考内容显示以及扩展 UI。可借鉴组件协议和扩展挂载能力，但不宜照搬整个 InteractiveMode：本次快照该文件为 6,353 行，集中承担了大量产品编排职责。文件长度是维护范围信号，不构成运行缺陷结论。

## 6. Kimi 在共同底层上做了什么

### 6.1 分区与状态所有权

createTUIState 显式创建 transcript、activity、todo、queue、btw、editor 和 footer。KimiTUI 负责应用编排，SessionEventHandler 分派 session 事件，StreamingUIController 管理活动草稿和工具组件，SessionReplayRenderer 处理回放。证据：K2、K3、K4。

适合 ati 借鉴的原则：历史内容、当前活动、待发送输入、当前输入草稿分开管理。审批或选择器临时接管输入焦点，背景任务仍可以更新活动状态。

KimiTUI 本身仍有 2,999 行，控制器分拆没有消除全部耦合。ati 可以沿用职责划分，按实际功能渐进拆分。

### 6.2 两层流式节流

StreamingUIController 累积 assistant/thinking 草稿和工具参数，标记待刷新项；`STREAMING_UI_FLUSH_MS = 50` 合并高频更新，再更新组件。这发生在终端底层差分渲染之前。证据：K3。

因此有两个独立优化点：降低业务组件重建频率，以及降低终端写入范围。ati 的 `step.delta` 同时包含 delta 与 snapshot，映射时必须选定追加或快照替换规则，避免重复正文。终态、错误、取消及步骤边界要立即收束尚未刷出的内容。

工具参数预览限制为 64 KiB，并使用预览解析器提取部分字段；最终参数仍取完整工具调用事实。此做法把临时展示与实际执行输入分开。工具组件按调用 ID 追踪，同一轮的 Read 和 Agent 调用还有分组显示。证据：K3、A3。

### 6.3 长会话窗口

`transcript-window.ts` 默认保留最近 15 轮，超过额外 5 轮的滞回阈值再裁剪；最近 3 轮允许展开；同一轮保留最近 30 个 step，旧 step 可合并成摘要。环境变量可调整部分阈值。证据：K5。

这是 TUI 组件与展示条目的裁剪，不等于删除会话持久化记录，也不等于模型上下文压缩。回放路径另外限制历史加载并从 session 状态重建组件。ati 应分别定义模型历史、数据库历史、终端展示窗口，避免为了画面流畅而丢掉上下文。证据：K4、K5。

### 6.4 审批和问答是双向协议

BaseController 维护待答请求和 Promise；用户提交后 resolve 当前项，取消时为待处理项生成取消结果。Approval 与 Question 分别有 controller，由 ModalCoordinator 串行协调焦点；它按 owner 协调类别，各类内部队列由对应 controller 管理。证据：K6。

ati 借鉴时需要完整闭环：请求 ID、run/session 归属、展示、回答、取消、迟到回答拒收、退出清理。单独打印一行“等待批准”并不能使运行时恢复。

### 6.5 粘贴、附件和退出

Kimi 的 CustomEditor 在底层 Editor 之上增加长粘贴占位、附件粘贴与补全行为。PasteBurst 对缺少 bracketed paste 标记的快速输入做启发式识别，防止紧随其后的 Enter 意外提交；这种启发式需要可关闭和边界测试。证据：K7。

runShell 保存 stty 状态、关闭 XON/XOFF 流控，并在正常及异常路径恢复终端模式。它也提供 session 恢复入口。对 ati，SIGINT 既涉及运行取消，也涉及 raw mode 下输入事件；必须明确哪一层拥有终端，保证退出后 shell 光标、回显和快捷键可用。证据：K1。

## 7. ati 已有能力与缺口

| 项目 | 当前源码事实 | TUI 所需补充 |
| --- | --- | --- |
| 请求准备 | CliChatProfile 复用 RunRequestFactory，加载 MCP | 多轮时传入真实历史；保留相同模型、技能与工具准备 |
| 执行核 | CliRuntimeRunner 使用 DefaultAgentRuntime/Loop | 长驻 host 与单次 run 生命周期分离 |
| 输出 | CliEventSink 脱敏后写文件及 stdout JSONL | 独立事件到组件的映射；TUI 模式统一管理终端输出 |
| 输入 | instruction 文件，一次运行 | 多行编辑、补全、历史、命令、队列 |
| 审批 | deny/auto；confirmationRequester 直接返回 | 可等待的交互确认和取消闭环 |
| 历史 | profile 构造时 historyMessages 为空 | session 创建、续聊、恢复与重放 |
| steering | Chat runner 接入 steering source；CLI runner 未接入 | 复用既有队列及确认语义，不能仅改 UI |
| 进程 | Electron 初始化，运行结束 app.exit | 交互期间保持服务可用，退出时统一释放 |

证据：A1 至 A5。共享工具配置不等于所有工具都有终端交互实现。尤其用户问答、审批及桌面侧能力，应按实际 host bridge 验证。

## 8. 建议的 ati 实施边界

以下是研究建议，不是已批准的架构决策或本次实现。

```text
CLI 入口
  ├─ 现有 run：文件输入 + JSONL + artifacts
  └─ 新增交互入口
       ├─ TerminalView：编辑器、内容区、活动、审批、footer
       ├─ 会话控制：提交、取消、恢复、待答请求
       └─ 复用 ati preparation / runtime / persistence
             └─ runtime events -> 展示状态 -> 终端组件
```

第一阶段优先同进程复用现有 Electron 启动能力，降低重复初始化数据库、工具和 MCP 的成本。其前提是实测当前 launcher、stdin/stdout TTY 和库的运行环境兼容。独立 Node 前端通过双向协议连接后台可作为后续方案，涉及连接恢复、进程管理及请求协议，不宜仅为首版外观引入。

批处理模式保持 stdout JSONL 契约。交互模式必须统一管理 stdout/stderr：现有 console capture 把日志导向 stderr，但 stderr 与 TUI 通常仍落在同一个终端，会破坏画面，应改为文件或受控日志区。

优先验证 Pi 的独立 TUI 包；Kimi 的 fork 包在本地 manifest 中为 private，不能把它当作可直接安装的公开依赖。Pi 声明 Node >=22.19.0、ESM，并包含平台相关能力；ati 使用 Electron，需核对实际内置 Node、打包方式与原生模块加载。MIT 许可允许复用方向，但复制代码时仍保留适用的版权和许可证。这里没有核验 npm 当前发布状态，也没有完成依赖选型。

新 host 应遵守 ati 既有 contracts/orchestration 边界；当前 CLI 存在的直接 runtime 引用不应自动成为扩展所有 host 的新规则。跨层契约抽取须通过 main architecture 检查。详见[主进程架构](../../architecture/main-process-architecture.md)与[Chat runtime 架构](../../architecture/chat-runtime-architecture-current.md)。

## 9. 建议实施顺序和验收

| 阶段 | 内容 | 完成条件 |
| --- | --- | --- |
| 0：终端适配验证 | 固定库版本；假事件驱动 Editor/Markdown/Tool 卡片 | Electron launcher 下中文、resize、取消退出正常，无需模型 |
| 1：最小交互闭环 | 多轮 session、正文/思考/工具状态、取消、错误、日志隔离 | 连续两轮携带正确历史；完成/失败/取消都回到可输入状态；批处理输出保持可解析 |
| 2：双向交互 | 审批、结构化问题、取消待答请求、会话恢复 | 不串 session；退出无悬挂请求；恢复展示与后续模型历史一致 |
| 3：运行中输入 | steering 和 follow-up，消费确认与退回 | 队列只在真实消费后移除；取消、预算结束、失败能退回未消费内容 |
| 4：长期体验 | 历史窗口、工具折叠、模型/会话选择器、主题 | 长输出和长会话下输入可用；折叠不丢执行事实；窄窗口不溢出 |

首版布局建议：内容区 → 当前活动 → 待发送队列 → 编辑器 → 简短状态栏。只显示与当前操作有关的信息；出错和待审批时提供明确动作。全屏、多面板、图片、扩展 UI 等在基础闭环稳定后加入。

## 10. 验证方法与局限

Pi 的 VirtualTerminal 使用 `@xterm/headless`，测试可以检查最终屏幕单元及终端写入，不局限于字符串快照；已有渲染、编辑器、输入序列、CJK 边界和 overlay 回归测试。Kimi 另外有审批 controller、键盘、回放、transcript window 等业务测试。证据：P6、K8。

ati 建议采用三层验收：

- 事件映射测试：正文不重复、工具 ID 稳定、终态刷新、拒绝/取消不残留。
- 虚拟终端测试：追加、收缩、resize、overlay、长粘贴、转义分片和宽字符。
- 真实终端验收：中文输入法候选窗、tmux、至少 macOS 与 Windows、Light/Dark、正常/异常退出恢复。具体支持平台以产品范围为准。

性能测量应记录事件速率、组件重建次数、终端写入字节数、输入延迟和长会话内存；16 ms 与 50 ms 是源码调度参数，不是性能实测结果。历史裁剪的 UI 行为也要与终端自带 scrollback 区分。

本次仅创建研究文档和索引，没有修改运行时代码；检查源码、版本、工作树与文档链接，未运行产品测试或 Electron 交互。公开发布状态、真实跨平台体验、图像协议和依赖打包兼容仍是实施前验收项。

## 11. 源码证据索引

以下外部根链接固定本次检出提交，表中路径均相对于对应仓库；ati 链接指向本仓库当前文件。

- [Kimi 源码快照](https://github.com/MoonshotAI/kimi-code/tree/a05228c67122c8233dc87226ce0ca7414780b680)
- [Pi 源码快照](https://github.com/earendil-works/pi/tree/a96fb984d8c8b065fc5d193309fc812a882adee0)

| 编号 | 仓库相对路径 | 关注点 |
| --- | --- | --- |
| K1 | `apps/kimi-code/src/cli/run-shell.ts` | harness、TUI 启动、终端恢复 |
| K2 | `apps/kimi-code/src/tui/{kimi-tui,tui-state}.ts` | 会话编排、分区、组件构造 |
| K3 | `apps/kimi-code/src/tui/controllers/{session-event-handler,streaming-ui}.ts`；`apps/kimi-code/src/tui/constant/streaming.ts` | 事件过滤、流式合并、工具分组 |
| K4 | `apps/kimi-code/src/tui/controllers/session-replay.ts` | session 回放与状态重建 |
| K5 | `apps/kimi-code/src/tui/utils/transcript-window.ts` | 15/5/3/30 展示窗口参数 |
| K6 | `apps/kimi-code/src/tui/reverse-rpc/{index,base-controller,modal-coordinator}.ts` | 双向请求和焦点协调 |
| K7 | `apps/kimi-code/src/tui/components/editor/custom-editor.ts`；`packages/pi-tui/src/paste-burst.ts` | 输入增强、粘贴保护 |
| K8 | `apps/kimi-code/test/tui/`；`packages/pi-tui/package.json` | 业务测试、fork 包信息 |
| P1 | `packages/tui/src/{tui,index}.ts`；`packages/tui/package.json` | 组件契约、调度、导出和环境 |
| P2 | `packages/tui/src/{tui-main-screen,tui-alt-screen,terminal,stdin-buffer,utils}.ts`；`packages/tui/src/components/markdown.ts` | 差分、终端、输入、宽度和缓存 |
| P3 | `packages/coding-agent/src/modes/interactive/interactive-mode.ts` | renderer 选择、事件绑定、消息队列 |
| P4 | `packages/coding-agent/src/core/agent-session.ts` | 会话 API 和生命周期 |
| P5 | `packages/coding-agent/src/modes/interactive/components/assistant-message.ts` | 正文和思考组件 |
| P6 | `packages/tui/test/{virtual-terminal,tui-render.test}.ts` | 虚拟终端与渲染验证 |

- A1：[CLI application](../../../src/main/app/CliApplication.ts)、[入口](../../../src/main/cli.ts)、[输入](../../../src/main/hosts/cli/CliInputAdapter.ts)。
- A2：[请求准备](../../../src/main/orchestration/cli/CliChatProfile.ts)、[编排](../../../src/main/orchestration/cli/CliRunOrchestrator.ts)。
- A3：[StepEvent](../../../src/main/agent/runtime/events/StepEvent.ts)、[ToolEvent](../../../src/main/agent/runtime/events/ToolEvent.ts)。
- A4：[CLI runtime](../../../src/main/orchestration/cli/CliRuntimeRunner.ts)、[JSONL sink](../../../src/main/hosts/cli/CliEventSink.ts)。
- A5：[Chat runtime runner](../../../src/main/orchestration/chat/run/runtime/DefaultMainAgentRuntimeRunner.ts)。

## 12. 第二轮交互与视觉优化（2026-09-22）

本轮补充比较四个参考来源。Kimi 对照的是本地 Kimi Code 的 TUI，未将模型名称 Kimi K3 当作另一套已核实的终端实现。没有复制上游业务运行时，也未引入新依赖。

| 来源 | 本轮核对证据 | ati 落地 |
| --- | --- | --- |
| Codex，检出 `bf3c1972b7` | `codex-rs/tui/src/bottom_pane/footer.rs`，区分状态与操作提示，按宽度降级 | 模型／审批与操作提示分行；窄屏保留审批及完整快捷键，按空闲、运行、交互和退回队列切换 |
| Claude Code | [官方交互文档](https://code.claude.com/docs/en/interactive-mode)、[状态行文档](https://code.claude.com/docs/en/statusline) | 将工具细节按需展开；输入附近保留关键上下文与可发现的操作，不采用非官方源码分析作为实现依据 |
| Pi，检出 `a96fb984d` | `packages/coding-agent/src/modes/interactive/components/footer.ts`，已安装的 Input／SelectList API | 沿用原生编辑器、宽度与焦点能力；保持底部状态紧凑，不自行实现终端输入协议 |
| Kimi Code，检出 `a05228c6` | `apps/kimi-code/src/tui/components/dialogs/model-selector.ts`、`components/editor/custom-editor.ts` | 模型、会话、审批和帮助使用可搜索选择器；关闭后恢复编辑器焦点 |

具体表现：会话头展示标题与工作区，空会话展示简短命令入口；用户文本按原样呈现，助手正文保留 Markdown；工具标题展示符号、名称和状态，下一行优先展示命令、文件路径或查询，错误输出始终可见。`/help` 打开可执行命令面板，Esc 关闭，不再将整页帮助写入持久提示区域。

PTY 采集使用流式 UTF-8 解码，避免多字节字符跨块损坏；测试子进程以独立 session 运行，尺寸变化显式广播 SIGWINCH，确保 Electron 更新列数。该采集修正属于验证工具，不改变生产 TUI 的终端协议。
