# CLI Host 实施指导

Status: Active
Owner: Main runtime
Last updated: 2026-09-03

## 目标与交付边界

提供由 terminal 或评测调度器启动的单任务 CLI Host。一次进程读取任务指令、在指定工作目录执行现有 AgentRuntime，持续输出 JSONL 并保存终态与轨迹，随后退出。首版由 Electron 主进程承载。

交付包含启动脚本、参数校验、CLI 输入输出适配、运行编排、自动化测试与运行指南。任务镜像恢复、任务枚举、verifier、Harbor adapter、榜单成本归一化属于外部评测接入阶段。桌面 Chat 行为保持现状。

## 依据与复用边界

- `src/main/agent/runtime/AgentRuntime.ts`：已有 runtime composition root。
- `src/main/agent/runtime/host/bootstrap/LoopInputBootstrapper.ts`：已有单条用户输入 bootstrap。
- `src/main/orchestration/chat/run/runtime/DefaultMainAgentRuntimeRunner.ts`：主运行组装参考，当前执行预算为单一 `maxSteps: 80`。
- `src/main/services/subagent/runtime/SubagentRuntimeRunner.ts`：简化宿主组装参考。
- `src/main/agent/tools/ToolExecutor.ts`：执行工具、allowlist、审批、取消的共用实现。
- `src/main/services/command/CommandProcessRunner.ts`：现有超时、输出和进程组清理。
- `src/main/request/index.ts`：统一 provider 请求入口；实际依赖插件配置数据库。
- `src/main/tools/index.ts`：中央工具注册表。

运行结构：

```text
terminal / evaluator
  -> launch script + Electron CLI app entry
  -> CLI input adapter + run orchestration
  -> AgentRuntime -> provider adapter / ToolExecutor -> task workspace
  -> CLI event sink -> stdout JSONL + output artifacts
```

`app/` 负责初始化和进程退出；`hosts/cli/` 负责宿主输入输出；`orchestration/cli/` 负责 runtime 组装和单次运行生命周期。agent core 继续只持有 runtime 语义。沿用标准库参数解析与既有构建工具。

`runCliTask` 在初始化完成后调用 `runCliRuntime` 函数组装共享 runtime，将详细结果写入产物并向应用层返回退出码。CLI 的有效请求配置来自 `CliChatProfile.requestSpec`。

## 公共命令与配置

新增 `pnpm cli --help` 和 `pnpm cli run`。开发者先使用现有构建命令生成产物，脚本启动专用 CLI bundle，避免启动桌面 MainApplication。支持的参数：

| 参数 | 契约 |
| --- | --- |
| `--instruction-file` | 必填；UTF-8 非空任务指令文件，原样作为用户输入 |
| `--profile-dir` | 可选；默认桌面应用 profile，显式传入目录时使用该配置与数据库 |
| `--workspace` | 必填；存在的目录，规范化为绝对路径，所有文件/命令工具共享此目录 |
| `--config` | 必填；JSON 模型配置文件 |
| `--output-dir` | 必填；新建运行目录或空目录，已有运行产物时拒绝覆盖 |
| `--timeout-seconds` | 正有限整数，默认 900，限制整个任务运行 |
| `--max-steps` | 正有限整数，默认 80；作为单轮任务的唯一模型步数上限 |
| `--approval` | `deny` 或 `auto`，默认 `deny`；auto 用于用户授权的隔离环境 |

拒绝未知参数、重复参数、空值和越界整数。`--help` 应在读取配置、初始化数据库和发送模型请求前返回。启动脚本准确传递 exit code 与 SIGINT/SIGTERM。

构建并运行已生成的 CLI bundle：

```sh
pnpm exec electron-vite build
pnpm cli --help
pnpm cli run --instruction-file ./task.md --workspace ./workspace \
  --config ./cli-config.json --output-dir ./runs/task-001
```

`cli-config.json` 使用环境变量名保存凭据：

```json
{
  "adapterPluginId": "openai-chat-compatible-adapter",
  "baseUrl": "https://api.example.test/v1",
  "model": "example-model",
  "apiKeyEnv": "ATI_CLI_API_KEY",
  "options": {
    "thinking": { "enabled": true, "effort": "high" }
  }
}
```

本地验收使用 loopback deterministic provider stub，命令为
`pnpm exec electron-vite build && pnpm verify:cli`。脚本覆盖长文本与 usage、文件工具的
`auto`/`deny`、步骤耗尽、总超时、SIGINT、输出目录冲突、参数拒绝和 provider 错误脱敏；
临时工作目录由系统生成。

模型 JSON 配置使用 `adapterPluginId`、`baseUrl`、`model`、`apiKeyEnv` 四个必填字段；API key 由指定环境变量读取。支持 `systemPrompt`、`options` 和 `requestOverrides` 可选字段。`options` 当前支持 `thinking`，其 `enabled` 必须为布尔值，`effort` 提供时须为非空字符串。省略 `options` 或 `thinking` 时，CLI 使用共用 Chat profile 的模型能力与配置解析结果；提供显式 `thinking` 时，该选择覆盖有效值。`enabled: true` 控制后续请求回传历史 `reasoning_content`，有效 `effort` 按 adapter 能力映射请求字段；`enabled: false` 记录显式关闭选择并停止历史 reasoning 回传，provider 推理开关沿用各 adapter 的现有协议。`options` 与 `thinking` 层的未知字段会返回 `CONFIG_FIELD_INVALID`。使用既有 provider adapter id，并验证其可解析性。配置示例必须引用已确认的内置 adapter id；示例凭据只使用环境变量名。

系统提示词、环境上下文、skills 与用户配置复用 Chat 的 RunRequestFactory。CLI 显式 systemPrompt 可覆盖本次提示词；显式 options 优先，省略时沿用 Chat 模型默认配置。每次运行创建新会话并记录最终 prompt、有效模型配置与完整工具 schema 的指纹。

## 隔离与工具

CLI 默认使用桌面应用的 userData，读取同一份 provider、视觉/辅助模型、用户偏好、skills 和 MCP 配置。`--profile-dir <dir>` 可指定独立应用配置目录，验收与容器必须显式选择测试 profile。sessionData、JSONL 与终态产物保持在 output-dir；数据库和应用日志归属于选定 profile。CLI 会话保留在该 profile，供工具创建的关联数据继续使用。

工具通过 Chat 的 ToolListBuilder 从中央注册表及配置的 MCP 服务生成，CLI 不再维护独立名单，ToolExecutor 沿用 Chat 的工具执行策略。包括 vision_analyze、plan、ask_user_question 等已注册能力。MCP 连接失败会明确终止初始化；模型所见名单和结果审计来自同一份有效请求。

`deny` 对需要确认的操作返回明确拒绝；`auto` 使用现有 permissionApprovalMode，审批决策可审计。缺少交互能力的工具调用立即返回确定结果。工具、模型请求都共享 AbortSignal。CLI 路径本身不构成操作系统 sandbox；自动审批应由外部容器/VM 提供隔离。环境内的跨目录操作沿用现有审批契约。

凭据不得写入 JSONL、结果或运行配置快照。错误文本和事件输出应用现有脱敏机制，并覆盖配置指定 key 的意外回显。进程参数仅携带环境变量名。stdout 仅承载 CLI JSONL，普通日志走文件/stderr。

## 事件、产物、退出

JSONL envelope 固定带 `schemaVersion: 1`、`runId`、`type`、时间戳与 payload。至少有 `run.started`、runtime 事件与 `run.finished`；合法启动后的每条终态路径只输出一次 finished。允许 help 为普通文本。输入校验失败输出结构化错误并返回参数错误码。

output-dir 至少有 `events.jsonl`、`result.json`、`transcript.json`。轨迹使用 runtime 已有结构；result 包含 runId、status、开始/结束时间、耗时、模型/adapter、工具集、预算、审批模式、最终文本、usage、failure 或 abortReason。明确 `completed` 只表示 agent 运行完成，pass/fail 由外部 verifier 提供。使用临时文件加 rename 或等价原子落盘保护结果。保留已完成步骤的用量与超时前轨迹。

退出码：0 completed；1 runtime/provider/tool orchestration 或输出失败；2 参数/配置错误；124 总超时；130 SIGINT；143 SIGTERM。步骤耗尽须能与正常完成区分并返回失败码，避免把硬预算中断当成成功。遵循当前 core 的终态行为，必要时在 CLI 输出层映射。

取消后先等待现有命令进程树清理与结果落盘，再关闭数据库及日志资源并退出。断开的 stdout 或输出目录写入失败须终止任务并清理，避免悬挂进程。实现中只添加解决实际依赖所需的最小 lifecycle 能力。

## 实施顺序

1. 读取相关 exports、调用方和架构规范，确认 adapter 与初始化副作用。
2. 实现参数/配置解析、CLI adapter、JSONL sink 及 focused tests。
3. 实现单次 runtime 编排，复用 bootstrap、模型流、工具执行；接通 timeout、signal、终态产物。
4. 增加专用 Electron bundle 入口和 Node launcher，验证 `pnpm cli --help`。
5. 运行完整 CLI smoke：本地确定性 provider stub 发出真实文件/命令 tool call，检查工作目录内副作用、usage、JSONL、exit code、结果落盘；再次启动验证隔离；覆盖 timeout 与 provider 失败。stub 仅为测试设施。
6. 同步使用指南、main architecture、hosts README、文档索引，补 ADR 记录 Electron 承载及 CLI profile 边界。

预计涉及超过 8 个文件；按输入、宿主输出、编排、应用入口、测试和文档职责组织，避免额外服务层与通用平台抽象。

## 验证与验收

- 参数：help、有效任务、缺失/重复/未知参数、非法 JSON、缺失环境变量、目录冲突。
- 生命周期：真实 runtime 完成、模型错误、步数耗尽、timeout、SIGINT/SIGTERM、输出失败及终态只写一次。
- 工具：实际文件读写或命令执行、cwd、allowlist、deny/auto、AbortSignal 与进程清理。
- 产物：stdout 每行合法 JSON、usage 与轨迹保留、错误脱敏、output-dir 与显式测试 profile 隔离。
- `pnpm exec vitest run` 指定新增 CLI 测试及受影响共用模块测试。
- `pnpm run typecheck:node`，有基线失败时单独记录原始位置与新改动关联。
- `pnpm run check:main-boundaries`、`pnpm run check:main-doc-paths`、`pnpm run test:main-architecture`。
- 使用现有构建工具产出并实际执行专用 CLI bundle，记录宿主 OS 和测试 provider 性质。

交付报告必须区分本地 stub 验证、真实付费模型验证、Linux 容器验证和 FrontierHarness 判分验证。只有实际执行的验收可标记完成。CLI Host 与评测接入按独立阶段交付。变更保留在工作区，提交与推送另由用户指令决定。

## 外部参考

- [FrontierHarness Eval](https://github.com/runta-dev/frontier-harness-eval)：2026-09-03 读取，用于界定任务定义与完整评测设施的交付边界。
- [Harbor agents](https://www.harborframework.com/docs/agents)：2026-09-03 读取，用于后续 installed agent 接入参考。
