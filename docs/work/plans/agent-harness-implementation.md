# Agent Harness 分批实施与验收

Owner: Agent runtime maintainers<br>
Status: Active<br>
Started: 2026-10-22<br>
Updated: 2026-10-22<br>
Target: 可靠后台委派、持续会话、日志恢复和请求组成测量<br>
Exit criteria: 对应实现、自动化检查与运行验收完成；真实 provider/平台边界单独保留<br>
Related specs: [工具结果契约](../../specs/tools/tool-result-normalization.md)<br>
Related implementation: [Subagent service](../../../src/main/services/subagent/subagent-run-service.ts), [Command spool](../../../src/main/services/command/CommandOutputSpool.ts), [Composition metrics](../../../src/main/agent/runtime/context/RequestCompositionMetrics.ts)<br>
Related architecture: [Subagent](../../architecture/subagent-mvp.md), [Main process](../../architecture/main-process-architecture.md)

## 实施顺序与当前范围

| 批次 | 交付物 | 当前状态 |
| --- | --- | --- |
| 1 | 取消、不可变终态、审批/状态接线、有界调度、退出清理 | 已实现 |
| 2 | child/run 分离、SQLite 记录、证据查询、中断识别、UI 快照恢复 | 已实现 |
| 3 | 命令流式落盘、内存预览、磁盘配额与恢复语义 | 已实现 |
| 4 | 持续 child、持久消息、followup/resume、版本等待和防重复执行 | 已实现 |
| 5 | 请求组成测量和 provider usage 记录 | 已实现测量；保持现有工具披露，等待真实同题收益证据 |
| 6 | 批量、团队、专职协调 | 按实际需求进入；当前没有成员协商或 worktree 集成的任务证据，继续暂缓 |

独立 worker prompt、文件版本校验/全局修改队列/原子发布、稳定 modelContent、
条件工具过滤和说明体量预算继续复用。没有新依赖、用户设置、模型后端、递归委派
或自动合并。持久化与日志保留的决策见 ADR-0051、ADR-0052。

## 核心验收边界

- 取消 active 任务先进入 Cancelling，清理后再 Cancelled 并释放槽位；等待取消不隐式停止任务。
- 父 run 正常结束保留后台 child 和审批，Stop/失败/中断取消本次委派。
- 再次加载的 UI 用持久快照与 revision 合并实时事件，旧 run 不能倒退或停止新 run。
- SQLite 初始保存失败不派发；后续失败单独暴露。恢复只标记中断，不自动运行。
- followup/resume 用稳定任务 ID 防重复入队，保留 workspace/model/role，刷新父审批模式和 signal。
- 消息送达、上下文消费、执行完成和任务验收分开；中断交付不自动重发。
- 恢复历史缺失的工具结果仅补不确定事实，不重新派发工具。
- 超长日志能恢复预览缓冲之外的原文；存储失败/配额/部分文件有明确元数据。
- 请求统计仅包含体量、计量与身份，记录不包含 prompt、凭据或工具正文。

## 自动化命令

```sh
pnpm run typecheck
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run check:main-doc-paths
pnpm run check:renderer-boundaries
pnpm run test:renderer-architecture
pnpm run check:renderer-doc-paths
pnpm test:coverage --maxWorkers=4
pnpm build
ELECTRON_RUN_AS_NODE=1 pnpm exec electron node_modules/vitest/vitest.mjs run src/main/db/repositories/__tests__/SubagentRepository.test.ts
git diff --check
```

对变更 TypeScript 执行定向 ESLint；对相同路径 HEAD 原文逐文件对照既有错误，
新增错误必须消除，不用全仓 autofix 改写相邻风格。文档另检查本地链接。

## 本轮验证结果（2026-10-22）

| 检查 | 结果 |
| --- | --- |
| `pnpm build`（包含 Node/Web typecheck） | 通过 |
| Main/Renderer boundaries、architecture tests、doc paths（上列六条命令） | 全部通过 |
| `pnpm test:coverage --maxWorkers=4` | 379 个测试文件、2,991 项通过；7 个文件、37 项跳过 |
| V8 全仓覆盖率 | statements 72.20%、branches 65.05%、functions 66.66%、lines 73.21% |
| Electron Node 模式下的 `SubagentRepository.test.ts` | 7 项通过；补验普通 Node 下跳过的原生 SQLite 用例 |
| 变更 TypeScript 定向 ESLint 与相同路径 HEAD 对照 | 新增错误 0；标准 ESLint 仍有 95 项既有错误，未视为通过 |
| 隔离 Electron 冒烟 | 通过；实际命令仅执行 1 次，3 次确定性模型请求覆盖取消、审批、续接及重复任务防重 |
| 状态卡 Electron renderer fixture | Light/Dark、1050/650 宽度完成截图检查 |
| `git diff --check`、变更文档本地链接检查 | 通过 |

此前在其他检查并发时出现的两个 5 秒测试超时，分别定向复查通过；
最终以 4 workers 独立运行的完整覆盖率检查通过，没有放宽超时或修改对应测试。
既有 CLI host/thinking 文档工作区改动保留，不包含在本轮实施范围。

提交前专项复核补充了历史结果卡的 run/revision 隔离、共享数据库的新 run 优先级、
首次任务 UTF-8 体量限制，以及满信息 inbox 下的续接与写锁容量检查。
新增回归在修复前失败，修复后通过；最终全仓检查覆盖这些修正。

## 运行验收与剩余范围

使用隔离 userData 和确定性模型流，运行生产 SubagentRunService、AgentRuntime、
ToolExecutor、命令处理器和审批 manager。真实 SQLite 验证重新打开、中断标记、
存活 owner、事务绑定、终态不可改与 chat 级联删除。Electron 验证真实命令取消、
父引用释放后的审批、审批中取消、持续 child 的增量历史、新 run、重复任务 ID 与旧 run 查询。
生产状态卡在 Electron renderer fixture 中检查 Light/Dark、1050/650 逻辑像素宽度并截图。

真实 provider 网络取消、完整 Chat 中物理输入点击 Stop、长时间多轮/配额延迟、
跨进程 PID 重用和原生 Windows 仍未验收。局部同步日志写入延迟不作为已经测量
的性能收益。没有执行付费模型对照任务，不声称 token、费用、缓存率或完成率改善。
当前工具披露和团队模式的默认策略保持原样。
