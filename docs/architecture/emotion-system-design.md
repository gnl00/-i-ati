# Emotion System Design

> 本文记录 emotion 系统当前运行边界、数据合同与状态转移约束。

## 目标

emotion 为 @i 人格提供跨轮次的状态连续性。系统把当前用户行为归一化为
小范围刺激分，再由 main-process reducer 确定性地计算 VAD 状态、13-label
展示结果、历史和 app-level 持久化。

## 决策边界

[ADR-0017](../decisions/0017-emotion-stimulus-scoring.md) 定义模型行为刺激
评分和 VAD 投影。[ADR-0006](../decisions/0006-app-level-emotion-state.md)
定义 app-level singleton ownership。

- `emotion_system` 保存稳定政策和评分锚点。
- `awake_state.emotion` 保存当前运行时基线、current VAD 和短历史。
- `emotion_report` 只提交本轮用户行为 stimulus。
- main-process reducer 负责向量转移、label/intensity/emoji、history、持久化和诊断。
- 13 个资源标签继续组成统一 presentation ontology。

## 单一标签体系

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

资源包和消息展示继续使用 `label + intensity` 选择 emoji/variant。状态内部
使用 VAD 数值，current 同时保留其 reducer 生成的 label/intensity 投影以服务
现有 IPC/UI 合同。

## 数据模型

```ts
type EmotionVector = {
  valence: number   // 0..10
  arousal: number   // 0..10
  dominance: number // 0..10
}

type EmotionStimulus = {
  impact: number     // -2..2
  activation: number // -2..2
  control: number    // -2..2
}

type EmotionStateSnapshot = {
  current: {
    vector: EmotionVector
    label: EmotionLabel
    intensity: number
    updatedAt: number
  }
  baseline: EmotionVector
  history: Array<{
    vector: EmotionVector
    stimulus: EmotionStimulus
    label: EmotionLabel
    intensity: number
    timestamp: number
    source: 'tool' | 'computed'
  }>
}
```

固定 baseline 为 `{ valence: 5, arousal: 3, dominance: 5 }`。`history` 保存
最近 10 条已应用的 transition。current 的展示字段由 current.vector 重新
投影生成，emoji 由 asset catalog 即时选择，持久化状态无需保存 emoji。

## Tool contract

`emotion_report` 的三个必填字段均为整数 `-2..2`：

| 字段 | 正值锚点 | 负值锚点 |
| --- | --- | --- |
| impact | 支持、认可、帮助、尊重 | 冒犯、否定、伤害、阻碍 |
| activation | 紧迫、施压、激化、强刺激 | 安抚、降温、放松 |
| control | 清晰、掌控、自主、可执行 | 混乱、失控、被动、无力 |

输入示例：

```json
{"impact": -1, "activation": 1, "control": 0}
```

processor 返回 `{ success, stimulus, message }`。`stimulus` 是经过整数和范围
校验的标准对象；processor 不读取或写入 emotion state，也不生成 label、
intensity 或 reason。模型在每个用户轮次调用一次，普通中性行为提交 `0/0/0`；
运行时把工具异常省略视为零 stimulus 回退。

## 状态转移

```text
awake_state.emotion.current.vector + current user turn
                         |
                         v
                   emotion_report?
                         |
              normalize stimulus (-2..2)
                         |
       baseline + retention * (previous - baseline) + gain * stimulus
                         |
                   clamp 0..10
                         |
               VAD -> label/intensity/emoji
                         |
               message + app singleton
```

每个轴独立执行：

```text
next = baseline + retention * (previous - baseline) + gain * stimulus
```

参数固定为：

```ts
retention = { valence: 0.8, arousal: 0.5, dominance: 0.7 }
gain = 1
```

结果 clamp 到 `0..10`；距离对应 baseline 小于 `0.05` 时吸附到 baseline，
让零刺激最终完成回归。一次 `impact=-2` 将 valence 从 5 推到 3，重复相同
刺激后继续下降；`activation=2` 提升 arousal 并保留独立的 valence 变化。

### Reducer 输出

`transitionEmotionState()` 返回：

- `state`：写入 app singleton 的 v2 snapshot；
- `presentation`：写入 `message.body.emotion` 的 `{ label, intensity, emoji, source }`；
- `diagnostics`：只包含 previous/resolved VAD、requested stimulus、mode 和 history action。

presentation 的 source 为 `computed`，语义标签完全由 reducer 投影。history
source 使用 `tool` 标识显式刺激，使用 `computed` 标识 omitted/zero-stimulus
回归。

工具省略时 mode 为 `decayed`。首轮无持久化状态时 mode 为 `initialized`，
current 从固定 baseline 建立。显式中性工具调用会保留一条 tool history。

## VAD 投影

reducer 使用权重 `valence=1.25`、`arousal=1`、`dominance=0.75` 的加权欧氏
距离，候选中心如下：

| label | valence | arousal | dominance |
| --- | ---: | ---: | ---: |
| sadness | 2 | 2 | 4 |
| anger | 1.5 | 8 | 8 |
| love | 7.5 | 3.5 | 6 |
| surprise | 5.5 | 6 | 5 |
| fear | 2 | 6 | 2.5 |
| happiness | 7.5 | 5.5 | 5.5 |
| neutral | 5 | 3 | 5 |
| disgust | 2.5 | 5.5 | 6 |
| shame | 2 | 2.5 | 2 |
| guilt | 1.5 | 3 | 1.5 |
| confusion | 4.5 | 5 | 3.5 |
| desire | 7.5 | 7.5 | 7 |
| sarcasm | 4 | 6.5 | 8.5 |

选取距离最小的 label；候选表顺序提供相等距离的稳定 tie-break。展示强度为：

```text
intensity = round(clamp(5 + distance(current.vector, baseline) * 1.25, 1, 10))
```

基线得到 `neutral / 5`。guilt、shame、sarcasm 的邻域存在低可分性，fixture
锁定当前中心和边界，后续标注数据可驱动中心调整。

## Finalize 与 singleton

`ChatStepStore.finalizeAssistantMessage()` 从最终 assistant segments 提取
成功的 `emotion_report` stimulus，先以当前 singleton 计算 presentation，再完成
assistant message update/save，最后在 app-level SQLite transaction 中重新读取
singleton 并提交同一 transition。消息和持久化 current 使用同一 VAD 结果。

流式 render 层保持上一轮已提交的 emotion 展示。它缺少 app-level current
vector，因此等待 finalize 后的 reducer presentation，避免从固定 baseline 生成
短暂且错误的中间标签。

processor 的 tool result 保留在隐藏 tool segment，包含 normalized stimulus；
message body 的 emotion 字段提供 reducer-resolved label/intensity/emoji。ChatHeader、
welcome、Telegram host 和其他 render consumer 继续读取这组展示字段。

## Awake 与 prompt

稳定政策位于 `<emotion_system>`：模型读取 awake emotion，依据当前可观察用户
行为使用三维锚点评分，遵循 omission/比例规则。动态状态位于
`<awake_state>`：

- `emotion.baseline`：固定 VAD 与 `neutral / 5` 展示投影；
- `emotion.current`：当前 VAD、label、intensity；
- `emotion.recent_history`：最近 3 条 VAD、stimulus、label/intensity 和来源；
- `emotion.summary`：与结构化字段一致的短文本。

`EmotionPromptProvider` 的策略层可继续参与 system prompt 组合；运行态读取
统一来自 awake snapshot，保持 prompt cache 的稳定前缀和动态尾部边界。

## Persistence

SQLite 继续使用 app singleton 表：

```sql
app_emotion_state (
  scope TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

`state_json` 使用：

```ts
type PersistedEmotionState = {
  schemaVersion: 2
  state: EmotionStateSnapshot
}
```

mapper 行为：

- v2 校验 vector、baseline、history，并以共享投影重建 current label/intensity；
- baseline 始终归一化为固定 `{5,3,5}`；
- v1 current label/intensity 和 history 使用共享 centroid 转换为 v2 vector，
  缺失 stimulus 补零；legacy background/accumulated 随旧 envelope 一并退出；
- malformed JSON 恢复 v2 neutral baseline，issue 为 `invalid_json`；
- 未知 schema 恢复 v2 neutral baseline，issue 为 `unsupported_schema`；
- v1 读取状态返回 `migrated` 和 `migrated_v1` issue，后续 repository 写入使用 schema 2。

repository 继续在一个 SQLite transaction 内完成 read/transition/conditional
upsert，保留原始 `created_at` 并刷新 `updated_at`。所有 chat、host、awake 和
welcome 读取同一 singleton；删除 chat 不影响 emotion state。

## 测试合同

- tool processor：三字段必填、整数边界、范围边界、stateless response；
- reducer：neutral/omitted 回归、连续 hostility 负向累积、respectful urgent
  arousal、apology/support 修复、history 上限和 computed presentation；
- mapper：v2 round-trip、v1 确定性迁移、字段恢复、neutral recovery；
- ChatStepStore：message presentation 与 singleton current 同源、tool omission、
  app-level transaction 顺序；
- awake：baseline/current/history 结构化注入和 summary 同步；
- repository：Chat A 提交的 vector 成为 Chat B 下一次 transition 的 baseline。
