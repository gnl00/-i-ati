# Emotion System Design

> 这份文档记录 emotion 系统当前运行边界与演进约束。

## 目标

emotion 是 @i 人格一致性的外显结果。系统提供：

- 来源清晰的语义情绪变化
- 受约束的单轮强度变化
- 可积累、衰减与淘汰的情绪残留
- 独立的内部状态与消息表现职责
- 模型省略 `emotion_report` 时稳定延续的 awake baseline

## 决策边界

[ADR-0005](../decisions/0005-emotion-semantic-authority.md) 确立以下合同：

- 13 个资源标签组成唯一 emotion ontology。
- `emotion_report` 是新语义情绪的唯一来源。
- main-process reducer 负责确定性状态约束。
- fixed-weight candidate composition、immediate classifier 和第二套内部标签体系退出路线图。

模型结合对话上下文与 awake emotion 判断语义。reducer 负责强度限速、background
滞回、accumulated 衰减、history 截断、持久化与诊断。

## 单一标签体系

状态、消息表现和资源包共享以下 13 个标签：

```ts
type EmotionLabel =
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

内部状态与表现层通过职责分离：

- `EmotionStateSnapshot` 维护 current / background / accumulated / history。
- `ChatEmotionState` 描述本轮消息表现。
- emotion asset catalog 根据 `label + intensity` 选择 emoji 和资源 variant。

## 状态模型

```ts
type EmotionStateSnapshot = {
  current: {
    label: EmotionLabel
    intensity: number
    updatedAt: number
  }
  background: {
    label: EmotionLabel
    intensity: number
    driftFactor: number
    updatedAt: number
  }
  accumulated: Array<{
    label: EmotionLabel
    intensity: number
    decay: number
    updatedAt: number
  }>
  history: Array<{
    label: EmotionLabel
    intensity: number
    timestamp: number
    source: 'tool' | 'computed'
  }>
}
```

- `current`：当前一轮最终表达的情绪。
- `background`：采用滞回迁移的慢变量。
- `accumulated`：由模型重写、由 reducer 衰减的情绪残留。
- `history`：最近 10 次成功 report 的状态轨迹。

当前运行链路产生 `tool` 与 `computed`。

## 每轮状态转移

```text
previous emotion state + awake prompt
                  |
                  v
              MainAgent
                  |
           emotion_report?
                  |
                  v
     deterministic transition reducer
       - current intensity bounding
       - background hysteresis
       - accumulated rewrite or decay
       - history truncation
       - transition diagnostics
                  |
          +-------+-------+
          v               v
 message presentation  app_emotion_state
```

### Reported 路径

成功的 `emotion_report` 提供：

- current label 与目标 intensity
- 可选的 state text 和 reason
- 可选的 accumulated 完整重写列表

reducer 将目标 intensity 限制在 previous current 的 `±2`，并让消息表现与持久化
current 使用同一个 resolved 值。

### Carry-forward 路径

模型省略 `emotion_report` 时：

- previous current 延续为 presentation 和下一轮 current
- 首轮建立 `neutral / 5 / computed`
- accumulated 执行 deterministic decay
- history 与 background 保持稳定

### Background 规则

- 同 label report 让 background intensity 按 drift factor 靠近 current。
- 连续三次成功 report 同一新 label 后晋升 background label。
- `background.intensity` 保持在 `[3, 7]`。

### Accumulated 规则

- tool 提供列表时执行完整重写。
- tool 省略列表时按 entry decay 逐轮衰减。
- decayed intensity 低于 `0.25` 时淘汰。
- 同 label 重复项保留 intensity 最强的一项。
- 单条 intensity 范围为 `[0.25, 5]`，列表最多保留 5 个 label。

## Transition diagnostics

reducer 同步返回结构化诊断：

```ts
type EmotionTransitionDiagnostics = {
  mode: 'reported' | 'carried_forward' | 'initialized'
  previous?: { label: string; intensity: number }
  requested?: { label: string; intensity: number }
  resolved: { label: string; intensity: number }
  intensityBounded: boolean
  backgroundAction: 'held' | 'drifted' | 'promoted' | 'initialized'
  accumulatedAction: 'rewritten' | 'decayed' | 'evicted' | 'empty'
  evictedCount: number
}
```

`ChatStepStore` 按现有结构化日志规范记录这组诊断。日志字段只包含标签、强度、状态动作
和淘汰数量。accumulated 只包含 label、intensity、decay 与时间戳。

Finalize 先基于当前 singleton 计算 message presentation，随后完成 assistant message
的 update 或 save + attach，最后提交 emotion singleton transition。任一消息持久化
步骤抛出异常时，emotion singleton 保持原值。

这组数据支持统计 report rate、carry-forward rate、label change rate、bounded rate、
background promotion rate 和 accumulated eviction rate。

## 持久化

emotion state 使用 app 级 singleton SQLite 表：

```sql
app_emotion_state (
  scope TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

`state_json` 只接受 version 1 envelope：

```ts
type PersistedEmotionState = {
  schemaVersion: 1
  state: EmotionStateSnapshot
}
```

mapper 行为：

- version 1 envelope 经过运行时字段校验与规范化。
- malformed JSON 恢复为 `neutral / 5`，issue 为 `invalid_json`。
- 其他 schema 恢复为 `neutral / 5`，issue 为 `unsupported_schema`。
- version 1 内的非法字段按字段级默认值恢复并记录 issues。

固定 scope 为 `app`。repository 在一个 SQLite transaction 内完成
read / transition / conditional upsert，保留原始 `created_at` 并刷新 `updated_at`。
所有 chat 与 host 读取同一状态，chat 删除保持 app emotion state。

## 资源选择

emotion pack 按标签目录与数字 variant 组织：

```text
resources/emotions/packs/default/
  anger/
    1.webp
    2.webp
  happiness/
    1.webp
    2.webp
```

pack 提供 13 个标签目录。系统按以下规则选择资源：

```text
variantIndex = ceil((intensity / 10) * variantCount)
```

结果 clamp 到 `1..variantCount`。低 intensity 对应较低编号，高 intensity 对应较高编号。

## Prompt 与 awake state

awake prompt 注入：

- current 与 background
- accumulated 摘要
- recent history

MainAgent 使用这些内容维持人格表达，并在语义情绪发生变化时调用 `emotion_report`。
prompt 保持摘要化，完整 state JSON 保留在持久化边界。

## 测试合同

conversation transition fixtures 覆盖：

- 持续稳定对话
- 连续认可与强度增长
- 单次质疑与 background 保持
- 连续三次同类变化后的 background 晋升
- accumulated decay 与 eviction
- tool 省略时 carry-forward
- 快速情绪反转时 intensity bounding
- unsupported schema 的 neutral recovery

这些 fixture 直接验证 reducer 与 mapper 的确定性输入输出。
