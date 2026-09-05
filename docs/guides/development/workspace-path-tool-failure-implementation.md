# 工作区路径与工具失败契约实施指导

日期：2026-09-03。状态：已实现并完成独立复核，改动保留在工作区。

## 目标与证据

本轮 FrontierHarness 已完成 22 题，886 次工具调用中出现 21 次绝对路径拒绝。文件工具的 `embedded-relative` 模式在边界检查前拒绝所有绝对路径；命令工具和任务说明则经常使用工作区内绝对路径。

当前 `ToolExecutor` 的成功状态代表 processor 正常返回，返回值中的 `success: false` 代表操作失败。命令退出码、超时、启动错误和文件错误缺少统一的结构化恢复信息。本次保留执行生命周期与操作结果的区别，形成可供模型和运行时消费的失败事实。

## 范围

- 工作区文件工具：read/write/edit/grep/ls/glob/tree/stat/mkdir/mv 及其共用路径解析器。
- 命令工具：正常退出、非零退出、启动失败、超时、信号终止、取消。
- 通用工具执行入口：参数 JSON/参数校验、审批拒绝、内部异常的结构化信息；沿用 MCP 原有语义，避免猜测任意第三方 payload。
- 共享类型、模型可见结果、runtime 事件/转录中必要的信息传递、工具描述和相关文档。

自动重试、修改审批策略、扩展工作区权限、上下文压缩、thinking 配置、视觉工具、预算策略、评测续跑、提交与推送均留在各自后续任务。

## 已确认的路径规则

1. 工作区由可信 Host/执行上下文绑定。模型传入的路径只指定目标；保护已有 workspaceRoot/chatUuid 注入边界。
2. 接受工作区相对路径和当前操作系统原生的工作区内绝对路径，统一返回工作区相对路径。工作区根路径返回 `.`。
3. 保留空值、NUL、`..` 段校验。`~`、环境变量和 file URL 按既有路径语义处理，工具文档明确使用实际路径。
4. 使用路径段包含判断，拒绝同前缀兄弟目录。原生绝对路径先检查词法归属，再检查 canonical 归属；允许工作区本身的原始根路径与真实根路径别名，支持 macOS `/tmp` 与 `/private/tmp` 这类根别名。
5. 复用 `WorkspacePathBoundary` 的现有前缀 canonicalization。已有目标解析符号链接；新建目标通过最近已存在父级检查。内部链接继续可用，外部及悬空链接保持拒绝。
6. 普通工作区外目标返回 `PATH_OUTSIDE_WORKSPACE`；词法上在工作区内、实际链接越界返回 `PATH_SYMLINK_ESCAPE`；跨平台路径形态返回明确格式错误。保留已有稳定错误码中语义仍适用的项。
7. mv 的源和目标分别校验。glob/grep/tree 等遍历继续执行已有的逐项边界约束。
8. 底层共享 resolver 的消费者包括 vision、skills 等。实施前枚举调用点，保留明确要求相对路径的消费者；文件工具切换到语义准确的 workspace-contained 模式，避免复用带历史 userData 路径映射的 legacy 模式。
9. canonical 检查是应用层路径约束；保持现有 TOCTOU/操作系统沙箱边界，实施文档准确描述覆盖范围。

工作区为 `/app/project` 时：`src/a.ts` 与 `/app/project/src/a.ts` 等价；`/app/project-next/a.ts`、`../a.ts`、指向外部的 `link/a.ts` 拒绝；`new/a.ts` 校验可创建父级。

## 失败契约

采用一个可序列化的共享失败描述，复用现有结果通道，新增字段保持向后兼容。已有 `success`、`status`、`error` 文本和 command stdout/stderr/exit_code 等事实继续可用。禁止为分类额外堆叠新的执行状态机或自动重试器。

失败描述包含：

- `category`：`input` / `policy` / `operation` / `environment` / `internal`。
- `code`：稳定、具体的机器码，如 `PATH_OUTSIDE_WORKSPACE`、`FILE_NOT_FOUND`、`EDIT_MATCH_NOT_FOUND`、`COMMAND_NONZERO_EXIT`、`COMMAND_SPAWN_FAILED`。
- `message`：简短事实与解释；避免带入密钥、环境变量全集、原始 API payload 或外部链接目标。
- `recovery`：`correct_input` / `change_strategy` / `check_environment` / `check_state` / `limited_retry` / `stop`，附简短可执行提示（可用同一字段对象表达）。
- 必要的结构化来源事实：原始系统 code、exit code、termination signal 等优先复用现有字段；扩展 details 仅承载已确认事实。

超时与取消保留独立的终止事实：`timeout`、`cancelled`、`signal`，沿用已有 runtime status/命令字段并补齐结构化原因。用户取消要求 `stop`；超时/信号终止要求 `check_state`，提示检查部分产物。分类信息本身不触发重试。

### 分类映射

| 来源 | 分类/行为 |
| --- | --- |
| 无效 JSON、缺参数、无效路径格式 | input，correct_input |
| 路径越界、链接逃逸、审批拒绝 | policy，change_strategy 或 stop；恢复提示指向允许范围/正常授权流程 |
| 文件不存在、对象类型不匹配、edit 匹配失败 | operation，correct_input/change_strategy |
| 命令正常启动并非零退出 | operation / COMMAND_NONZERO_EXIT；保留完整退出码与输出，模型按命令语义解释 |
| exec 启动 ENOENT/EACCES、磁盘满、已确认系统权限错误 | environment，check_environment |
| 未识别的异常、序列化/协议内部错误 | internal，check_state 或 stop |
| 命令超时/信号结束/用户取消 | 独立终止事实，check_state 或 stop |

grep 无匹配按文件工具既有成功空结果处理。任意 shell 的非零退出统一保留事实，shell 内部的 `command not found` 仍由退出码/输出表达；不要根据任意 stderr 关键词推断网络策略或依赖错误。传输已完成与操作成功是两个现有维度：`status: success` + payload `success: false` 可保留，但失败描述必须可由消费端确定读取。

## 实施顺序与代码位置

1. 读取并枚举 `services/filesystem/WorkspacePathResolver.ts`、`WorkspacePathBoundary.ts` 所有调用点，以及 `tools/fileOperations/FileOperationsProcessor.ts` 的统一入口/返回结构。
2. 在共享契约合适位置定义最小失败描述与转换帮助函数。services 保持对 tool processor 零依赖。
3. 实现工作区内绝对路径、根别名及边界错误码；更新文件工具描述、CLI 使用提示和相关测试。
4. 文件错误从结构化异常/明确分支生成失败描述；命令错误使用 `CommandProcessRunner` 现有事实；通用执行入口保留参数/审批/取消/内部异常原因。
5. 沿 `ToolExecutor -> ToolExecutorDispatcher -> ToolResultFact -> transcript/模型请求` 检查字段保留。大结果规范化/序列化时也应保留必要错误分类。避免为 UI 做无关重构。
6. 更新本指导文档的实施状态与验证记录，补充 ADR 与文档索引；相关现行路径说明保持一致，历史归档保持原样。

当前工作区含 CLI Host/评测等未提交工作。修改时保留所有已有 diff；发现并发变更先核对后编辑。完成后报告准确文件范围，保留未提交状态。

## 验收与验证

- 路径：相对/绝对等价；根路径；相邻前缀拒绝；`..`/NUL/跨平台格式拒绝；内部/外部/悬空 symlink；工作区根别名；未创建多级父目录；mv 双端校验；遍历保持边界。
- 结果：缺文件、编辑未匹配、无效 JSON、审批拒绝、正常退出、非零退出、启动 ENOENT、超时、取消、内部异常均有稳定分类/恢复动作；保留原始退出事实与已有返回兼容性。
- 集成：至少验证一次结构化失败从真实 processor 经 executor/runtime 转录抵达下一次模型请求；使用 stub 模型，避免真实费用。单独验证取消停止及失败路径无自动重试。
- 运行最小相关 Vitest 套件，并执行 `pnpm run check:main-boundaries`、`pnpm run check:main-doc-paths`、`pnpm run test:main-architecture`、`pnpm run typecheck:node`。只对改动文件运行 lint，避免全仓 autofix。
- 若发现既有基线失败，隔离验证并记录，保留失败事实。Windows 原生路径测试根据运行平台覆盖，并明确当前 macOS 环境的验收边界。

## 实施记录

实现范围：

- 路径边界：`src/main/services/filesystem/WorkspacePathResolver.ts`、
  `src/main/tools/fileOperations/FileOperationsProcessor.ts` 及对应测试；
  文件工具描述、共享响应类型和 CLI 使用提示同步更新。
- 失败契约：`src/shared/tools/toolFailure.ts`、
  `src/main/agent/contracts/errors.ts`、`ToolExecutor`、
  `ToolExecutorDispatcher`、`ToolDispatchOutcome`、`ToolResultFact`、
  `CommandProcessor` 及对应命令/执行器测试。
- 参数校验：空命令返回 `input / COMMAND_INVALID_INPUT`；缺失或非字符串
  写入内容返回 `input / FILE_CONTENT_INVALID`，在创建目录和备份前结束。
  空字符串内容作为合法写入保留。
- 运行时传递：`ToolResultContentProjector`、结果规范化测试、
  `RequestMaterializer`、聊天渲染结果与事件状态；补充真实
  `FileOperationsProcessor -> ToolExecutor -> Dispatcher -> transcript ->
  RequestMaterializer` 集成测试。
- 文档：`docs/architecture/sandbox-design.md`、
  `docs/decisions/0008-workspace-path-confinement.md`、
  `docs/decisions/0019-workspace-tool-failure-contract.md` 及决策索引。

关键决策：workspace-contained 文件工具接收当前平台原生的工作区内绝对
路径并返回相对路径；词法边界先于 canonical symlink 边界，根路径及其真实
根别名保持可用，外部 alias 指向工作区内部的路径保持拒绝。vision 与
WorkspaceWebFetchArtifactService 等 relative-only 消费者保持原模式。失败
描述通过现有结果和生命周期通道传递，保留兼容字段；解析器专属的参数错误
才归类为 input，未知异常归类为 internal。timeout、signal、cancelled 保留
独立 termination 事实，分类过程不触发自动重试，也不改变审批策略。

验证结果：

- 隔离验证：从 `40a1948735faf96ca15d2b169ecf017a028f732c` 导出 HEAD，
  叠加本次代码并复用依赖。CLI Host、shell environment、日志和
  CommandProcessRunner 等原有改动排除在代码叠加范围之外。
- 隔离快照相关 Vitest：9 个文件、172 项测试通过，包含临时工作区集成
  链路、路径 symlink/根别名边界、命令非零退出/启动失败/timeout、参数
  校验、内部 SyntaxError、审批取消、冷回放和大结果归档场景。
- Node 类型检查保留独立 HEAD 已知基线：
  `src/main/tools/webTools/__tests__/webToolsUnits.test.ts:352` 的
  `TS18048 engine possibly undefined`；本轮代码未新增 Node 类型错误。
- 当前工作区的主进程边界检查、文档路径检查通过，架构测试 7 项通过。
- 对本次改动的 TypeScript 文件执行 ESLint：仍有 95 个已有错误，新增及
  修改行上的 error 为 0。保留全量 lint 的失败事实，避免无关格式修改。
- 集成验证使用真实文件 processor，并组装下一次模型请求；本轮验证产生
  零模型 API 调用，FrontierHarness 保持暂停。未执行提交或推送。

验证命令（隔离快照直接调用相同的 Vitest/TypeScript 入口）：

```sh
pnpm exec vitest run \
  src/main/services/filesystem/__tests__/WorkspacePathResolver.test.ts \
  src/main/tools/fileOperations/__tests__/FileOperationsProcessor.test.ts \
  src/main/tools/command/__tests__/CommandProcessor.test.ts \
  src/main/agent/tools/__tests__/ToolExecutor.test.ts \
  src/main/agent/runtime/tools/__tests__/ToolExecutorDispatcher.test.ts \
  src/main/agent/runtime/tools/__tests__/ToolResultContentProjector.test.ts \
  src/main/agent/runtime/tools/result-normalization/__tests__/ToolResultNormalizer.test.ts \
  src/main/agent/runtime/transcript/__tests__/RequestMaterializer.test.ts \
  src/main/agent/runtime/tools/__tests__/ToolFailureIntegration.test.ts
pnpm exec tsc --noEmit -p tsconfig.node.json --composite false
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
git diff --check
```

现存限制：本轮保留现有 pathname TOCTOU、操作系统沙箱、硬链接和挂载边界；
Windows 原生路径的执行验收仍需 Windows 环境。绝对路径处理、失败分类和
运行时传递保持为当前实现范围，自动重试与授权策略继续由各自后续任务负责。
