---
title: "@i 命令执行与文件工具安全边界"
type: "design"
tags: ["sandbox", "security", "command", "filesystem", "architecture"]
created: "2026-07-20"
updated: "2026-07-21"
source: "design"
status: "draft"
---

# @i 命令执行与文件工具安全边界

## 1. 文档范围

本文记录当前已经落地的命令执行与文件工具安全能力，并将操作系统级沙箱列为
独立 roadmap。当前实现包含三个阶段：

- P0：login shell PATH bootstrap
- P1：spawn 流式执行、有限输出和进程树生命周期管理
- P2：workspace 文件工具路径约束

macOS `sandbox-exec`、SBPL 策略和动态 profile 生成器均列入后续设计。默认命令
执行路径继续使用 `CommandProcessRunner` 启动宿主机子进程。

## 2. 当前执行路径

```
@i
  → ToolExecutor 风险与权限确认
  → CommandProcessor 环境准备
  → CommandProcessRunner
  → spawn 宿主机子进程
```

命令进程继承宿主机用户权限。当前应用层保护包括工具风险评估、用户确认、
filesystem scope 元数据、命令输出限额和进程树终止。文件操作工具通过共享 resolver
限制在当前 chat workspace 内。操作系统级进程和文件系统隔离进入后续 roadmap。

## 3. 当前已实现能力

### Login shell PATH bootstrap

Electron GUI 进程可能缺少用户 shell 初始化文件配置的 PATH，导致
`execute_command` 和 `run_skill_script` 找不到 `brew`、`gh`、`node`、
`npx`、`cargo`、`rustup` 等用户工具。

`CommandProcessor` 在风险评估和确认完成后、构造命令环境前调用
`ensureLoginShellPath()`。探测能力采用模块级 Promise 缓存，并发首调用共享
同一次探测，后续调用直接复用结果。

POSIX 平台按以下顺序探测 shell：

1. `process.env.SHELL`
2. `/bin/zsh`
3. `/bin/bash`
4. `/bin/sh`

每个候选 shell 通过 `-ilc` 启动，固定探测脚本只输出带边界标记的 PATH。
探测子进程设置 Oh My Zsh 更新与 tmux 自动启动防护变量，配置 5 秒超时和
受限输出缓冲。启动脚本输出噪声由边界标记隔离，候选失败后继续尝试下一个
shell。

合并后的优先级为：

```text
命令参数 env.PATH
  → login shell PATH
  → Electron 原 PATH 中的独有路径
```

PATH 条目按平台分隔符拆分，过滤空项并保持首次出现顺序。探测成功后同步
更新 `process.env.PATH`，后续命令子进程直接继承。所有候选失败时沿用
Electron 原 PATH，命令继续执行。Windows 直接沿用系统进程 PATH。

日志记录候选 shell、尝试次数、耗时、PATH 条目数量和失败元数据。日志内容
省略完整 PATH 与 shell 输出。

验证覆盖一次性缓存、并发首调用、PATH 合并顺序、重复项过滤、shell 回退、
超时降级、启动输出噪声、Windows 分支，以及命令参数 `env.PATH` 的优先级：

```bash
pnpm exec vitest run src/main/services/__tests__/shellEnvironment.test.ts \
  src/main/tools/command/__tests__/CommandProcessor.test.ts
pnpm run typecheck:node
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
```

### 命令进程执行与有界输出

`CommandProcessor` 通过 `CommandProcessRunner` 统一启动命令。简单命令先按
`PATH` 解析可执行文件，再以 `shell: false` 等价的参数数组形式执行；复杂命令
显式调用候选 shell，POSIX 使用 `shell -c <command>`，Windows 使用
`cmd.exe /d /s /c <command>`。候选 shell 启动返回 `ENOENT` 时继续尝试下一项。
`run_skill_script` 在风险与文件范围评估后通过内部 executable/argv 调用执行，
保留跨平台参数边界；Windows `.cmd`/`.bat` 脚本通过 `cmd.exe` 的转义参数串执行。

runner 将 stdin 设为 `ignore`，stdout 和 stderr 设为 pipe，并以 `close` 事件作为
本次执行的完成边界。每个输出流使用 `StringDecoder` 增量解码，实时 chunk
通过可选的执行上下文回调进入工具进度链路。

终态结果对 stdout 和 stderr 分别采用 512 KiB 的头尾保留策略。响应同时记录：

- `stdout_bytes` / `stderr_bytes`：截断前的原始字节数
- `stdout_truncated` / `stderr_truncated`：终态文本是否经过有界保留
- `termination_signal`：子进程收到的终止信号

这些元数据也进入 `ExecuteCommandResultCompactor` 的紧凑结果，模型可以区分
完整输出和有界输出。

timeout 和调用方 `AbortSignal` 共用进程树终止路径。POSIX 子进程创建独立进程
组，先发送 `SIGTERM`，2 秒宽限期后向原进程组发送 `SIGKILL`。该清理租约拥有
独立生命周期，leader 的 `close` 与命令结果结算会保留它。延迟升级仅使用负
PGID；`ESRCH` 表示进程组已经清理完成，正 PID 回退仅用于首次即时终止路径。
Windows 使用系统 `taskkill.exe /pid <pid> /T /F` 清理进程树，taskkill 进程在
leader 关闭后继续独立完成；taskkill 启动或执行失败时直接终止子进程。终止流程
设置 7 秒最终收敛期限。timeout 统一归一化为 1 ms 到 24 小时范围内的有限整数。
已取消的请求在 spawn 前直接结束。

聚焦验证覆盖 UTF-8 跨 chunk 解码、stdout/stderr 分流、大输出头尾保留、非零
退出码、timeout、AbortSignal、leader 关闭后的 descendant 清理、延迟升级的
group-only `ESRCH` 路径、spawn 失败、命令响应元数据和 compactor 元数据：

```bash
pnpm exec vitest run \
  src/main/services/command/__tests__/CommandProcessRunner.test.ts \
  src/main/tools/command/__tests__/CommandProcessor.test.ts \
  src/main/orchestration/chat/toolResultCompaction/__tests__/ExecuteCommandResultCompactor.test.ts
pnpm run typecheck:node
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
```

### Skill 文件与脚本安全边界

`read_skill_file`、`run_skill_script` 和 `SkillCache` 通过共享的
`SkillPathResolver` 访问已安装或内置 skill。resolver 接受 skill-relative 路径，
执行 lexical containment、skill root `realpath`、目标 `lstat` 与目标 `realpath`，
最终通过 `path.relative()` 验证 canonical target 位于 canonical skill root 内。
workspace 内部与 skill root 使用两套独立 resolver，各自维护对应的信任边界。

skill root 内部 symlink 可以指向同一 skill 下的文件。外部 symlink 返回
`PATH_SYMLINK_ESCAPE`，dangling symlink 返回 `PATH_CANONICALIZATION_FAILED`。
`SKILL.md` 元数据与正文读取、`.skill-source.json` 读取、skill 文件读取和脚本执行
均使用 canonical target。`.skill-source.json` 写入先移除已有目录项，再以 `wx`
创建 regular file；并发替换会触发创建失败，外部 symlink target 保持原值。

`run_skill_script` 的工具元数据标记为 warning 且会修改 workspace。`ToolExecutor`
在用户确认或可信 auto approval 后，通过内部执行上下文设置
`metadataConfirmationApproved`。processor 只依据该上下文生成命令层的 `confirmed`
字段，模型参数和直接 processor 调用无法生成可信确认。脚本以 canonical path
执行，工作目录固定为 canonical skill root，参数继续使用 executable/argv 边界。

canonical path 校验与后续 `stat`、`readFile`、`spawn` 仍属于独立系统调用，skill
目录的并发修改会形成 TOCTOU 窗口。descriptor-relative 文件访问和操作系统级沙箱
是该边界的后续强化方向。

聚焦验证覆盖内部、外部与 dangling symlink，skill cache 元数据读取与安全替换，
可信 metadata approval 传递，以及模型参数和直接 processor 调用的确认隔离：

```bash
pnpm exec vitest run \
  src/main/services/skills/__tests__/SkillService.test.ts \
  src/main/tools/skills/__tests__/SkillToolsProcessor.test.ts \
  src/main/agent/tools/__tests__/ToolExecutor.test.ts
```

### Workspace preview 进程组生命周期

`DevServerProcessor` 在 POSIX 平台以 detached leader PID 固化 workspace preview
的 PGID。UI 停止请求向该进程组发送 `SIGTERM`，轮询整个进程组的存活状态，并
在 5 秒宽限期结束后向原负 PGID 发送 `SIGKILL`。强杀后的 2 秒确认期限负责验证
进程组已经退出。leader 的 `exit` 事件只刷新输出与退出日志，`stopProcess()` 持有
进程记录清理权；同一 server 的并发停止请求共享一个 stop Promise，因此每个
成功响应都代表进程组清理已经完成。

POSIX 探测将 `ESRCH` 视为进程组清理完成，将 `EPERM` 视为进程组仍然存活。
延迟升级固定使用 spawn 时保存的负 PGID，正 PID 终止路径用于未来可能加入的
非 detached 直接子进程。终止失败会保留 error 状态、诊断日志和进程记录，后续
停止请求可重试清理。

Electron `before-quit` 通过同步 `cleanupDevServers()` 立即向所有已登记 POSIX
进程组发送 `SIGKILL` 并清理记录；Windows 的 UI 停止与应用退出继续使用
`taskkill.exe /pid <pid> /T /F`。该退出路径直接发出强制终止信号，其生命周期
独立于异步宽限期。

聚焦验证使用真实 detached process group，覆盖忽略 `SIGTERM` 且重定向 stdio
的 descendant、leader 提前退出、并发停止租约、app shutdown 同步清理、
group-only `ESRCH` 和失败后的诊断状态与重试：

```bash
pnpm exec vitest run src/main/tools/devServer/__tests__/DevServerProcessor.test.ts
```

### 实时输出事件链

`CommandProcessRunner` 将解码后的 stdout/stderr chunk 交给可选的
`EmbeddedToolExecutionContext.onOutput`。`ToolExecutor` 最多每 100 ms 投递一批，
待投递的 stdout 和 stderr 各保留 32 KiB 尾部，将事件暂存预算固定为 64 KiB。
每个 tool call 同时生成单调递增序号和覆盖全部观测输出的累计字节数，再通过
以下链路投递：

```text
ToolExecutor
  → tool.execution_progress(output)
  → HostRenderEventMapper
  → tool.execution.output RunEvent
  → renderer IPC
  → chatStore.toolLiveOutputs[chatUuid:toolCallId]
  → ToolCallResult Results
```

同一 tool call 的 started 与 output 事件使用串行 Promise 链投递，终态事件等待
该链完成后发送。`tool.execution.output` 属于临时事件，继续进入 IPC 和 runtime
sinks，同时跳过 `runEventDb`。数据库 trace、聊天消息和冷启动 replay 保存工具
终态结果。

renderer 按 `chatUuid + toolCallId` 保存实时输出，stdout 和 stderr 各保留最近 64 KiB。
Results 弹窗分别展示两个流，并在用户停留于底部附近时跟随新内容。`\r` 进度
更新覆盖当前展示行。completed、failed、aborted 及 run 终态按 submission 清理
临时输出；最终结构化结果接管 Results 视图。

聚焦验证覆盖执行上下文透传、批次顺序、临时事件持久化策略、renderer 尾部
限长、过期序号过滤、终态清理和实时结果面板：

```bash
pnpm exec vitest run \
  src/main/agent/tools/__tests__/ToolExecutor.test.ts \
  src/main/agent/runtime/tools/__tests__/ToolExecutorDispatcher.test.ts \
  src/main/orchestration/chat/run/infrastructure/__tests__/event-emitter.test.ts \
  src/main/hosts/chat/runtime/__tests__/ChatRenderResponder.test.ts \
  src/renderer/src/features/chat/runtime/__tests__/chatRunEvent.test.ts \
  src/renderer/src/features/chat/state/__tests__/chatPerChatState.test.ts \
  src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallResult.test.tsx
pnpm run typecheck:node
pnpm run typecheck:web
```

### Workspace file-operation confinement

文件操作工具通过共享的 `WorkspacePathResolver` 约束 read、write、edit、grep、
glob、ls、tree、stat、mkdir 和 mv 的访问范围。嵌入式工具使用 workspace-relative
路径契约；renderer IPC 的兼容适配器接收 workspace 内绝对路径和历史
`workspaces/<chatUuid>/...` 格式，将其转换成相对路径后进入同一解析流程。

解析流程固定为：

1. 拒绝空值、NUL、POSIX/Windows/UNC 绝对路径和任意 `..` 段。
2. 规范化分隔符并相对 canonical workspace root 解析。
3. 通过 `lstat` 定位最长已存在前缀，再用 `realpath` 解析 symlink。
4. 通过 `path.relative()` 语义验证 canonical target 位于 canonical workspace root。

现有目标和待创建目标共用这条路径。workspace 内部 symlink 支持显式文件操作；
可解析且指向 workspace 外部的 symlink 返回稳定的 `PATH_SYMLINK_ESCAPE`，dangling
symlink 返回 `PATH_CANONICALIZATION_FAILED`。tree、glob、
grep 的 JavaScript fallback、search-files 和目录列表对每个条目使用 `lstat`，
将 symlink directory 作为终端条目并停止递归，从而约束外部目录访问和
symlink cycle。

ripgrep 从已验证的遍历根启动，每条结果路径在进入工具响应前再次经过 workspace
与请求子树 confinement 验证。embedded 搜索、glob、tree 和目录列表统一输出 workspace-relative 路径；
legacy renderer IPC 保留现有调用方需要的响应路径形态。
renderer IPC 的 `list_allowed_directories` 返回当前 chat 的有效 canonical workspace root。

mv 分别解析 source 与 destination，destination 通过最长已存在前缀支持新路径。
write 在启用 backup 时独立解析 `.backup` destination。`ToolExecutor` 在 embedded
handler 执行前使用当前 runtime chat UUID 覆盖工具参数中的 `chat_uuid`，workspace
选择权归属于当前聊天运行时。
所有 confinement 失败使用带稳定 code 的 `WorkspacePathError`，响应省略 canonical
外部目标和宿主机文件系统细节。详细契约见
[ADR-0008](../decisions/0008-workspace-path-confinement.md)。

resolver intent 用于记录操作语义，目标存在性与文件类型由各 processor 检查。
路径检查与文件系统操作之间存在系统调用窗口。resolver 提供 pathname confinement。
TOCTOU、hard-link inode provenance、bind mount、文件系统别名和特权 mount 变化仍是
当前残余风险，需要 descriptor-relative 操作或 roadmap 中的操作系统级文件系统隔离
继续收口。

## 4. OS sandbox roadmap

### 参考方向

此前的 macOS `sandbox-exec` 验证在 Electron 子进程上触发 SIGABRT。后续验证需要
覆盖 `process-fork`、Mach IPC、POSIX IPC、PTY、sysctl 和 IOKit 等运行时能力。

候选 SBPL 策略结构：

```
seatbelt_base_policy.sbpl
  ├── deny default
  ├── process-exec / process-fork / signal / process-info*
  ├── 100+ sysctl-read（hw.*, kern.*, net.*, vm.*）
  ├── mach-lookup（cfprefsd, opendirectoryd, PowerManagement）
  ├── ipc-posix-sem* / ipc-posix-shm*
  ├── PTY（/dev/ptmx, /dev/ttys*）
  └── iokit-open（RootDomainUserClient）

+ 动态生成（运行时追加）
  ├── file-read*（subpath workspacePath）
  ├── file-write*（subpath workspacePath）- WorkspaceWrite 模式
  └── deny file-write*（.git 等保护路径）
```

roadmap 的首个目标是验证 macOS `sandbox-exec` 集成：

```
sandbox-exec -p '(SBPL 策略)' -- /bin/zsh -c '<command>'
```

VM、OverlayFS 和文件差异审查属于更远期阶段。

规划执行路径：

```
CommandProcessor.ts
  ├── risk assessment（当前已实现）
  ├── filesystem scope（当前已实现）
  ├── login shell PATH bootstrap（当前已实现，一次性缓存）
  ├── sandbox-exec（roadmap）
  │   ├── 嵌入式 SBPL 模板
  │   ├── 动态路径策略生成
  │   ├── 平台能力检测和降级策略
  │   └── 日志记录
  └── CommandProcessRunner（当前已实现）
```

下面的名称描述 roadmap 组件边界：

| 状态 | 组件 | 说明 |
|------|------|------|
| roadmap | SBPL 模板 | 提供 macOS Seatbelt 基础策略 |
| roadmap | 动态 profile 生成器 | 按 workspace 和保护路径生成策略 |
| roadmap | sandbox 执行适配器 | 在 `CommandProcessor` 与 runner 之间接入 OS sandbox |

### Phase 0：验证

以下阶段均为规划状态。

在 Electron 环境重测 `sandbox-exec`：

- 以成熟的 Seatbelt 策略为参考建立最小验证 profile
- 在独立实验入口中用 `sandbox-exec` 包装命令
- 测试常见命令（`ls`、`git`、`npm`、`node`、`cat`、`echo` 等）
- 确认 Electron 子进程是否需要额外权限
- 输出验证结论和失败权限清单

### Phase 1：集成

- 嵌入式 SBPL 模板
- 动态路径与保护路径策略生成
- OS sandbox 执行适配器
- 平台能力检测和降级策略
- 日志与监控

## 5. 开放问题

1. Electron 子进程是否需要比 Codex CLI 更多的 Mach IPC / IOKit 权限？
2. sandbox-exec 失败后 fallback 到无沙盒模式，是否需要在 UI 上提示用户？
3. 是否引入 sandbox 模式参数（seatbelt / none），还是完全透明？
