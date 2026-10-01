# ati TUI 使用与实现

状态：已实现。更新：2026-09-05。

ati TUI 提供常驻终端会话，复用桌面 Chat 的模型配置、请求准备、工具、skills、MCP、历史和运行生命周期。Pi TUI 负责终端渲染与编辑；ati 负责业务状态与持久化。设计依据见 [Kimi / Pi 源码研究](../../reference/terminal/kimi-pi-tui-study.md)，持久化与依赖选择见 [ADR 0022](../../decisions/0022-interactive-terminal-host.md)。

## 启动

在仓库中安装依赖、构建后，从交互终端执行：

```bash
pnpm install
pnpm build
pnpm tui --workspace /path/to/project
```

默认使用桌面 ati 的 profile 和已配置的模型。stdin、stdout 都必须是 TTY。`--help` 不要求 TTY。

```bash
pnpm tui --help
pnpm tui --workspace /path/to/project --profile-dir /path/to/isolated-profile
pnpm tui --workspace /path/to/project --resume <session-uuid>
pnpm tui --workspace /path/to/project --model <model-id> --account <account-id>
```

模型优先采用显式参数，其次是会话模型、配置的主模型；只有一个可用模型时自动选择。存在多个候选时使用 `/model`。独立 profile 初始没有账号，需要先通过 ati 配置模型。模型列表排除停用模型、停用供应商和图片生成模型。

TUI 使用 Electron 的主进程和原生 SQLite，不创建桌面窗口。批处理仍通过 `pnpm cli run` 使用 JSONL 协议。仓库 launcher 使用 `out/main/tui.js`；改动源码后需要重新构建。本次没有新增安装到系统 PATH 的发布命令。

界面固定文案使用英文，与桌面 App 保持一致；用户输入、模型回答、工具内容和已有会话标题保留原始语言。新会话默认标题为 `TUI Chat`。

## 输入与命令

| 操作 | 行为 |
| --- | --- |
| Enter | 空闲时开始一轮；运行中提交 steering，供当前执行在可消费点接收 |
| Shift+Enter | 换行；具体编码取决于终端键盘协议，Pi Editor 也支持 Ctrl+J |
| Alt+Enter | 运行中加入 follow-up 队列，当前轮成功结束后自动续问 |
| Tab | 命令与路径补全；路径仍作为文本进入请求，由工具读取文件 |
| 上下箭头 | 编辑器输入历史；选择列表中移动选项 |
| Ctrl+C | 停止当前执行 |
| Ctrl+D | 编辑器为空且无待回答交互时，保存并退出 |
| Ctrl+O / Ctrl+T | 展开工具输出 / 思考内容 |
| Esc | 取消选择；审批中拒绝；问答中取消 |

| 命令 | 行为 |
| --- | --- |
| `/help` | 查看命令与快捷键 |
| `/model` | 选择模型和账号 |
| `/sessions` | 选择当前工作区的已有会话 |
| `/new` | 新建会话，保留当前模型，审批恢复为手动 |
| `/theme` | 切换浅色 / 深色；启动时尝试读取终端配色通知 |
| `/tools`、`/thinking` | 切换相应内容的展开状态 |
| `/approval` | 选择手动或自动审批，保存到当前会话 |
| `/cancel` | 停止当前执行 |
| `/queue` | 停止后取回所有待发送内容到编辑器 |
| `/quit` | 停止执行、保存草稿与队列、等待后台任务、恢复终端并退出 |

模型、会话和审批模式切换要求当前执行结束且队列已处理。单次输入限制为 256 Ki 个 JavaScript 字符；待发送队列最多 5 项。建议大段资料通过文件路径提供。

## 多轮、队列与交互

每轮沿用同一个 `chatUuid`，由 Chat 请求准备载入历史。`submissionId` 区分每次运行。TUI 仅接收当前会话、当前提交的事件，过期的流式内容与交互不再修改画面。

运行中 Enter 提交的 steering 在收到 `run.steering.consumed` 后移出队列。结束时未消费的输入显示为 `Returned`。Alt+Enter 的 follow-up 只在前一轮成功完成、没有取消且没有退回输入时自动执行。停止或失败后，输入保持可见，通过 `/queue` 取回、编辑并重新提交。

审批和问答临时接管编辑区，原草稿保留。审批默认选中 `Deny`，允许后才继续执行工具。单选输入选项编号，多选输入逗号分隔编号，文本题直接填写；本地验证必选项、数量与长度。问答的超时和推荐答案规则沿用 Chat 的 `ToolUserQuestionManager`，终端收到解决事件后恢复编辑器。

`source: 'tui'` 是明确的交互来源。共享 `isInteractiveMessageSource()` 让桌面和 TUI 都能获取 `ask_user_question` 定义及运行时处理器；Telegram 等非交互来源保持原规则。TUI 不额外创建 AgentLoop，也不维护独立工具白名单。

## 实现边界

| 模块 | 职责 |
| --- | --- |
| `src/main/tui.ts`、`src/main/app/TuiApplication.ts` | 参数、profile、Electron、服务初始化、日志及退出清理 |
| `src/main/orchestration/tui/TuiSession.ts` | 会话 / 模型、RunService 调用、队列、取消、交互回传、草稿 |
| `src/main/hosts/tui/TuiState.ts` | RunEventEnvelope 投影、流式补丁、工具状态、历史裁剪 |
| `src/main/hosts/tui/TuiView.ts` | 编辑器、输入路由、选择器、交互焦点、重绘调度 |
| `src/main/hosts/tui/TuiTranscript.ts` | Markdown、思考、工具摘要与输出，复用未变消息的组件缓存 |
| `src/main/hosts/tui/TuiQuestion.ts` | 顺序问答与单选、多选、文本校验 |
| `src/main/hosts/tui/TuiTheme.ts` | 终端浅色 / 深色语义色 |

布局按 transcript、运行状态、待发送队列、编辑器、模型 / 审批 footer 排列。流式更新合并到 50 ms 窗口，执行边界与输入立即刷新；120 ms spinner 只表示正在执行。Pi 库负责行差分、宽度计算、raw mode、bracketed paste、焦点和光标。

显示历史超过 20 个用户回合时收至最近 15 回合。工具动态输出保留末尾 65,536 个字符，展开后最多显示 40 行。数据库消息和模型上下文继续由 Chat 管理，显示裁剪不改写它们。终端控制字符在显示前清理；历史工具卡片使用持久化 segment，避免新运行复用 toolCallId 时覆盖旧记录。

依赖锁定为 npm 发布的 `@earendil-works/pi-tui@0.83.0`，其入口是具体 `TUI` 类。研究用的本地 Pi 仓库虽有相同版本号，其 API 已是 `TuiMainScreen` / `TuiAltScreen`；集成以已安装包的声明与实际运行结果为准。Vite 将该依赖 external，保留包自身的原生加载与资源路径。

## 持久化与退出

消息沿用 Chat SQLite 表；草稿与队列使用现有 configs 表中的 `tui:input:<chatUuid>`。正常退出或切换会话时保存，恢复时所有队列项标记为 `Returned`，由用户重新提交。当前没有逐键落盘；强制终止进程可能丢失尚未保存的草稿与队列。

退出先取消当前执行，等待运行、post-run 工作、命令进程清理及工具结果压缩，再断开 MCP、关闭数据库与日志。终端清理放在 `finally` 中，恢复光标、输入模式和配色通知。正常退出打印会话 UUID，便于 `--resume`。

console 日志进入 profile 的日志服务，避免破坏终端画面，并沿用敏感值脱敏。配置的 MCP 连接失败会明确终止启动。记忆与知识库初始化失败写入日志，其他终端功能仍可使用。

## 验证与验收边界

```bash
pnpm exec eslint <changed-source-files>
pnpm run typecheck:node
pnpm run typecheck:web
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run check:main-doc-paths
pnpm exec vitest run src/main/hosts/tui src/main/orchestration/tui src/main/orchestration/chat/run src/main/orchestration/chat/postRun src/main/hosts/chat/preparation
pnpm test:coverage
pnpm exec electron-vite build
pnpm run verify:tui
```

PTY 验收需要 macOS / Linux、Python 3 和提供 `node:sqlite` 的 Node。验证脚本在系统临时目录创建独立 workspace/profile，使用本机 mock provider，不修改用户账号、不请求付费模型。它经过实际 Electron 进程、SQLite、HTTP 流和终端输入，覆盖多轮请求历史、问答、手动批准命令、steering、follow-up、中断退回、会话恢复、中文字符、尺寸变化及终端清理。输出目录打印在日志中，包含请求、原始 ANSI、检查摘要和基于 xterm 单元格生成的终端画面 HTML。

2026-09-05 验证中，33 个相关测试文件的 159 项测试、web 类型检查、主进程架构检查、构建和真实 PTY 流程通过。修改文件的 ESLint 检查与独立 HEAD 副本相比没有新增 error；既有文件保留 33 项 error，另有项目格式规则警告。全量检查另有两处已确认的既有基线问题：

- Node 类型检查：`src/main/tools/webTools/__tests__/webToolsUnits.test.ts:352`，`engine` 可能为 undefined。
- 全量测试：`src/shared/tools/__tests__/definitions.test.ts:15` 断言工具数量为 63，实际 49；在独立 HEAD 源码副本中同样复现。

最终全量覆盖率命令结果：2,012 项通过、1 项上述基线失败、20 项跳过；没有将这次执行报告为全绿。普通 Node 下有原生 SQLite 测试跳过；PTY 流程实际经过 Electron SQLite。终端截图来自实际 PTY 的 xterm 渲染快照，中文输入通过 PTY 注入；原生 Terminal 与浏览器本地文件查看被本次工具策略阻止，因此没有完成原生窗口的人工视觉验收。真实系统 IME 候选窗、Windows Terminal、远程 SSH / tmux 与安装包发行仍需平台验收。

## 2026-09-22 交互优化

- `/help` 是可搜索、可执行的命令面板；`/model`、`/sessions`、`/approval` 同样支持按名称、描述及标识筛选。Esc 关闭并恢复编辑器焦点。搜索时 Ctrl+D 由输入框处理，不触发退出。
- 会话头显示标题和工作区，空会话给出命令入口；用户输入保留 Markdown 字面符号，助手正文继续渲染 Markdown。
- 工具展示名称、状态和命令／路径／查询摘要，减少原始 JSON 对阅读的干扰；失败详情即使折叠也可见。
- Footer 保留审批状态，按空闲、运行、交互和退回输入显示完整快捷键；窄屏逐项省略次要提示。Esc 可清除普通通知。
- 参考来源与对应实现见[第二轮研究记录](../../reference/terminal/kimi-pi-tui-study.md#12-第二轮交互与视觉优化2026-09-22)。

本轮验证：

- `pnpm exec vitest run src/main/hosts/tui src/main/orchestration/tui`：4 个文件、28 项通过（改动前为 24 项）。
- `pnpm exec electron-vite build`、`pnpm run verify:tui`：通过。最终 PTY 产物目录名为 `ati-tui-verify-wrMvTR`，位于系统临时目录，含欢迎、命令面板、模型筛选、审批、问答和 Light/Dark 宽窄画面 HTML／文本。
- `pnpm run check:main-boundaries`、`pnpm run test:main-architecture`（7 项）、`pnpm run check:main-doc-paths`、`git diff --check`：通过。
- `pnpm exec eslint src/main/hosts/tui/TuiView.ts src/main/hosts/tui/TuiTranscript.ts src/main/hosts/tui/__tests__/TuiView.test.ts src/main/hosts/tui/__tests__/TuiState.test.ts scripts/verify-tui.mjs`：0 errors；现有 ESLint／Prettier 格式配置冲突产生 warnings。按仓库单引号、无分号、100 列规则显式覆盖 Prettier 后，只剩验证脚本两处既有 SQL 字符串引号 warnings。
- `pnpm run typecheck:node`：仍被 `webToolsUnits.test.ts:352` 的既有 TS18048 阻挡；该文件与 HEAD 一致。本轮没有报告全仓库类型检查通过。

本轮真实交互证据来自 Electron PTY，已核对终端单元格文本及宽窄布局。浏览器安全策略阻止打开本地 HTML 画面，因此未完成原生终端视觉、系统 IME 和 Windows Terminal 人工验收。以上检查覆盖 TUI 展示层及交互；本轮没有改动共享运行生命周期，也没有重跑全量覆盖率。
