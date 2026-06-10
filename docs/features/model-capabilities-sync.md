# Model Capabilities Sync

## 背景

模型配置里已有 `AccountModel.modalities` 和 `AccountModel.capabilities` 两个字段。此前 modalities 主要依赖手动维护，Provider 设置页可以编辑 Text、Image、Audio、Video、Tool、Reason 等标签。

models.dev 提供公开的 AI 模型规格数据库，包含模型 ID、输入输出模态、工具调用、推理、结构化输出、温度控制、发布日期和知识截止日期等信息。本功能把 models.dev 作为模型能力补全源，按模型 ID 同步能力信息。

## 目标

- App 启动后后台拉取 models.dev 数据。
- 每天最多拉取一次，并把原始 JSON 快照保存到本地。
- Renderer 通过 `models:get-model-capabilities` 按 `modelIds` 批量查询能力。
- Provider 设置页用查询结果补全模型的 modalities 和 capabilities。
- 用户手动维护过的 modalities 组合保持稳定。

## 数据源

API:

```bash
curl https://models.dev/api.json
```

本地快照路径：

```text
<userData>/models/<YYYY-MM-DD>.json
```

示例：

```text
~/Library/Application Support/<app>/models/2026-04-30.json
```

## 数据结构

共享类型和映射逻辑位于：

- `src/shared/models/capabilities.ts`

主要输出类型：

```ts
type ModelCapabilitySnapshot = {
  modelId: string
  name?: string
  modalities: string[]
  capabilities: string[]
  knowledge?: string
  releaseDate?: string
  lastUpdated?: string
  sourceDate: string
}
```

IPC 请求和响应：

```ts
type GetModelCapabilitiesRequest = {
  modelIds: string[]
}

type GetModelCapabilitiesResponse = {
  models: Record<string, ModelCapabilitySnapshot | null>
}
```

## 映射规则

models.dev 的 `modalities.input` 和 `modalities.output` 会合并去重，写入 `modalities`。

当前支持的 modalities：

- `text`
- `image`
- `audio`
- `video`
- `pdf`
- `tool`
- `reason`

能力字段映射：

- `tool_call: true` -> `modalities: ["tool"]`，`capabilities: ["tool"]`
- `reasoning: true` -> `modalities: ["reason"]`，`capabilities: ["reasoning"]`
- `interleaved` 存在 -> `modalities: ["reason"]`，`capabilities: ["reasoning"]`
- `structured_output: true` -> `capabilities: ["structured_output"]`
- `temperature: true` -> `capabilities: ["temperature"]`
- `open_weights: true` -> `capabilities: ["open_weights"]`
- `attachment: true` -> `capabilities: ["attachment"]`

重复模型 ID 会合并 modalities 和 capabilities，并保留较新的 `lastUpdated`。

## Main 进程

新增服务：

- `src/main/services/models/ModelsDevCacheService.ts`

职责：

- 计算当前日期快照路径。
- 优先读取当天本地快照。
- 当天快照缺失时请求 `https://models.dev/api.json`。
- 请求成功后写入 `<userData>/models/<YYYY-MM-DD>.json`。
- 请求失败时读取最近一份可用本地快照。
- 构建 `Map<modelId, ModelCapabilitySnapshot>` 供 IPC 查询。

启动接入点：

- `src/main/index.ts`

后台任务：

```ts
void modelsDevCacheService.ensureFreshSnapshot().catch((error) => {
  console.error('[App#TASK] Failed to initialize models.dev cache:', error)
})
```

## IPC

新增 channel：

```ts
models:get-model-capabilities
```

常量位置：

- `src/shared/constants/index.ts`

Main handler：

- `src/main/ipc/models.ts`

注册位置：

- `src/main/main-ipc.ts`

Renderer invoker：

- `src/renderer/src/invoker/ipcInvoker.ts`

调用方式：

```ts
const response = await invokeModelsGetModelCapabilities({
  modelIds: currentAccount.models.map(model => model.id)
})
```

## Renderer 同步策略

接入组件：

- `src/renderer/src/components/settings/providers/ProviderModelsPanel.tsx`

触发条件：

- 当前账号存在。
- 当前账号模型 ID 集合变化。

写回策略：

- `capabilities` 按 models.dev 查询结果同步。
- `modalities` 只在当前值为空或等于模型类型默认值时同步。
- 已经手动调整过的 modalities 组合保持稳定。
- 新增 `pdf` modality 选项和 badge 样式。

默认 modalities：

- `llm` -> `["text"]`
- `vlm` -> `["text", "image"]`
- `mllm` -> `["text", "image"]`
- `img_gen` -> `["image"]`

## 测试覆盖

新增测试：

- `src/shared/models/__tests__/capabilities.test.ts`
- `src/main/services/models/__tests__/ModelsDevCacheService.test.ts`
- `src/main/ipc/__tests__/models.test.ts`

覆盖点：

- models.dev 模型字段到 modalities/capabilities 的映射。
- `interleaved` 作为 reasoning 能力信号。
- 重复模型 ID 的能力合并。
- 每日快照写入。
- 当天快照复用。
- 网络失败后的本地快照回退。
- IPC channel 注册和参数传递。

验证命令：

```bash
pnpm exec vitest run src/shared/models/__tests__/capabilities.test.ts src/main/services/models/__tests__/ModelsDevCacheService.test.ts src/main/ipc/__tests__/models.test.ts
pnpm run typecheck:node
pnpm run typecheck:web
```

## 相关提交

```text
6283d8e feat: sync model capabilities from models.dev
```

## 后续方向

- 给 `AccountModel` 增加能力来源字段，例如 `modalitiesSource: "manual" | "models.dev"`。
- 在 UI 上展示能力来源和快照日期。
- 增加手动刷新 models.dev 快照入口。
- 扩展 capability badge，用于展示 `structured_output`、`temperature`、`open_weights` 等能力。
