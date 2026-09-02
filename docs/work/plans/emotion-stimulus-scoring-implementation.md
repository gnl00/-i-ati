# Emotion 刺激评分优化实施指导

Owner: Chat runtime maintainers<br>
Status: Active<br>
Started: 2026-09-01<br>
Target: 让 emotion 状态由用户行为刺激分数驱动，并保持 app-level 连续性、UI 展示和安全迁移<br>
Exit criteria: 工具、reducer、mapper、awake 注入、文档与聚焦测试同步完成；Node 类型检查和相关边界检查记录结果<br>
Related specs: [Documentation governance](../../specs/documentation-governance.md)<br>
Related ADRs: [ADR-0005](../../decisions/0005-emotion-semantic-authority.md)、[ADR-0006](../../decisions/0006-app-level-emotion-state.md)、新增 ADR-0017<br>
Related architecture: [Emotion system design](../../architecture/emotion-system-design.md)、[Awake state design](../../architecture/awake/awake-state-design.md)<br>
Related implementation: `src/shared/emotion`、`src/main/services/emotion`、`src/main/tools/emotion`、`src/main/db/mappers`、`src/main/hosts/chat/persistence`、`src/main/services/awake`

## 背景

旧流程让模型根据历史 emotion 状态直接重写 label、intensity、stateText、reason 和 accumulated。模型具有稳定的正向表达倾向，持续交互中的冒犯、阻碍和紧张信号容易被平滑成积极状态。

本次改造把模型职责收敛为当前用户行为的短量表判断。模型输出本轮刺激，main-process reducer 结合持久化向量完成状态转移、情绪标签投影、强度、历史和消息表现。`emotion_system` 保留稳定政策，当前运行状态统一通过 `awake_state.emotion` 注入。

## 目标与边界

### 目标

1. `emotion_report` 接收三个有符号整数：`impact`、`activation`、`control`，范围均为 `-2..2`。
2. 内部状态使用命名 VAD 向量 `valence / arousal / dominance`，范围均为 `0..10`。
3. 固定基线为 `{ valence: 5, arousal: 3, dominance: 5 }`。
4. reducer 使用确定性 retention + gain 公式，支持连续负面行为累积和中性轮次回归基线。
5. reducer 确定性投影现有 13 个 emotion label，并保留 `label + intensity + emoji` 的消息/UI 合同。
6. 持久化 envelope 使用 `schemaVersion: 2`，合法 v1 数据可确定性迁移。
7. app-level singleton、ChatStepStore finalize、awake 注入和 renderer 读取保持同一状态来源。

### 边界

- 模型输出只描述可观察的本轮用户行为对运行时的刺激，不输出模型自身情绪状态。
- `stateText`、`reason`、`accumulated` 退出工具输入和持久化状态。
- 每个用户轮次调用一次工具；运行时以零刺激处理工具异常省略并执行确定性回归。
- v1 的 background/accumulated 保留在旧 envelope 中供 parser 识别；current label/intensity 是迁移语义线索，v2 维护单一 VAD 向量。
- guilt、shame、sarcasm 的 VAD 区域存在低可分性，首版接受确定性近邻结果并用 fixture 锁定可解释边界。

## 数据合同

### 工具输入

```json
{
  "impact": -2,
  "activation": 1,
  "control": 0
}
```

字段语义：

| 字段 | 范围 | 正值锚点 | 负值锚点 |
| --- | ---: | --- | --- |
| `impact` | `-2..2` | 支持、认可、帮助、尊重 | 冒犯、否定、伤害、阻碍 |
| `activation` | `-2..2` | 紧迫、施压、激化、强刺激 | 安抚、降温、放松 |
| `control` | `-2..2` | 清晰、掌控、自主、可执行 | 混乱、失控、被动、无力 |

三个字段均为必填整数。模型在每个用户轮次调用一次，工具中性输入为
`{ impact: 0, activation: 0, control: 0 }`。工具异常省略时由运行时使用同一零刺激。

### 持久化状态

v2 状态保留 current 的展示投影以服务现有 IPC/UI，同时把向量作为唯一计算来源：

```ts
type EmotionStateSnapshot = {
  current: {
    vector: { valence: number; arousal: number; dominance: number }
    label: EmotionLabel
    intensity: number
    updatedAt: number
  }
  baseline: { valence: 5; arousal: 3; dominance: 5 }
  history: Array<{
    vector: { valence: number; arousal: number; dominance: number }
    stimulus: { impact: number; activation: number; control: number }
    label: EmotionLabel
    intensity: number
    timestamp: number
    source: 'tool' | 'computed'
  }>
}
```

`history` 最多保留 10 条。current 的 label/intensity 是 reducer 对 current.vector 的缓存投影，任何输入都由向量重新计算后写入。emoji 继续由 asset catalog 按 label/intensity 生成，持久化状态无需保存 emoji。

## 状态转移

### 公式与参数

每个轴独立执行：

```text
next = baseline + retention * (previous - baseline) + gain * stimulus
```

首版参数：

```ts
retention = {
  valence: 0.8,
  arousal: 0.5,
  dominance: 0.7
}
gain = 1
```

结果逐轴 clamp 到 `0..10`，距离基线小于 `0.05` 时吸附到基线，避免浮点残差阻止最终收敛。`gain=1` 让一次 `impact=-2` 将 valence 从 5 推到 3，连续相同刺激依次推到 1.4 和 0 附近；一次行为保持可读变化，重复行为产生明显累积。

### 每轮流程

```text
awake_state.emotion + current user turn
                    |
                    v
              emotion_report?
                    |
       normalize integer stimulus (-2..2)
                    |
     baseline + retention + gain + clamp
                    |
         VAD vector -> label/intensity
                    |
        message emotion + singleton state
```

- 首轮无历史时从固定基线开始；有工具时先应用本轮刺激。
- 已有状态且工具省略时使用零刺激，状态向固定基线回归并按需记录 computed history。
- 显式中性工具调用会产生 tool history；状态向量保持或靠近基线。
- reducer 返回 `presentation` 给 finalize，`state` 给 singleton persistence，二者来自同一向量计算。

## VAD 到 13-label 投影

使用加权欧氏距离，权重为 `valence=1.25`、`arousal=1`、`dominance=0.75`。候选中心按下表固定，数组顺序作为完全相等时的 tie-break：

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

强度由 current.vector 到固定基线的加权距离得到：

```text
intensity = round(clamp(5 + distance * 1.25, 1, 10))
```

基线投影为 `neutral / 5`。标签和强度完全由 reducer 生成；模型分数不会直接覆盖展示强度。

## v1 迁移

mapper 识别 `schemaVersion: 1` 后执行以下步骤：

1. 规范化 v1 current label/intensity，非法值使用 neutral/5。
2. 读取该 label 的固定中心，将中心相对固定基线的方向按 `intensity / 10` 缩放，得到 v2 current.vector。
3. baseline 固定写为 `{ valence: 5, arousal: 3, dominance: 5 }`。
4. 用 v1 current 生成一条 `source: computed` 的迁移 history；v1 history 中合法条目按相同规则转换，最多保留 10 条，缺失 stimulus 补零。
5. 丢弃 v1 background 与 accumulated，重新由 v2 reducer 管理回归与历史。
6. 返回迁移后的 v2 snapshot；下一次 repository 写入使用 schemaVersion 2。迁移过程记录 `migrated_v1` issue，保留原始 `created_at`。

malformed JSON、未知 schema 和无法形成对象的 state 统一恢复为 v2 neutral baseline，并分别记录 `invalid_json`、`unsupported_schema` 或字段 issue。

## Awake 与 prompt

`emotion_system` 只放稳定策略：本轮读取 `awake_state.emotion`、按照用户行为评估刺激、遵循工具锚点和省略规则。动态状态放入 awake snapshot：

- `emotion.baseline`：固定 VAD 基线及其 `neutral / 5` 展示投影。
- `emotion.current`：当前 VAD、label、intensity，作为模型本轮连续性的主要输入。
- `emotion.recent_history`：最近 3 条 label/intensity、VAD、stimulus 和来源。
- summary：与上述字段一致的短文本，省略 legacy accumulated/background。

消息 finalize 仍把 reducer presentation 写入 `message.body.emotion`；ChatHeader、welcome 和 host render 继续读取 `label/intensity/emoji`。

## 文件与执行顺序

1. 先更新本指导文档，锁定合同、参数和 fixture。
2. 新增共享 VAD 常量、校验、转移和投影函数。
3. 更新工具 definition、参数/响应类型和 processor 校验。
4. 重写 emotion extraction/reducer，移除 model-owned stateText/reason/accumulated 处理。
5. 更新 v2 mapper 与 v1 migration，保留 app singleton repository/transaction 边界。
6. 更新 awake 类型、snapshot、summary、prompt 和 active ADR/architecture 文档。
7. 更新 emotion、mapper、repository、ChatStepStore、awake、prompt 相关测试与 fixtures。
8. 运行 focused Vitest、Node typecheck、main boundary/docs checks 和 `git diff --check`。

## 验收矩阵

| fixture | 预期 |
| --- | --- |
| 首轮无工具 / 中性工具 | state 建立或保持 neutral/5；后续 omitted 逐步吸附基线 |
| 连续 hostile：impact=-2 | valence 逐轮下降；投影进入负面 label，history 最多 10 条 |
| respectful urgent：impact=1, activation=2, control=1 | arousal 上升，valence 保持 neutral/positive 区域 |
| apology/support：impact=2, activation=-1, control=1 | 负面状态逐步修复并向基线回归 |
| 缺字段、小数、超范围、额外字段 | processor 失败；每个分数均接受整数边界校验 |
| 合法 v1 row | 确定性得到 v2 vector/baseline/history，下一次写入 envelope 为 2 |
| ChatStepStore finalize | message.body.emotion 具有 label/intensity/emoji，和 persisted current 同源 |
| Chat A -> Chat B | 两次 singleton transition 共享最新 current vector |

## 风险与已知上限

- VAD 近邻映射是轻量解释模型，guilt/shame/sarcasm 的语义分界较弱；通过中心点 fixture 维持稳定，真实误差进入后续标注优化。
- history 保存每轮已应用的刺激和投影，10 条窗口提供有限上下文；完整对话语义继续由 chat history、memory 和 work context 承担。
- v1 accumulated 失去独立残留轨迹，当前行为的长期效果由 vector retention 提供；需要更细粒度来源时应设计新的刺激通道并升级 schema。

## 回滚

代码回滚会恢复 v1 工具合同与 reducer。v2 row 需要通过版本迁移工具或数据库备份恢复到 v1；运行时保留 v1 parser 便于升级期间读取历史数据。本文和 superseding ADR 与实现同步回滚或归档。
