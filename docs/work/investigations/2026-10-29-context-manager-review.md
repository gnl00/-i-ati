# ContextManager 预算、性能与中间表示审阅

Owner: Repository maintainers<br>
Status: Active<br>
Started: 2026-10-29<br>
Target: 记录当前上下文链路的问题、必要边界和可收敛表示，供后续实施决策<br>
Exit criteria: 核实候选问题，完成获授权的修正和对应验证；性能收益以基准或运行观测确认<br>
Related specs: [工具结果归一化](../../specs/tools/tool-result-normalization.md)<br>
Related implementation: [ContextManager](../../../src/main/agent/runtime/context/ContextManager.ts)、[AgentLoop](../../../src/main/agent/runtime/loop/AgentLoop.ts)

## 范围与证据等级

用户已授权按阶段实施并逐阶段提交。本文件同时记录审阅证据和实施进度。依据 2026-10-29 当前工作区源码，包含工作区已有变更；不是发布版本结论。
代码路径可确认重复操作和分支结果；未执行性能基准，不量化提速。此前运行 ContextManager、ChatContextMapper 两个测试文件共 17 项通过，不代表本文新发现的边界已有回归覆盖。

相关契约：[ADR-0036](../../decisions/0036-runtime-context-manager.md)、[Context 架构](../../architecture/agent-runtime/context/README.md)。ADR 记录的未知窗口默认值仍为 32,768，而当前代码为 262,144；后续需同步文档，不能用旧 ADR 数字判断运行行为。

## 当前链路

1. Host 准备历史、持久化摘要、用户指令、动态上下文和 requestSpec；mapChatContext 一次映射为 ContextRecord[]。
2. AgentLoop 为每次 run 创建 ContextManager。每次模型发送前 prepare 选择历史、计量和必要时压缩。
3. 模型流式响应更新单步 draft，并发送渲染事件；此时不追加未完成 assistant 到 ContextManager。
4. 成功完成的步骤物化为 AgentStep，追加 assistant record。工具批次执行后追加结果、更新后的 Skills 上下文；在步骤边界消费 steering。
5. 下一次发送再次 prepare；终态导出 ContextSnapshot。流失败或取消时，未完成 draft 不进入稳定记录；工具阶段已有部分结果可保留用于终态证据。

## 已确认候选

### 1. 请求准备和计量重复（高置信度；优化需保持 provider 语义）

[ContextManager.prepare](../../../src/main/agent/runtime/context/ContextManager.ts) 正常路径先计量必需内容，再计量完整请求；每次包含投影、适配、provider body 构建、序列化和 token 计数。发送阶段的 [unifiedChatRequest](../../../src/main/request/index.ts) 再次准备和序列化 body。准备还读取插件配置、解析 adapter、执行扩展和 overrides。
超窗路径在最终候选已计量后再次 measure；[RequestCompositionMetrics](../../../src/main/agent/runtime/context/RequestCompositionMetrics.ts) 为日志额外序列化消息分块。

建议先计量完整请求，超窗后才测必需内容；复用最终 measurement。进一步评估将已准备 body 交给发送阶段，明确插件配置、取消、重试和扩展的生命周期，避免引入另一套可变缓存。保留真实 provider body 校验，不能简单把消息 token 相加替代。

验证：正常、必需超窗、overrides 输出上限、估算余量变化和重试；记录 body 构建次数、prepare 耗时及主进程延迟。当前二分历史前缀探测已有性能优化依据，应保留。

### 2. 历史工具映射重复复制（高置信度；低风险）

[ChatContextMapper](../../../src/main/hosts/chat/runtime/ChatContextMapper.ts) 对每条工具结果执行 records.slice().reverse().find，寻找刚处理过的 assistant。工具密集历史下累计数组复制最坏接近平方级。

建议保存当前 assistant 引用，按需索引其 toolCall ID。删除复制、反转和历史搜索，保留工具名、索引及孤立工具回退语义。验证多步多工具、缺失关联和空历史；无需新增通用索引管理器。

### 3. 二次压缩失败清除有效旧摘要（高置信度；影响上下文保留）

ContextManager 超窗分支把局部 summary 初始化为 undefined。压缩失败、空摘要或被拒绝后，将其赋给 this.summary；此前覆盖的原始历史继续被 covered 排除。旧摘要即使还能容纳，也不会作为退化候选。

建议尝试旧摘要＋保留历史＋本次省略提示，并重新计量；仍超窗才舍弃旧摘要。原始 records 保持完整。该修改改善失败退化行为，属于行为调整。

验证：先成功压缩、再追加足够内容触发二次压缩失败；分别验证旧摘要可容纳和不可容纳，以及取消传播。

### 4. 合并摘要缩减比较对象不完整（高置信度；逻辑问题）

压缩输入为 previousSummary＋本次移除历史，但接受条件只将新摘要与本次历史 text 比较。旧摘要 1,000 tokens、新历史 200 tokens、合并摘要 900 tokens 时，总量已下降却被拒绝。

建议比较旧摘要与新增历史的总内容成本，同时保留最终请求预算检查。验证“比新增历史大、比总输入小”的摘要被接受，以及确实不缩小的摘要仍退化。

### 5. 压缩预算余量计算过早（高置信度；逻辑问题）

[ContextCompactor](../../../src/main/agent/runtime/context/ContextCompactor.ts) 在 countValue 前根据 tokenizer.estimated 计算预算；[RequestTokenizer](../../../src/main/agent/runtime/context/RequestTokenizer.ts) 对长文本分段时才切换 estimated。已知编码长输入可能仍按 5% 而非 15% 余量检查。Manager 主路径先计数后算预算。

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

证据：[AgentStepDraft](../../../src/main/agent/runtime/step/AgentStepDraft.ts)、[AgentStepMaterializer](../../../src/main/agent/runtime/step/AgentStepMaterializer.ts)、[ContextSnapshot](../../../src/main/agent/runtime/context/ContextSnapshot.ts)、[AgentRenderStateReducer](../../../src/main/hosts/shared/render/AgentRenderStateReducer.ts)、[子 Agent 持久化与续跑](../../../src/main/services/subagent/subagent-run-service.ts)。

### 流式阶段可进一步收敛的位置

applyDeltaToDraft 每个 delta 都克隆整个 toolCalls 数组及调用对象，包括正文、reasoning、usage 等未修改工具的 delta；tool_call_ready 还会经 upsertToolCall 再复制。不可变事件快照有真实用途，已有测试要求先前事件快照不被后续 chunk 改写。

建议优先核实 parser 返回工具快照的可变性，再针对工具未变的 delta 共享不可变工具数组。不能直接原地修改 draft.snapshot 或工具参数。验证旧事件快照稳定、参数分片、多个调用和混合文本事件。

事件同时带 delta 和 snapshot 使渲染消费者既处理增量又遍历累计工具。可评估让渲染端只累计 delta，或仅在特定边界提供完整快照；需要覆盖预览、reasoning 顺序、工具参数、终态提交与失败丢弃。当前源码仅证明字段并存和重复处理，尚未证明每个 chunk 都跨 IPC 传输整份 snapshot，不能据此宣称 IPC 平方级开销。

[AgentEventBus](../../../src/main/agent/runtime/events/AgentEventBus.ts) 顺序 await 各 sink，Loop await emitStepDelta。消费者耗时可反压响应消费，但事件顺序和终态交付有意义；先测各 sink 耗时，不能简单改成 fire-and-forget。

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
