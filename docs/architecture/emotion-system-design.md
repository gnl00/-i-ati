# Emotion System Design

> 这份文档定义的是 emotion 系统下一阶段的目标设计。
> 它不是当前实现快照，而是后续重构和扩展时应遵循的结构约束。

## 目标

emotion 不是装饰，而是 @i 人格一致性的外显结果。

系统目标不是“每轮随机换一个表情”，而是：

- 情绪变化有可解释来源
- 情绪变化速度受约束
- 残留情绪影响能够积累并衰减
- 展示层和内部状态解耦
- 在模型漏掉 `emotion_report` 时仍能稳定兜底

## 设计原则

### 1. 内部状态与展示结果分层

emotion 系统分成两层：

- `emotionState`
  - 内部人格状态
  - 负责 current / background / accumulated / history
- `emotionPresentation`
  - 当前对外展示结果
  - 负责 `label / intensity / emoji / source`

展示层不能反向定义内部状态。

也就是说：

- 渲染资源只是系统根据 `label + intensity` 派生出来的结果
- 不是情绪系统的 source of truth

### 2. Memory 不是主存储

emotion state 是一个会持续漂移、衰减、覆盖的结构化状态。

因此：

- `MemoryService` 适合存“快照摘要”
- 不适合做 emotion state 的主存储

推荐：

- 主存储：独立的结构化状态存储
- 辅助存储：必要时写 memory 快照，帮助长期语义连续性

### 3. 先保证可解释，再追求复杂度

第一阶段不要做难以解释的“情绪黑箱”。

优先保证：

- 变化来源明确
- 约束可验证
- 结果可调试

随机扰动只能是小幅噪声，不能主导结果。

## 状态模型

推荐内部结构：

```ts
type EmotionStateLabel =
  | 'calm'
  | 'curiosity'
  | 'concern'
  | 'warmth'
  | 'confusion'
  | 'happiness'
  | 'sadness'
  | 'fear'
  | 'anger'
  | 'surprise'
  | 'love'
  | 'neutral'
  | 'slight_defensiveness'

type EmotionState = {
  current: {
    label: EmotionStateLabel
    intensity: number
    updatedAt: number
  }
  background: {
    label: EmotionStateLabel
    intensity: number
    driftFactor: number
    updatedAt: number
  }
  accumulated: Array<{
    label: EmotionStateLabel
    description: string
    intensity: number
    decay: number
    updatedAt: number
  }>
  history: Array<{
    label: EmotionStateLabel
    intensity: number
    timestamp: number
    source: 'tool' | 'fallback' | 'computed'
  }>
}
```

当前含义：

- `current`
  - 当前这轮最终表达出来的情绪
- `background`
  - 较慢变化的底层性情
- `accumulated`
  - 尚未消退的情绪残留
- `history`
  - 最近若干轮的情绪轨迹

## 表现层模型

推荐统一展示结构：

```ts
type EmotionPresentation = {
  label: string
  intensity: number
  renderLabel: EmotionRenderLabel
  emoji?: string
  score?: number
  stateText?: string
  reason?: string
  source: 'tool' | 'fallback' | 'computed'
}
```

其中：

- `label`
  - 内部情绪标签
- `renderLabel`
  - 当前资源系统可渲染的标签
- `emoji`
  - 字符 fallback
- numbered asset variant
  - 由系统在渲染时根据 `label + intensity` 和当前 pack 资源数量动态计算

这层最终落到：

- `message.body.emotion`

## 内部标签与渲染标签映射

当前当前情绪 fallback 模型和资源系统仍然建立在现有渲染标签集合上。

因此建议增加一层映射：

```ts
type EmotionRenderLabel =
  | 'sadness'
  | 'anger'
  | 'love'
  | 'surprise'
  | 'fear'
  | 'happiness'
  | 'neutral'
  | 'disgust'
  | 'shame'
  | 'guilt'
  | 'confusion'
  | 'desire'
  | 'sarcasm'
```

推荐第一版映射：

| internal label | renderLabel |
|---|---|
| `calm` | `neutral` |
| `curiosity` | `confusion` |
| `concern` | `fear` |
| `warmth` | `love` |
| `slight_defensiveness` | `sarcasm` |
| `confusion` | `confusion` |
| `happiness` | `happiness` |
| `sadness` | `sadness` |
| `fear` | `fear` |
| `anger` | `anger` |
| `surprise` | `surprise` |
| `love` | `love` |
| `neutral` | `neutral` |

说明：

- 这层映射只是第一版兼容方案
- 后续如果 asset packs 扩展到新的 emotion label，可以逐步减少映射损失

## 资源包设计

emotion pack 推荐采用以下目录结构：

```text
resources/emotions/packs/default/
  anger/
    1.webp
    2.webp
    3.webp
  happiness/
    1.webp
    2.webp
    3.webp
  ...
```

约束：

- pack 必须包含 13 个 emotion label 目录
- 每个目录下的资源文件使用数字编号
- 编号语义为弱到强：
  - `1.webp` = 最轻
  - 最大编号 = 最强

资源选择规则：

- 模型不再直接指定资源名
- 系统根据 `label + intensity` 选择资源
- 不使用取模
- 使用强度分桶映射：
  - `variantIndex = ceil((intensity / 10) * variantCount)`
  - 然后 clamp 到 `1..variantCount`

这样：

- 低 intensity 落到低编号资源
- 高 intensity 落到高编号资源
- 自定义 pack 只要提供不同数量的编号资源，也能自动适配

## 计算流程

推荐每轮按以下顺序更新：

1. 读取上一轮 `emotionState`
2. 从当前用户消息估计 `immediate`
3. 将上一轮 `accumulated` 摘要注入 prompt
4. 由模型在 `emotion_report` 中重写 merged accumulated list
5. 对 `background` 施加小幅漂移
6. 计算候选分数并选出新的 `current`
7. 形成 `emotionPresentation`
8. 执行 `emotion_report`
9. 若模型未成功上报，则仅 fallback 补齐当前 emotion
10. 持久化新的 `emotionState`

## 推荐计算方式

不建议第一版直接做连续向量混算。

更稳的做法是：

1. 先得到三组候选：
   - `backgroundCandidate`
   - `accumulatedCandidate`
   - `immediateCandidate`
2. 为每个可能标签累计分数
3. 选出总分最高的标签作为 `current.label`

推荐权重：

```txt
background: 0.4
accumulated: 0.3
immediate: 0.3
```

但实现时应理解为“分数贡献”，而不是直接把字符串标签做数值平均。

## 触发规则

### 当前情绪触发

- 用户表达困难、挫折、压力
  - `immediate -> concern`
- 用户表达感谢、照顾、支持
  - `immediate -> warmth`
- 讨论设计、架构、技术机制
  - `immediate -> curiosity`
- 用户显著质疑或挑战
  - `immediate -> slight_defensiveness`
- 用户表达开心、认可、轻松正反馈
  - `immediate -> happiness`

### Accumulated 规则

- accumulated 不是 topic bucket，而是 lingering emotion residue list
- merged accumulated 由模型在 `emotion_report` 中重写
- main 侧不做语义 merge，只做结构校验与持久化
- 若本轮 tool 未提供 accumulated，则仅对上一轮 accumulated 做 decay 保留

### 背景漂移规则

- 每轮允许小幅漂移
- 强度变化很小
- 变化范围受上下边界约束

## 约束

### 强度边界

- `intensity ∈ [1, 10]`
- `background.intensity ∈ [3, 7]`

### 单轮变化约束

- `|current.intensity_delta| <= 2`

### 累积上限

- 单条 accumulated entry 的 intensity 上限 = `5`
- accumulated 列表长度建议不超过 `5`

### 历史长度

- `history` 只保留最近 `N` 轮
- 推荐 `N = 10`

## 持久化建议

推荐新增独立 emotion 状态存储，而不是直接复用 memory。

可选方案：

### 方案 A：独立表

```ts
emotion_state (
  chat_id INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)
```

优点：

- 结构清晰
- 容易做事务更新
- 与 chat 生命周期天然关联

### 方案 B：独立 JSON 文件

按 chat 维度保存到 app data。

不推荐作为第一选择，因为：

- 查询与调试不如数据库直接
- 与现有主进程数据流不如 DB 一致

### Memory 的角色

memory 只用于旁路摘要，例如：

```json
{
  "context_origin": "@i 情绪状态快照",
  "context_en": "@i emotion state snapshot",
  "emotion_state_summary": {
    "background": "calm(5)",
    "current": "curiosity(6)",
    "accumulated": [
      "concern(3): lingering worry about job progress",
      "warmth(2): residual gratitude after a supportive exchange"
    ]
  },
  "timestamp": 1743050000
}
```

这类摘要可以帮助长期叙事，但不应覆盖结构化主状态。

## Tool 与 Fallback 的关系

### Tool 路径

`emotion_report` 的定位：

- 主动人格表达
- 提供高质量、上下文敏感的当前情绪结果
- 提供模型重写后的 accumulated residue list

推荐输入：

- `label`
- `stateText?`
- `intensity?`
- `reason?`
- `accumulated?`

### Fallback 路径

fallback 的定位：

- 在模型漏掉 `emotion_report` 时兜底当前 emotion
- 保证 UI 和消息结构仍然有稳定的当前情绪结果

fallback 不负责：

- rewritten accumulated
- accumulated merge
- lingering residue 的语义构造

当前 fallback 模型适合作为：

- 当前 emotion surface 推断器
- 不是完整人格情绪状态机本身

因此推荐：

- fallback 先推断渲染标签
- 再映射回内部状态或直接补齐展示层

## Prompt 设计建议

system prompt 中建议拆成三部分：

### 1. Emotion Rules Section

定义：

- 状态层结构
- 更新顺序
- 强度边界
- 单轮变化约束

### 2. Emotion State Injection

每轮只注入必要摘要：

- `background`
- top 3 accumulated residue entries
- recent 3 history items

不要把完整大 JSON 直接塞进 prompt。

### 3. Emotion Self-Check

在最终 `emotion_report` 前，要求模型做轻量自检：

- 当前话题触发了什么即时情绪
- 是否与 background/accumulated 冲突
- intensity 是否越界
- 本轮变化是否过猛

## 建议落地顺序

### Phase 1

- 新增结构化 `emotionState` 持久化
- 实现 `current / background / accumulated / history`
- 保持当前 asset 与当前情绪 fallback 模型不变

### Phase 2

- 将 accumulated rewrite 明确收进 `emotion_report`
- prompt 注入 emotion state 摘要
- 将 `emotion_report` 与状态更新更紧密对齐

### Phase 3

- 评估是否要引入内部标签与 renderLabel 的进一步分层
- 加入更细粒度的 background 漂移
- 评估是否替换或升级当前 emotion fallback classifier

## 当前实现与目标设计的差异

当前系统已经具备：

- `emotion_report`
- fallback classifier
- `message.body.emotion`
- emotion asset packs

但还缺少：

- 结构化 `emotionState`
- `background / accumulated / history`
- 独立的 emotion state 主存储
- 更明确的背景漂移与约束
- 内部情绪标签与渲染标签分层的最终落地

因此，这份设计文档应视为：

- 当前第一阶段实现之上的下一步重构目标
