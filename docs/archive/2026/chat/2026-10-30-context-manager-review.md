# ContextManager 预算、性能与中间表示审阅

Archived: 2026-10-30<br>
Reason: 已完成六阶段实施和自动化验证；保留探索结论与未测边界<br>
Original path: `docs/work/investigations/2026-10-29-context-manager-review.md`<br>
Replaced by: [当前 Context 架构](../../../architecture/agent-runtime/context/README.md)

Owner: Repository maintainers<br>
Status: Done<br>
Started: 2026-10-29<br>
Target: 记录当前上下文链路的问题、必要边界和可收敛表示，供后续实施决策<br>
Exit criteria: 核实候选问题，完成获授权的修正和对应验证；性能收益以基准或运行观测确认<br>
Related specs: [工具结果归一化](../../../specs/tools/tool-result-normalization.md)<br>
Related implementation: [ContextManager](../../../../src/main/agent/runtime/context/ContextManager.ts)、[AgentLoop](../../../../src/main/agent/runtime/loop/AgentLoop.ts)

## 范围与证据等级

用户已授权按阶段实施并逐阶段提交。本文件同时记录审阅证据和实施进度。依据 2026-10-29 当前工作区源码，包含工作区已有变更；不是发布版本结论。
代码路径可确认重复操作和分支结果；阶段 6 补充了本机合成基准，不能外推为模型请求或 Electron 的端到端提速。此前运行 ContextManager、ChatContextMapper 两个测试文件共 17 项通过，不代表本文新发现的边界已有回归覆盖。

相关契约：[ADR-0036](../../../decisions/0036-runtime-context-manager.md)、[Context 架构](../../../architecture/agent-runtime/context/README.md)。ADR 记录的未知窗口默认值仍为 32,768，而当前代码为 262,144；后续需同步文档，不能用旧 ADR 数字判断运行行为。

## 当前链路

1. Host 准备历史、持久化摘要、用户指令、动态上下文和 requestSpec；mapChatContext 一次映射为 ContextRecord[]。
2. AgentLoop 为每次 run 创建 ContextManager。每次模型发送前 prepare 选择历史、计量和必要时压缩。
3. 模型流式响应更新单步 draft，并发送渲染事件；此时不追加未完成 assistant 到 ContextManager。
4. 成功完成的步骤物化为 AgentStep，追加 assistant record。工具批次执行后追加结果、更新后的 Skills 上下文；在步骤边界消费 steering。
5. 下一次发送再次 prepare；终态导出 ContextSnapshot。流失败或取消时，未完成 draft 不进入稳定记录；工具阶段已有部分结果可保留用于终态证据。

## 已确认候选

### 1. 请求准备和计量重复（高置信度；优化需保持 provider 语义）

[ContextManager.prepare](../../../../src/main/agent/runtime/context/ContextManager.ts) 正常路径先计量必需内容，再计量完整请求；每次包含投影、适配、provider body 构建、序列化和 token 计数。发送阶段的 [unifiedChatRequest](../../../../src/main/request/index.ts) 再次准备和序列化 body。准备还读取插件配置、解析 adapter、执行扩展和 overrides。
超窗路径在最终候选已计量后再次 measure；[RequestCompositionMetrics](../../../../src/main/agent/runtime/context/RequestCompositionMetrics.ts) 为日志额外序列化消息分块。

建议先计量完整请求，超窗后才测必需内容；复用最终 measurement。进一步评估将已准备 body 交给发送阶段，明确插件配置、取消、重试和扩展的生命周期，避免引入另一套可变缓存。保留真实 provider body 校验，不能简单把消息 token 相加替代。

验证：正常、必需超窗、overrides 输出上限、估算余量变化和重试；记录 body 构建次数、prepare 耗时及主进程延迟。当前二分历史前缀探测已有性能优化依据，应保留。

### 2. 历史工具映射重复复制（高置信度；低风险）

[ChatContextMapper](../../../../src/main/hosts/chat/runtime/ChatContextMapper.ts) 对每条工具结果执行 records.slice().reverse().find，寻找刚处理过的 assistant。工具密集历史下累计数组复制最坏接近平方级。

建议保存当前 assistant 引用，按需索引其 toolCall ID。删除复制、反转和历史搜索，保留工具名、索引及孤立工具回退语义。验证多步多工具、缺失关联和空历史；无需新增通用索引管理器。

### 3. 二次压缩失败清除有效旧摘要（高置信度；影响上下文保留）

ContextManager 超窗分支把局部 summary 初始化为 undefined。压缩失败、空摘要或被拒绝后，将其赋给 this.summary；此前覆盖的原始历史继续被 covered 排除。旧摘要即使还能容纳，也不会作为退化候选。

建议尝试旧摘要＋保留历史＋本次省略提示，并重新计量；仍超窗才舍弃旧摘要。原始 records 保持完整。该修改改善失败退化行为，属于行为调整。

验证：先成功压缩、再追加足够内容触发二次压缩失败；分别验证旧摘要可容纳和不可容纳，以及取消传播。

### 4. 合并摘要缩减比较对象不完整（高置信度；逻辑问题）

压缩输入为 previousSummary＋本次移除历史，但接受条件只将新摘要与本次历史 text 比较。旧摘要 1,000 tokens、新历史 200 tokens、合并摘要 900 tokens 时，总量已下降却被拒绝。

建议比较旧摘要与新增历史的总内容成本，同时保留最终请求预算检查。验证“比新增历史大、比总输入小”的摘要被接受，以及确实不缩小的摘要仍退化。

### 5. 压缩预算余量计算过早（高置信度；逻辑问题）

[ContextCompactor](../../../../src/main/agent/runtime/context/ContextCompactor.ts) 在 countValue 前根据 tokenizer.estimated 计算预算；[RequestTokenizer](../../../../src/main/agent/runtime/context/RequestTokenizer.ts) 对长文本分段时才切换 estimated。已知编码长输入可能仍按 5% 而非 15% 余量检查。Manager 主路径先计数后算预算。

建议统一为先计数后计算预算。验证已知模型、超过分段阈值、token 数落在两种预算之间的边界，以及短输入行为。

## draft / snapshot / transcript 是否必要

这些名称包含不同生命周期，也包含同一对象的字段和别名，不能按名称数量推断完整历史被复制了几份。

| 表示 | 所有者与消费者 | 必要性与收敛判断 |
| --- | --- | --- |
| AgentStepDraft | Loop 当前模型步骤；parser 增量被折叠到其中 | 需要流式工作区，承载尚未完成的内容；与稳定 records 的边界应保留 |
| draft.snapshot / AgentStepDraftSnapshot | draft 的嵌套字段；渲染事件、物化器和恢复判断消费 | 它就是 draft 的当前累计内容，不是另一份独立历史。嵌套结构可改名或扁平化，但单靠此举没有明确性能收益 |
| StepDeltaEvent 的 delta＋snapshot | Loop 发出；AgentRenderStateReducer 消费 | 有重叠，但当前两者均有消费者：delta 驱动 reasoning/content/tool block 顺序，snapshot 提供累计正文与工具预览。可收敛，不能直接删字段 |
| AgentStep | 物化器产出；完成/失败事件、工具执行、assistant record 使用 | 稳定步骤边界必要。terminal draft 包装和 materializer 的接口层次可另审，但尚无充分理由单独重构 |
| ContextManager.records | Manager 拥有完整运行事实；prepare/snapshot 消费 | 必须保留完整事实与预算内发送视图的区别，以支持失败证据和续跑 |
| ContextSnapshot | snapshot() 在终态创建；复制 records 数组、共享记录对象 | 有终态交付职责，不是第二个持续同步的 live store，也不是深冻结快照 |
| result.transcript | 类型为 ContextSnapshot；Host/子 Agent 持久化和续跑使用 | 是终态字段名。不能作为死代码删除；单纯改名收益有限且涉及持久化契约 |
| requestContextSnapshot | 用户消息携带的历史运行环境快照 | 与 draft.snapshot、ContextSnapshot 含义不同；用于解释当时环境，可能增加历史 token，需按来源评估精简 |
| MaterializedProtocolRequest / IUnifiedRequest / provider body | 协议投影、既有请求设施、provider adapter | 存在边界转换用途；优先减少同一请求的重复转换，而非把所有表示合成可变对象 |

证据：[AgentStepDraft](../../../../src/main/agent/runtime/step/AgentStepDraft.ts)、[AgentStepMaterializer](../../../../src/main/agent/runtime/step/AgentStepMaterializer.ts)、[ContextSnapshot](../../../../src/main/agent/runtime/context/ContextSnapshot.ts)、[AgentRenderStateReducer](../../../../src/main/hosts/shared/render/AgentRenderStateReducer.ts)、[子 Agent 持久化与续跑](../../../../src/main/services/subagent/subagent-run-service.ts)。

### 流式阶段可进一步收敛的位置

applyDeltaToDraft 每个 delta 都克隆整个 toolCalls 数组及调用对象，包括正文、reasoning、usage 等未修改工具的 delta；tool_call_ready 还会经 upsertToolCall 再复制。不可变事件快照有真实用途，已有测试要求先前事件快照不被后续 chunk 改写。

建议优先核实 parser 返回工具快照的可变性，再针对工具未变的 delta 共享不可变工具数组。不能直接原地修改 draft.snapshot 或工具参数。验证旧事件快照稳定、参数分片、多个调用和混合文本事件。

事件同时带 delta 和 snapshot 使渲染消费者既处理增量又遍历累计工具。可评估让渲染端只累计 delta，或仅在特定边界提供完整快照；需要覆盖预览、reasoning 顺序、工具参数、终态提交与失败丢弃。当前源码仅证明字段并存和重复处理，尚未证明每个 chunk 都跨 IPC 传输整份 snapshot，不能据此宣称 IPC 平方级开销。

[AgentEventBus](../../../../src/main/agent/runtime/events/AgentEventBus.ts) 顺序 await 各 sink，Loop await emitStepDelta。消费者耗时可反压响应消费，但事件顺序和终态交付有意义；先测各 sink 耗时，不能简单改成 fire-and-forget。

## 保留与待测设计

- 保留 draft 与稳定 records 的生命周期边界、工具批次匹配校验、原始工具结果和恢复路径。
- 同步模型摘要直接增加下一次请求等待时间；它有保留信息的作用。测量耗时、成功率、压缩输入超窗频率后，再判断是否需要后台准备或分块策略。
- 历史 request_context 有重复体量，也有历史状态解释价值。先分块统计来源体量，避免删除后把过去环境误认成当前环境。
- records 完整留存意味着长 run 会保留更多内存；当前仅复制数组不等于复制所有字符串。未证明内存压力前不增加冷热存储或换页机制。

## 建议实施顺序与验收

1. 修正旧摘要退化、合并摘要比较、压缩余量顺序。
2. 简化历史工具映射。
3. 优化正常 prepare 和最终 measurement 复用；再评估 provider body 复用。
4. 测量流式工具数组复制与 sink 耗时，再决定事件契约是否收敛。

实现时按仓库规则运行受影响测试、Node 类型检查和改动文件 lint；跨模块契约或共享运行生命周期重构需相应架构检查及完整 coverage。可见流式行为变动需 Electron 验收。当前仅交付审阅文档，不代表上述建议已经实施或验收。

## 实施进度

已授权实施顺序：压缩余量修正 → 合并摘要比较 → 旧摘要退化 → 历史映射 → 请求计量复用 → 流式复制与消费者测量。每阶段独立验证、独立提交；最后执行共享生命周期的完整覆盖率检查。

事件 delta/snapshot 契约、provider body 复用和同步摘要策略仍需依据测量决定。先实现已证实的成本削减，若保留候选设计，应记录消费者或测量证据，不以字段改名代替优化。

### 阶段 1：压缩余量

- 先计数再计算预算，分段估算使用 15% 安全余量。
- 新增已知模型长输入落在两种余量预算之间的拒绝测试，保证不发送超预算压缩请求。
- `pnpm exec vitest run src/main/agent/runtime/context/__tests__/ContextCompactor.test.ts`：4 项通过。
- 对上述实现和测试运行 ESLint：0 errors，104 条格式 warnings（默认 Prettier 双引号/分号与周边风格冲突）。
- `pnpm run typecheck:node`：被已有工作区 `src/main/services/retrieval/__tests__/optionalRetrieval.test.ts:17` 的 Promise<unknown> / Promise<unknown[]> 错误阻塞。该文件不属于本任务。

### 阶段 2：合并摘要比较

- 新摘要与旧摘要加本次移除历史的 token 总量比较，最终发送仍校验整个请求预算。
- 新增先压缩、再收紧有效输出预算触发合并的测试，保留比新增历史大但比总输入小的有效摘要。
- `pnpm exec vitest run src/main/agent/runtime/context/__tests__/ContextManager.test.ts`：12 项通过。
- 两个改动文件 `pnpm exec eslint ... --quiet` 通过；`pnpm run typecheck:node` 通过（此前无关类型错误已由工作区其他修改消除）。

### 阶段 3：旧摘要退化

- 新压缩失败、空内容或摘要被拒绝时，尝试保留旧摘要，并添加历史缺口提示；旧摘要仍超预算时舍弃。
- 历史缺口标记在 run 内保留，避免下一次请求有旧摘要却失去缺口提示。
- 新增三种失败后的旧摘要保留及后续 prepare 复用测试，以及旧摘要无法容纳的退化测试。
- ContextManager 测试 16 项通过；改动文件 ESLint --quiet 和 Node 类型检查通过。

### 阶段 4：历史映射

- 使用当前 assistant record 引用，同时移除单独的 currentAssistantStepId 状态；不再对每条工具结果复制、反转完整历史。
- 保留当前批次内 find 的首匹配语义，不引入新索引或重复 ID 行为改变。
- ChatContextMapper 测试 7 项通过（含孤立工具、多批次重复 ID、结果乱序）；改动文件 ESLint --quiet 和 Node 类型检查通过。

### 阶段 5：请求计量复用

- 先检查完整候选请求；预算内只调用一次 provider measurement，超窗才构建和检查必需内容。
- 复用最终候选或必需请求的 measurement，删除终态日志前重复构建与计数。
- 新增预算内请求单次计量且保留完整历史的回归；context 目录 6 个测试文件 41 项通过。
- 改动文件 ESLint --quiet 和 Node 类型检查通过。
- 本阶段量化的是操作次数（正常 prepare 从 2 次 measurement 降为 1 次），不是实际端到端时延。provider body 发送复用仍需独立处理 adapter/重试边界。

### 阶段 6：流式工具快照共享与探索收口

- parser 在无工具更新的 chunk 上共享输入工具数组和 assembly 状态；有更新时复制容器并替换修改项，旧快照保持稳定。
- Loop 在工具快照变化时按 chunk 脱离 parser 输出一次，不再为同 chunk 的每个 delta 重复克隆；无工具变化的正文、reasoning、usage 事件共享不可变工具数组。
- 保留 tool_call_ready 的稳定调用合并、独立 draft 内容快照和现有 delta/snapshot 事件契约。补齐 Loop 两个已有方法的返回类型以满足改动文件 lint。
- Parser、AgentRuntime、RenderPipelineGolden 定向测试 26 项通过，包含旧工具参数快照不被后续分片修改、长流式正文和渲染事件顺序。
- 改动文件 ESLint --quiet、Node 类型检查、main boundaries、main architecture（8 项）、main doc paths 均通过。

#### 成本测量（2026-10-30，本机合成输入）

临时 Vitest 基准使用 HEAD 中优化前 parser 与当前 parser，在同一进程预热后交替运行 9 次；每次 10,000 个正文＋reasoning chunk、32 个已有工具调用，取中位数：优化前 7.122 ms，优化后 1.501 ms。工具数组与 assembly 的无效复制被消除；该结果仅代表 parser CPU 合成负载，不代表网络、模型或真实 Electron 体验。基准临时源文件已移除，永久回归保留快照不可变性与共享条件。

对实际 HostRenderEventMapper 输入 4,000 个累计正文事件的单次合成测量为 6.978 ms；没有持久化、IPC 或真实外部 sink，不能据此断言真实 sink 不会变慢。

#### 已评估并保留的边界

1. delta＋snapshot：AgentRenderStateReducer 使用 delta 的块顺序和 snapshot 的累计内容；ChatRenderResponder 已按 previewEffect 发出正文/推理追加 patch。保留当前事件契约，避免制造第二套消费者累计规则。本次先去除其生产端无效复制。
2. 顺序事件交付：实际 HostRenderEventForwarder 经 HostOutputDispatcher 交付，required adapters 承担 canonical persistence；optional preview 已合并且不阻塞当前 dispatch。保留必要顺序与错误传播，不为合成 mapper 的低成本增加异步队列。真实 sink 分项时延尚未观测，不声称其性能已优化。
3. provider body 发送复用：prepareUnifiedRequestBody 包含插件启用检查、adapter 解析和可配置扩展/overrides，发送阶段重新准备也在重试路径使用。当前接口只返回模型无关请求；共享可变 body 会引入新的生命周期契约。先完成单次正常计量及结果复用，不引入跨 prepare/execute 缓存；provider adapter 构建的实际耗时尚未量化。
4. draft、稳定 records、终态 transcript：分别服务在途状态、事实留存和子 Agent 持久化/续跑，保留。未为命名统一迁移持久化字段。
5. 同步摘要与历史环境快照：保留信息恢复和历史状态解释能力。本轮修正摘要错误退化，不改变模型选择、后台任务或历史快照兼容策略。

### 最终验证

- `pnpm test:coverage`：386 个文件通过、7 个跳过；3,088 项通过、37 项跳过。总体语句 73.06%、分支 65.87%、函数 67.38%、行 74.06%。跳过项仍未被本轮验证。
- 该 coverage 在阶段 6 行为修改后执行；随后仅添加返回类型和文档，无后续运行逻辑修改。
- 全局 Node 类型检查、main 架构与文档路径检查通过；先前无关工作区阻塞已消失。
- 未做真实 provider 请求耗时或 Electron 运行观察；本轮未改变 UI 事件契约和可见交互设计。合成测试不等同于真实用户体验验收。
- 已实施六项分阶段优化，各自独立提交。尚无测量证据支持的更大架构改动保留上述现有边界；后续若出现实际瓶颈，应另立测量与变更任务。
