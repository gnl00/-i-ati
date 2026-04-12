# Emotion System Stage Summary

> 下一阶段目标设计见：
> - [emotion-system-design.md](/Users/gnl/Workspace/code/-i-ati/docs/architecture/emotion-system-design.md)

> 这份文档记录的是当前 emotion 系统阶段性实现结果。
> 当前状态以 2026-03-27 为准，重点覆盖：
> - `emotion_report` 工具
> - 当前情绪 fallback
> - `accumulated` 残留情绪数组
> - 统一 emotion 数据结构
> - emotion asset pack 与运行时资源加载

## 背景

这轮 emotion 系统的目标，不是做一个单独的“表情装饰功能”，而是把 assistant 当前情绪纳入统一消息结构，并让“当前情绪”和“残留情绪影响”都进入可解释的数据流。

也就是说：

- 主路径：模型主动调用 `emotion_report`
- 兜底路径：模型漏调 tool 时，仅对**当前情绪**做本地推断
- 累积路径：`accumulated` 由模型在 `emotion_report` 中主动重写
- 展示路径：renderer 只消费统一的 emotion 结果

## 当前主路径

当前完整链路是：

1. prompt 要求模型在每轮 response 中调用 `emotion_report`
2. tool 输入当前情绪字段，并可额外提交重写后的 `accumulated`
3. main 侧严格校验 tool payload
4. main 侧将当前情绪写入 `message.body.emotion`
5. main 侧将 `accumulated` 写入结构化 `emotionState`
6. 如果本轮没有成功的 `emotion_report`，则仅在 assistant finalize 阶段为**当前情绪**运行本地 fallback
7. renderer 从 `message.body.emotion` 读取情绪信息并渲染 badge

关键文件：

- [index.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/prompts/index.ts)
- [emotion_tools.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/definitions/emotion_tools.ts)
- [EmotionToolsProcessor.ts](/Users/gnl/Workspace/code/-i-ati/src/main/tools/emotion/EmotionToolsProcessor.ts)
- [ChatStepStore.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/persistence/ChatStepStore.ts)
- [assistant-message/index.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/chat/chatMessage/assistant-message/index.tsx)
- [ModelBadgeNext.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/chat/chatMessage/assistant-message/model-badge/ModelBadgeNext.tsx)

## 统一 emotion 语义

当前 tool 路径和 fallback 路径已经统一到一份 canonical shape：

```ts
type ChatEmotionState = {
  label: string
  emoji: string
  score?: number
  intensity?: number
  reason?: string
  stateText?: string
  source: 'tool' | 'fallback'
}
```

消息结构定义见：

- [index.d.ts](/Users/gnl/Workspace/code/-i-ati/src/types/index.d.ts)

这意味着：

- renderer 不需要关心 emotion 来自 tool 还是 fallback
- UI 只读取 `message.body.emotion`
- `accumulated` 不再挂在 message body 上，而是进入结构化 state

## `emotion_report` 工具设计

当前 `emotion_report` 已不再接受完全自由的情绪文本，而是对齐统一结构：

- `label`
- `stateText?`
- `intensity?`
- `reason?`
- `accumulated?`

设计原则：

- `label` 对齐系统内 emotion label 集合
- `stateText` 作为可选的人格化补充说明保留
- 视觉资源不再由模型直接指定，而是由系统根据 `label + intensity` 选择
- `accumulated` 由模型重写为“残留情绪影响数组”，而不是由 main 侧做语义 merge

当前 `accumulated` 结构为：

```ts
type EmotionAccumulatedEntry = {
  label: string
  description: string
  intensity: number
  decay: number
  updatedAt: number
}
```

语义上它表示：

- 还未消退的情绪残留
- 不是 topic bucket
- 也不是按轮堆积的日志

相关文件：

- [emotion_tools.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/definitions/emotion_tools.ts)
- [EmotionToolsProcessor.ts](/Users/gnl/Workspace/code/-i-ati/src/main/tools/emotion/EmotionToolsProcessor.ts)

## 当前情绪 Fallback

当前 fallback 仍然存在，但它只负责一件事：

- 当模型没有成功调用 `emotion_report` 时，补一个当前 `message.body.emotion`

它**不负责**：

- 重写 `accumulated`
- merge `accumulated`
- 推断 lingering residue

当前 fallback 使用本地 ONNX emotion classifier：

- 模型目录：
  - [bert-emotion](/Users/gnl/Workspace/code/-i-ati/resources/models/bert-emotion)
- 服务实现：
  - [EmotionInferenceService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/emotion/EmotionInferenceService.ts)

当前触发条件：

- assistant 最终消息有可见文本
- 本轮没有成功的 `emotion_report`
- 只在 finalize 阶段运行一次

推断得到：

- `label`
- `score`

随后系统再根据：

- `label + score -> intensity`

先确定当前情绪强度，再补齐：

- `emoji`
- `intensity`
- `source: 'fallback'`

相关文件：

- [EmotionInferenceService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/emotion/EmotionInferenceService.ts)
- [emotion-state.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/emotion/emotion-state.ts)

## Emotion State 与 Accumulated 持久化

当前系统已经有独立的 emotion state 持久化，不再只依赖消息本身。

主结构：

```ts
type EmotionStateSnapshot = {
  current: EmotionStateEntry
  background: EmotionStateEntry & { driftFactor: number }
  accumulated: EmotionAccumulatedEntry[]
  history: EmotionStateHistoryEntry[]
}
```

当前策略：

- `current`
  - 来自本轮 tool 或 fallback
- `background`
  - 基于上一轮轻微漂移
- `accumulated`
  - 优先使用模型在 `emotion_report` 里提交的新数组
  - 若本轮未提交，则仅对旧数组做 decay 保留
- `history`
  - 记录最近若干轮最终情绪

当前并不存在：

- main 侧的 `accumulated` 语义 merge
- main 侧的 `accumulated` topic 分类

相关文件：

- [Database.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/Database.ts)
- [EmotionStateRepository.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/repositories/EmotionStateRepository.ts)
- [EmotionStateDataService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/dataServices/EmotionStateDataService.ts)
- [emotion-state.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/emotion/emotion-state.ts)
- [ChatStepStore.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/persistence/ChatStepStore.ts)

## 一次完整功能流程

### 分支 A：模型正常调用 `emotion_report`

1. 用户发送消息。
2. chat runtime 创建 user message 和 assistant placeholder。
3. request preparation 读取当前 chat 的 `emotionState`，生成 emotion summary，注入 system prompt。
4. 模型生成回复前调用 `emotion_report`。
5. `emotion_report` 提交：
   - `label`
   - `stateText?`
   - `intensity?`
   - `reason?`
   - `accumulated?`
6. main 侧 processor 校验这些字段是否合法。
7. assistant finalize 时：
   - 从 tool segment 提取当前 emotion
   - 从 tool segment 提取 `accumulated`
   - 将当前 emotion 写入 `message.body.emotion`
   - 用当前 emotion 更新 `current/background/history`
   - 若 tool 提供了 `accumulated`，则用它重写 state 中的 accumulated
8. renderer 根据 `message.body.emotion` 渲染 badge。

### 分支 B：模型没有调用 `emotion_report`

1. 用户发送消息。
2. chat runtime 与分支 A 相同，仍会注入 emotion summary prompt。
3. 模型直接生成 assistant 文本，但没有成功调用 `emotion_report`。
4. assistant finalize 时：
   - 发现没有可用的 emotion tool result
   - 若 assistant 最终文本可见，则调用本地 emotion classifier
   - 只补一个当前 `message.body.emotion`
5. 结构化 state 更新时：
   - `current` 用 fallback emotion
   - `background/history` 正常更新
   - `accumulated` 不做新的推断，只对旧值做 decay 保留
6. renderer 仍可显示当前情绪 badge，但这轮不会产生新的 accumulated rewrite。

### 分支 C：模型调用了 `emotion_report`，但没有传 `accumulated`

1. 当前 emotion 仍然按 tool 结果写入 `message.body.emotion`
2. state 的 `current/background/history` 正常更新
3. `accumulated` 不新增、不 merge，只对旧值做 decay

这条分支是一个重要边界：

- 当前情绪 fallback 可以由系统补
- `accumulated` merge 必须由模型主动负责

## Emotion Asset Catalog

当前 emotion label、候选 asset、fallback 选择规则统一维护在：

- [emotionAssetCatalog.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/emotion/emotionAssetCatalog.ts)

这层负责：

- label 集合
- fallback 时按 `label + score -> intensity`
- 根据 `label + intensity` 选择字符 emoji fallback
- 根据资源数量将 intensity 映射到 pack 内的编号资源

它是 tool 路径、fallback 路径、渲染路径共享的核心约束层。

## Emotion Asset Packs

当前 asset pack 已从“构建期 renderer assets”收敛到“运行时 pack”。

默认内置 pack 目录：

- [default](/Users/gnl/Workspace/code/-i-ati/resources/emotions/packs/default)

当前目录结构按 13 个 emotion type 分层：

```text
resources/emotions/packs/default/
  anger/
  confusion/
  desire/
  disgust/
  fear/
  guilt/
  happiness/
  love/
  neutral/
  sadness/
  sarcasm/
  shame/
  surprise/
```

每个目录下的文件按强度顺序使用数字编号，例如：
每个 label 目录下的文件按强度从弱到强使用数字编号：

- `surprise/1.webp`
- `surprise/2.webp`
- `surprise/3.webp`
- `anger/1.webp`
- `anger/2.webp`
- `anger/3.webp`

规则：

- `1.webp` 表示该 emotion 下最弱、最轻的视觉表达
- 最大编号表示该 emotion 下最强的视觉表达
- 系统不会对 intensity 做取模，而是按资源数量进行强度分桶映射

## 运行时资源加载方案

这轮已经把 emotion 资源加载从：

- `renderer assets + import.meta.glob + build-time manifest`

切换为：

- `main 侧运行时扫描 packs`
- `emotion-asset://` 自定义协议
- renderer 根据 `pack + label + intensity` 生成 URL

关键文件：

- [EmotionAssetService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/emotion/EmotionAssetService.ts)
- [emotion.ts](/Users/gnl/Workspace/code/-i-ati/src/main/ipc/emotion.ts)
- [emotionAssetUrls.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/assets/emotions/emotionAssetUrls.ts)
- [index.html](/Users/gnl/Workspace/code/-i-ati/src/renderer/index.html)

这样做的原因：

- 不再依赖 `import.meta.glob` 的运行时模块形态
- 不要求用户手动跑生成脚本
- 为后续用户自定义 pack 留出运行时扩展空间
- 避免再次引入 `file:` CSP 问题

## 当前设置项

emotion asset pack 当前已进入 app config：

```ts
emotion?: {
  assetPack?: string
}
```

默认值：

- `default`

相关文件：

- [index.d.ts](/Users/gnl/Workspace/code/-i-ati/src/types/index.d.ts)
- [index.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/config/index.ts)
- [SettingsPanel.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/settings/SettingsPanel.tsx)

## 当前 UI

设置页已经增加：

- Emotion Pack selector
- `Open Packs Folder` 按钮

当前逻辑：

- selector 列出运行时可发现的完整 packs
- 当前选中值保存到 `appConfig.emotion.assetPack`
- badge 渲染优先使用当前选中的 pack
- 如果自定义 pack 缺某个资源，main 侧会回退到 `default`

相关文件：

- [ToolsManager.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/settings/ToolsManager.tsx)
- [select.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/ui/select.tsx)

## 这轮解决的关键问题

### 1. 只靠 prompt 无法保证每轮都上报 emotion

现象：

- 模型多数时候会调用 `emotion_report`
- 但偶发仍会漏掉

修复：

- 保留本地 fallback classifier
- 但 fallback 只负责当前 emotion，不再负责 accumulated

### 2. tool emotion 和 fallback emotion 语义不统一

现象：

- tool 路径和 fallback 路径一开始各自有独立结构
- renderer 不得不额外判断来源

修复：

- 两条路径统一写入 `message.body.emotion`
- accumulated 独立进入结构化 emotion state

### 3. accumulated 如果放在 main 侧做语义 merge，容易失真

现象：

- 业务逻辑很难准确判断不同描述是不是同一股 lingering emotion
- 固定 topic 桶会过早压缩语义

修复：

- 把 accumulated merge 上移到模型侧
- tool 直接提交 rewritten accumulated list
- main 只负责校验、decay 和持久化

### 4. emotion 资源最初依赖 renderer 构建期资产

现象：

- 构建期 manifest 适合内置默认资源
- 不适合未来用户自定义 pack

修复：

- 资源切到运行时 pack
- main 扫描 pack 目录
- renderer 通过自定义协议读取
- pack 内文件从“语义文件名”收敛到“数字编号资源”

### 5. `file:` 资源直接加载触发 CSP

现象：

- renderer 直接加载本地绝对路径时触发 CSP 拦截

修复：

- 改为 `emotion-asset://`
- 在 renderer CSP 中显式允许该 scheme

## 当前边界

当前已经支持：

- 默认内置 pack
- 运行时发现用户 pack
- 设置页切换 pack
- badge 按 pack 渲染 emotion asset
- tool 驱动 accumulated rewrite
- 当前 emotion fallback

当前还没做：

- 用户自定义 pack 的导入向导
- pack 完整性检查 UI 提示
- 自定义 pack 缺少某个文件时的可视化诊断
- emotion pack 的预览界面

## 后续建议

1. 更新 emotion 设计文档，使其与当前 `accumulated` 数组结构和 tool 驱动 merge 保持一致
2. 给自定义 pack 加校验报告：
   - 缺少哪些 label
   - 每个 label 下缺少哪些编号资源
3. 增加 emotion pack 预览页，而不只是 selector
4. 如果后续要继续做更强人格连续性，再考虑：
   - `accumulated` 的更细约束
   - `background` 的更明确更新规则
   - prompt 中更强的 emotion self-check
5. 未来如果要把 pack 功能完全开放给用户，再考虑：
   - pack manifest 元数据
   - pack 封面 / 名称 / 作者
   - pack 导入与卸载
