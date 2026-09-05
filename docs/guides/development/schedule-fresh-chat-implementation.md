# Schedule 每次尝试创建新会话：实施指导

Status: Implemented; desktop acceptance pending<br>
Owner: Main process and chat renderer maintainers<br>
Last verified: 2026-09-03<br>
Related architecture: [Scheduled tasks](../../architecture/scheduled-tasks.md)

## 已确认目标

每次 once / cron 触发，以及同一次触发失败后的每次自动重试，都创建独立的空 chat。来源 chat 保留任务创建、列表、更新和取消的归属。每次执行的消息和结果保存在对应的新 chat，用户可从会话列表打开继续追问。

任务完整指令使用现有 `payload.prompt.trim() || task.goal` 规则。工具描述要求指令自包含：执行对象、约束、输出要求与必要路径都应明确。已有任务按原指令执行，历史聊天消息保持原样；依赖“刚才”等上下文的旧任务需要用户更新指令。

## 行为约定

1. `task.chat_uuid` 始终指向来源 chat。来源 chat 的交互运行状态与 schedule 执行相互独立。
2. 新 chat 显式构造：新 UUID、空 messages、零消息计数、空会话指令、任务目标短标题 + 本次预定时间 + 尝试序号。保留应用基础规则。历史消息、摘要、附件、分叉信息、技能绑定和宿主绑定从空开始。
3. 执行模型沿用现有顺序：payload.modelRef → 配置中的 lite 模型 → 来源 chat.modelRef。新 chat.modelRef 保存本次实际使用的模型。
4. 工作目录和 permissionApprovalMode 读取来源 chat 的当前值。来源无工作目录时使用新 chat 的默认工作目录，并确保运行所需目录可用。权限模式沿用现有规范化与审批链路。
5. 来源 chat 缺失时走现有失败、退避和最终通知路径。调度器在创建 chat 前校验最终执行指令和 payload modelRef 的形状，并在工作目录准备完成后重读来源 chat，确认来源仍存在且 workspace、permission 配置保持一致。模型解析、创建 chat、关联写入和来源配置变化都必须占用当前尝试预算并完成状态结算。
6. 每次尝试新建 chat；同一 occurrence 的 run.id 保持稳定，attempt_count 递增。已失败尝试的 chat 保留，可单独打开。
7. 后台创建新 chat 时刷新列表，保持当前选择。运行和消息事件携带执行 chat 的身份，任务管理更新携带来源 chat 的身份。
8. 保留 claim 唯一性、每任务一个 active occurrence、串行 tick、退避上限、取消、启动恢复以及 occurrence 级原生通知去重。来源 chat 忙碌不再延迟 schedule。

## 数据和执行链路

```text
schedule 工具 → task（来源 chat）→ occurrence run
                                   ↓ claim / attempt
                              fresh execution chat
                                   ↓
                              RunService
                                   ↓
                        执行 chat 消息与运行事件
                                   +→ 来源任务状态更新
```

在现有 scheduled_task_runs 增加可空的 `execution_chat_uuid`，保存当前尝试的会话。新尝试开始时清空该字段，绑定成功后写入 UUID，尝试结束后保留到下一次开始。增加小型 `scheduled_task_run_attempts` 表，记录 `run_id`、`attempt`、`submission_id`、`chat_uuid`、`created_at`，以 `(run_id, attempt)` 唯一；该表保存各次尝试的关联事实，run 字段用于当前状态事件和恢复。关联成功写入后才启动模型执行。通过 planningDb 和既有数据库分层暴露操作与读取，SQL 留在 DAO。

使用增量、幂等 schema 初始化，已有 tasks、runs、chats、messages 原样保留。旧 run.execution_chat_uuid 为 null。终态 run 清理沿用最近 100 条策略，关联表随 run 清理；chat 采用原有用户管理生命周期。关联表通过 run 外键级联清理，chat UUID 作为可缺失的历史引用，删除某次执行 chat 保留任务定义和其他执行。

工作目录准备与来源校验完成后，在同一 SQLite 事务内插入空 chat、记录尝试关联并更新 run 当前 chat。绑定失败整体回滚，进程中断也由 SQLite 保证这三处写入一致。事务提交后才发布开始事件和执行模型；已绑定 chat 沿用普通会话生命周期。数据库关联失败后按原失败路径结算。

每次尝试都应完成 renderer 运行状态清理，包括可重试失败；可复用 RunService 的终态事件。`schedule.run_finished` 的 occurrence 终态与原生通知去重含义保持清楚。启动恢复优先使用持久化 execution_chat_uuid，兼容旧 run 的来源归属。

## 实施范围

本次跨数据库、调度、共享契约、renderer 事件和测试，预计超过 8 个文件；采用一个完整可用变更，沿用已有服务与依赖。

- `src/main/db/core/Database.ts`、`dao/ScheduledTaskDao.ts` 及 planningDb 服务/仓储/门面：增量 schema、尝试关联、历史读取、取消恢复与清理。
- `src/main/services/scheduler/SchedulerService.ts`：新建 chat、持久化绑定、模型和权限配置、执行与终态事件目标。
- `src/shared/tools/schedule/`、`src/shared/schedule/events.ts`：类型同步、自包含指令说明和必要的 chat 创建信息。
- `src/renderer/src/features/chat/schedule/` 及既有 chat 列表事件入口：列表可见性、执行状态归属、当前选择稳定性。先读取 DESIGN.md；复用现有 store 和通知流程。
- 对应 colocated tests、`docs/architecture/scheduled-tasks.md` 和新 ADR：同步最终事实。文档索引仅增加本任务链接，保留已有未提交内容。

自动归档、列表重设计、自动重写历史任务、后台权限扩张和历史消息搬迁独立于本次范围。工作目录共享意味着文件内容与外部副作用可以跨尝试存在；会话隔离不提供外部操作幂等性。

## 验证与交付

必须覆盖：连续两次触发得到不同 chat；失败重试再次新建且旧 chat 关联保留；来源消息与运行状态保持原样；新 chat 不带历史、会话指令或 fork 元数据；模型、目录和权限符合约定；后台新 chat 可见且选择稳定；retry/failure/cancel/restart 正确路由并清理运行状态；缺失来源、模型错误和绑定失败按预算结算；chat 插入与关联写入在中途数据库错误下整体回滚；旧 schema 升级保留数据；尝试关联随 run 清理且 chat 保留；task 管理仍按来源授权。

运行相关 scheduler、DAO/schema、schedule 工具、IPC 和 renderer 测试；运行 `pnpm run typecheck:node`、`pnpm run typecheck:web`、`pnpm run check:main-boundaries`、`pnpm run check:renderer-boundaries` 和文档路径检查；对本任务文件执行 ESLint 与 `git diff --check`。环境或已有代码失败应记录具体位置和可重现命令，隔离后明确归因。

DAO 与 schema 升级验收使用真实 SQLite。macOS 开发环境可执行：

```sh
ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  ./node_modules/vitest/vitest.mjs run \
  src/main/db/dao/__tests__/ScheduledTaskDao.test.ts \
  src/main/db/repositories/__tests__/ScheduledExecutionChatTransaction.test.ts \
  src/main/db/core/__tests__/ScheduleSchemaUpgrade.test.ts
```

普通 Node 中上述 native 用例采用跳过策略；记录结果时区分实际执行和跳过。依赖需维持当前 Electron ABI，验证过程保持已安装 native 模块原样。

Electron 实机验收：低风险任务触发后列表出现新 chat，当前会话保持选中；再次触发与自动重试产生不同 chat；打开结果可追问；原任务可取消；来源消息数量保持原样。可控测试环境之外的真实定时任务和用户数据库保持原样，实机证据缺口需如实交付。

### 2026-09-03 验证记录

在 HEAD 加本次源码改动的隔离副本中验证，既有其他功能的工作区修改保持原样。

| 检查 | 结果 |
| --- | --- |
| Scheduler、helper、cron、schedule 工具、schema mock、IPC、renderer 事件 | 9 套测试，79 项通过 |
| Electron 原生 SQLite：DAO、持久化升级、创建与绑定事务 | 3 套测试，11 项通过 |
| Web TypeScript | 通过 |
| Node TypeScript | 既有 `src/main/tools/webTools/__tests__/webToolsUnits.test.ts:352` 的 TS18048；与 HEAD 结果一致 |
| Main / renderer 依赖边界与活动文档路径 | 通过 |
| 本次涉及文件的 ESLint | 63 个既有错误；逐文件对照 HEAD 确认新增错误为 0 |
| `git diff --check` | 通过 |

事务测试通过 SQLite trigger 在尝试关联写入后注入 run 更新失败，确认 chat、关联记录与当前 run chat 引用一起回滚。架构复核确认模型调用及开始事件均发生在事务提交之后。

桌面实际触发、通知展示和追问操作仍待实机验收。源码处于未提交状态。

执行完成后由主代理审查完整改动并修复发现的问题。保留全部无关 WIP，交付文档、实现、验证结果和剩余验收项。Git 提交与推送等待用户明确要求。回滚代码保留新增可空列、关联表和生成的 chat，已有数据可继续保留。
