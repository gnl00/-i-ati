# Emotion System Stage Summary

> 这份文档记录的是当前 emotion 系统第一阶段的结构收敛结果。
> 当前状态以 2026-03-26 为准，重点覆盖：
> - `emotion_report` 工具
> - fallback emotion inference
> - 统一 emotion 数据结构
> - emotion asset pack 与运行时资源加载

## 背景

这轮 emotion 系统的目标，不是做一个单独的“表情装饰功能”，而是把 assistant 当前情绪纳入统一消息结构，并在模型缺失主动上报时提供本地 fallback。

也就是说：

- 主路径：模型主动调用 `emotion_report`
- 兜底路径：本地 emotion classifier 从 assistant 最终文本推断
- 展示路径：renderer 只消费统一的 emotion 结果

## 当前主路径

当前完整链路是：

1. prompt 要求模型在每轮 response 中调用 `emotion_report`
2. tool 输入 `label + emojiName`，可选 `stateText / intensity / reason`
3. main 侧校验 tool payload，并写入统一 `message.body.emotion`
4. 如果本轮没有成功的 `emotion_report`，则在 assistant finalize 阶段运行本地 fallback
5. renderer 从 `message.body.emotion` 读取情绪信息并渲染 badge

关键文件：

- [index.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/prompts/index.ts)
- [emotion_tools.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/definitions/emotion_tools.ts)
- [EmotionToolsProcessor.ts](/Users/gnl/Workspace/code/-i-ati/src/main/tools/emotion/EmotionToolsProcessor.ts)
- [ChatStepStore.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/hostAdapters/chat/persistence/ChatStepStore.ts)
- [assistant-message/index.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/chat/chatMessage/assistant-message/index.tsx)
- [ModelBadgeNext.tsx](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/chat/chatMessage/assistant-message/model-badge/ModelBadgeNext.tsx)

## 统一 emotion 语义

当前 tool 路径和 fallback 路径已经统一到一份 canonical shape：

```ts
type ChatEmotionState = {
  label: string
  emoji: string
  emojiName?: string
  score?: number
  intensity?: number
  reason?: string
  stateText?: string
  source: 'tool' | 'fallback'
}
```

消息结构定义见：

- [index.d.ts](/Users/gnl/Workspace/code/-i-ati/src/types/index.d.ts)

这意味着 renderer 不再需要区分：

- tool 直接产出的 emotion
- fallback 模型推断出的 emotion

UI 只需要读取：

- `message.body.emotion`

## `emotion_report` 工具设计

当前 `emotion_report` 已不再接受完全自由的情绪文本，而是对齐统一结构：

- `label`
- `emojiName`
- `stateText?`
- `intensity?`
- `reason?`

设计原则：

- `label` 对齐系统内 emotion label 集合
- `emojiName` 必须属于该 label 可接受的 asset 候选
- `stateText` 作为可选的人格化补充说明保留

相关文件：

- [emotion_tools.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/definitions/emotion_tools.ts)
- [EmotionToolsProcessor.ts](/Users/gnl/Workspace/code/-i-ati/src/main/tools/emotion/EmotionToolsProcessor.ts)

## Fallback Emotion Inference

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

- `label + score`

选择合适的 emotion asset，并补齐：

- `emoji`
- `emojiName`
- `source: 'fallback'`

相关文件：

- [EmotionInferenceService.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/emotion/EmotionInferenceService.ts)
- [emotion-state.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/emotion/emotion-state.ts)

## Emotion Asset Catalog

当前 emotion label、候选 asset、fallback 选择规则统一维护在：

- [emotionAssetCatalog.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/emotion/emotionAssetCatalog.ts)

这层负责：

- label 集合
- `emojiName -> emoji`
- fallback 时按 `label + score` 选择 asset
- 校验 `emojiName` 是否属于给定 label

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

每个目录下的文件名就是 canonical `emojiName`，例如：

- `surprise/Hushed Face.webp`
- `anger/Angry Face.webp`

## 运行时资源加载方案

这轮已经把 emotion 资源加载从：

- `renderer assets + import.meta.glob + build-time manifest`

切换为：

- `main 侧运行时扫描 packs`
- `emotion-asset://` 自定义协议
- renderer 根据 `pack + label + emojiName` 生成 URL

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

- 引入本地 fallback classifier
- 最终 assistant message 始终尽量补齐 `body.emotion`

### 2. tool emotion 和 fallback emotion 语义不统一

现象：

- tool 路径和 fallback 路径一开始各自有独立结构
- renderer 不得不额外判断来源

修复：

- 两条路径统一写入 `message.body.emotion`

### 3. emotion 资源最初依赖 renderer 构建期资产

现象：

- 构建期 manifest 适合内置默认资源
- 不适合未来用户自定义 pack

修复：

- 资源切到运行时 pack
- main 扫描 pack 目录
- renderer 通过自定义协议读取

### 4. `file:` 资源直接加载触发 CSP

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

当前还没做：

- 用户自定义 pack 的导入向导
- pack 完整性检查 UI 提示
- 自定义 pack 缺少某个文件时的可视化诊断
- emotion pack 的预览界面

## 后续建议

1. 增加 “Open User Emotion Packs Folder” 的说明文案，明确 pack 目录约定
2. 给自定义 pack 加校验报告：
   - 缺少哪些 label
   - 缺少哪些 canonical `emojiName`
3. 增加 emotion pack 预览页，而不只是 selector
4. 未来如果要把 pack 功能完全开放给用户，再考虑：
   - pack manifest 元数据
   - pack 封面 / 名称 / 作者
   - pack 导入与卸载
