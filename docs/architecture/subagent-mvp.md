# Subagent runtime

当前子代理是主 agent 按需委派的持续 worker 会话。child ID 跨任务保持稳定，
每次执行有独立 run ID。子代理仍在 Electron main 进程内使用统一 AgentRuntime
和 AgentLoop；它拥有独立上下文、角色提示词和工具权限。主 agent 负责目标、
集成与验收。执行 completed 和任务验收是两个事实。

相关决策：[生命周期 ADR-0050](../decisions/0050-supervised-subagent-lifecycle.md)、
[持久会话 ADR-0051](../decisions/0051-persistent-subagent-sessions.md)。
实施和验收见 [Agent Harness 分批实施](../work/plans/agent-harness-implementation.md)。

## 所有权与数据流

```text
Main RunManager / CLI runtime
  -> SubagentRunService: child/run identity, queue, controllers, inbox
      -> SubagentRuntimeFactory: model, workspace, role and task context
          -> AgentRuntime -> AgentLoop -> model / ToolExecutor
      -> db/subagents facade -> SQLite sessions / runs / messages
  -> parent approval/status bridge -> existing confirmation UI / status cards
Renderer mount -> validated read-only IPC snapshot -> revision-ordered store
```

- 宿主持有审批与状态通道，父 run 和存活 child 分别持有通道引用。
- 父 run 正常结束保留后台 child 和其待审批请求；最后一个 child 收尾后释放通道。
- 父 run 的显式 Stop、失败或中断取消该次委派；单独取消 child 只取消其自己的审批。
- runtime 使用每个 child run 的独立 AbortSignal，贯穿模型流、工具和实际命令。
- UI 状态事件和父模型获取结果分开。结果到达不会自动启动父模型，也不会唤醒被停止的用户任务。
- Electron、CLI、TUI 的正常退出先停止接收新子任务，等待子任务和命令进程组收尾，再释放资源。

## 工具接口

一个 `subagent` 工具通过 action 区分操作；子代理本身没有此工具权限。

| action | 参数与语义 |
| --- | --- |
| spawn | task 必填，role/context_mode/files 可选；创建 child 并启动首个 run |
| wait | subagent_id 必填；可用 run_id 锁定执行，after_revision 等待版本变化；超时或停止等待不取消 child |
| cancel / interrupt | subagent_id 必填；可用 run_id 避免误停新执行；保留历史 |
| inspect | subagent_id、可选 run_id；读取持久 transcript 与消息收据 |
| list | 返回当前 chat 的最新 child 记录 |
| send_message | subagent_id、message_id、message；持久投递信息，空闲 child 保持空闲 |
| followup_task / resume | subagent_id、message_id、task；同一 child 启动新 run，忙碌时明确拒绝 |

宿主覆盖 model_ref、chat_uuid、parent_submission_id 和审批模式；wait/control
检查 child 归属于当前 chat。每个新 run 使用当前父任务的审批模式与取消信号，
保留该 child 的模型引用、角色及工作区快照。message_id 在 child 内命名空间化，
同一内容与 ID 的重试返回同一 run；复用 ID 改内容会失败。单条消息/任务最多
32 KiB，待投递信息 inbox 最多 16 项，ID 的本地部分最多 128 个字符。
信息限额检查与插入在 SQLite immediate transaction 中完成；显式任务收据不占信息
槽位，满 inbox 仍能续接并消费已有信息。首次 spawn task 也限制为 32 KiB，续接
以经过限额检查的 task 与最多 16 条信息组成初始上下文。

## 调度和状态

运行上限为全局 4、父 chat 2；无 chat 时按父 submission 分组。最多排队
16 个任务。调度选择最早可执行任务，一个父组饱和时，其他父组可使用空闲槽位。
这些限制是单 app 进程内限制，不是跨进程调度器。

- queued 取消后直接成为 cancelled，绝不启动执行。
- running 取消先成为 cancelling，等待已启动 I/O 及命令进程组清理后成为 cancelled。
- completed、failed、cancelled、interrupted 终态不被迟到回调覆盖。
- revision 跨同一个 child 的 run 递增。wait 绑定当时的 run；旧 run 查询/取消不影响新 run。
- after_revision 可等待下一次状态变化；wait 清理订阅、计时器与 abort 监听器。
- waiting_for_confirmation 由 renderer 的持久审批记录派生，UI 还展示 Cancelling 和 Interrupted。
- renderer 重新挂载、切换 chat 或重启后读取快照，并用 revision 合并期间的实时事件。
- 历史结果卡只接受相同 run 的更新，较旧快照不覆盖较新结果；共享数据库中其他 host
  已创建的新 run 优先于本地旧缓存，后续续接从最新 revision 开始。

## 持久化与恢复

profile SQLite 中的三个增量表为 subagent_sessions、subagent_runs 和
subagent_messages。chat 删除级联删除对应记录。入队前保存输入与父归属，保存失败
不启动模型；终态保存 transcript、摘要、工具/成功文件写入事实和 provider usage。
result_ref 是可通过 inspect 的 run ID。后续存储失败单独出现在 persistence_error，
不伪装成可靠持久结果。查询旧记录不需要恢复任何 controller 或执行对象。

应用启动在接收任务前识别失去进程归属的非终态 run，标为 interrupted，并保留证据。
其他存活 PID、无权限确认的 owner 和可能的 PID 重用采取保守策略，不抢占执行。
启动恢复不运行模型或工具。进程初始化重复调用不重复扫描正在运行的任务。

每个 run 仅保存新增 transcript records，并通过 previousRunId 连接历史，避免每轮复制全部历史。
inspect 返回该 run 的增量证据及 previous_run_id；继续执行时按前驱顺序恢复并去重 record ID。
持续历史来自 worker 自己的记录，不是完整父会话 fork。新指令追加在
历史之后。旧 assistant 调用缺少结果时，补充“执行结果未知，先检查副作用”的记录，
保持协议配对，不重放历史工具。准备阶段失败仍能沿 previousRunId 找回此前证据。

消息按持久顺序投递。执行前已经排队的信息与任务一起进入首个模型请求。运行中的信息通过 loop 现有安全 checkpoint 消费，工具批次
完整收口后才插入。空闲信息在显式 followup/resume 时进入新任务；不会自行执行。
run 入队与任务收据绑定在同一 SQLite 事务中。中断交付转为 ambiguous，禁止自动
重新投递。外部操作可能在崩溃前已经发生，显式恢复需要检查实际状态。

## 提示词、上下文和权限

[独立 worker prompt](../../src/shared/prompts/subagent.ts) 继续约束任务范围、证据、
仓库指令、已有用户改动保护、工具审批和最终交付。主会话的身份、Soul、用户资料、
情绪及技能目录不进入 worker prompt，见 [ADR-0040](../decisions/0040-independent-subagent-system-prompt.md)。

minimal 只注入任务和文件提示。current_chat_summary 另外提供父 chat 最近 8 条
消息各最多 400 字符的片段、work context 与最多 5 项 activity。主 agent 必须在
任务中携带用户约束；files 是定位提示，不是写入隔离。

每次 run 继续使用 80 步上限。工具由 metadata、agent kind 和 role 决定：
write/edit 只向 general/coder 开放；researcher/reviewer 仍能使用 exec，因此不构成
操作系统只读隔离。plan、schedule、递归 subagent 和全局管理工具继续关闭。
manual 模式沿用现有风险/路径审批；auto 模式沿用已有自动批准策略。

CLI 的临时模型请求规格通过匹配 model_ref 的活跃父通道传给 worker，父提示词和
工具会被 worker 的策略替换。临时 API 凭据不落盘。父通道失效后，恢复需要同一
模型引用仍可解析；否则明确失败，不自动选择另一个模型。

## 证据与限制

失败和取消保留已收集工具、成功 write/edit 路径及最多 32,000 字符的部分正文。
exec 改文件仍需 worker 报告，files_touched 不等同完整 git diff。命令原始日志见
[ADR-0052](../decisions/0052-streamed-command-output-artifacts.md)。usage 是各 run 的
provider 计量；不要重复计入父 run，也不把缺失 usage 当成零。

当前没有团队 roster、成员互相发消息、批次工具、worktree 集成或自动合并。
日志/文本写入保护保持各自边界。正常退出保证依赖工具响应信号；强制杀进程、
真实 provider 网络取消和原生 Windows 仍需对应平台验收。
