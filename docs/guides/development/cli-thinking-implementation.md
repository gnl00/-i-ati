# CLI Thinking 配置实施指导

Status: Implemented; local acceptance passed
Owner: Main runtime
Last updated: 2026-09-03

## 目标与依据

补齐 CLI 模型配置中的 `options.thinking`，经 `CliRuntimeRunner` 传递至现有 `AgentRequestSpec.options`，由既有 adapter 处理请求体与历史 reasoning。

本轮 FrontierHarness 运行暴露了这条配置通路的缺失：`CliModelConfig` 和解析函数只接收基础连接信息、systemPrompt、requestOverrides；CLI runtime 组装省略了 options；OpenAI-compatible adapter 以 `options.thinking.enabled === true` 决定是否发送历史 `reasoning_content`。本次修复针对宿主配置完整性，Anko 重复分析与该缺口之间的因果关系仍需单变量复测。

阅读入口：

- `src/main/hosts/cli/CliInputAdapter.ts`
- `src/main/orchestration/cli/CliRuntimeRunner.ts`
- `src/main/orchestration/cli/CliRunOrchestrator.ts`
- `src/main/agent/runtime/request/AgentRequestSpec.ts`
- `src/types/index.d.ts` 中的 `UnifiedRequestThinkingOption`
- `src/main/request/adapters/openai/OpenAIAdapter.ts`
- `scripts/verify-cli.mjs`

## 配置契约

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

- `options` 可省略。并行的 CLI/Chat profile 对齐完成后，省略时沿用共用 Chat 请求工厂的模型能力与默认配置；显式 thinking 作为该次运行的权威选择。
- 本次 options 支持 `thinking`，复用 `UnifiedRequestThinkingOption` 的字段类型。
- `options` 和 `thinking` 必须为 JSON 对象；thinking 提供时 `enabled` 必须为 boolean。
- `effort` 可省略；提供时须为非空字符串。有效 provider 等级沿用 adapter 的能力规则，CLI 保持结构校验。
- `enabled: false` 显式传递至 adapter。provider 实际关闭推理的请求格式沿用现有 adapter 契约；文档明确该字段与 provider 默认行为的关系。
- 拒绝 options/thinking 层的未知字段，返回 `CONFIG_FIELD_INVALID`，避免静默忽略拼写错误。错误消息只给出字段路径和规则。
- 请求体级 `requestOverrides` 沿用现有机制；运行时 thinking 状态以 `options.thinking` 为权威输入。
- 本次 thinking 修复复用 profile 已解析的默认值；显式配置通路保持独立可控。扩展全部 AgentRequestOptions 属于后续范围。

## 实现步骤

1. **输入解析**：为 CliModelConfig 增加可选 options，解析并构造新的受校验对象。沿用已有 CliInputError。
2. **请求传递**：原实现由 CliRuntimeRunner 直接组装 AgentRequestSpec。并行 profile 对齐后，CliChatProfile 使用共用 RunRequestFactory；将 options 传入工厂，并在组装后将显式 thinking 合入最终 requestSpec.options，保留其他已解析选项。CliRuntimeRunner 消费该 requestSpec，复用后续 materializer 与 adapter。
3. **配置证据**：CliRunOrchestrator 的模型配置指纹纳入最终有效 requestSpec.options；运行产物记录有效 thinking，沿用脱敏机制。
4. **文档同步**：更新 CLI 主指南的字段说明、默认语义和启用示例，并在指南索引加入本文件。

## 验证设计

优先复用当前 Vitest 和真实 Electron CLI stub，提供一条能覆盖完整链路的回归验证：

1. 配置解析覆盖省略、启用、关闭、effort、非法类型及未知字段。
2. loopback provider 第一轮返回固定 `reasoning_content` 与真实 workspace 工具调用；第二轮捕获 HTTP 请求体。
3. 启用时（含仅 enabled:true、省略 effort），第二轮 assistant 消息必须含原始 reasoning、对应 tool_calls，且 tool result 正确关联；工具实际成功执行；provider 接受后给出最终文本，CLI 成功退出。
4. 关闭和省略时，第二轮请求的 reasoning 字段符合现有 adapter/profile 契约。使用未声明 reasoning 能力的本地测试模型，覆盖省略时的默认行为。配置中使用非空 effort 时验证 adapter 对应的请求字段。
5. 新增主回归检查先在旧实现上运行并确认失败，再接通配置后确认通过。证明失败来自第二轮 reasoning 缺失。
6. 验证启用/关闭配置产生不同指纹，结果记录可识别本轮设置；API key 保持脱敏。

建议命令：

```sh
pnpm exec vitest run src/main/hosts/cli/__tests__ src/main/orchestration/cli/__tests__/CliChatProfile.test.ts src/main/request/adapters/__tests__/openai.adapter.test.ts
pnpm exec electron-vite build
pnpm verify:cli
pnpm run typecheck:node
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
git diff --check
```

如现有全量检查出现基线问题，记录文件、错误和本次改动的关联，交付中分别说明。

## 验收与交付

- CLI JSON 配置能真实控制后续 adapter 的 reasoning 回传。
- 两轮工具交互通过真实 Electron CLI 与本地 HTTP stub 验证，覆盖启用、关闭和省略。
- 配置指纹和运行产物可区分 thinking 设置。
- 文档包含可直接使用的配置示例和确定的默认语义。
