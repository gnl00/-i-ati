# 消息压缩优化说明

## 优化前的问题

之前的压缩策略会产生多条独立的摘要，导致：

```
第一次压缩：[消息1-10] → [摘要1]
第二次压缩：[消息11-20] → [摘要2]
第三次压缩：[消息21-30] → [摘要3]

发送给 LLM：[摘要1] + [摘要2] + [摘要3] + [消息31-50]
```

**问题**：
- 多条摘要之间存在内容冗余
- 摘要数量会不断累积
- Token 节省效果不明显

## 优化后的方案

新的压缩策略采用"滚动压缩"模式：

```
第一次压缩：
[消息1-10] → [摘要1]
数据库：摘要1 (status: active)

第二次压缩：
[摘要1] + [消息11-20] → [摘要2]
数据库：摘要1 (status: superseded), 摘要2 (status: active)

第三次压缩：
[摘要2] + [消息21-30] → [摘要3]
数据库：摘要1 (superseded), 摘要2 (superseded), 摘要3 (active)

发送给 LLM：[摘要3] + [消息31-50]
```

**优势**：
- 每个 chat 只保留一条活跃摘要
- 新摘要基于旧摘要生成，保持上下文连贯
- 避免内容冗余，最大化 token 节省
- 旧摘要保留为 superseded 状态，可追溯历史

## 实现细节

### 1. compressionService.ts 修改

**generateSummary 方法**：
- 新增 `previousSummary` 可选参数
- 如果有旧摘要，使用不同的 prompt 将旧摘要与新消息合并
- 如果没有旧摘要，直接压缩新消息

**compress 方法**：
- 获取最新的活跃摘要
- 将旧摘要的内容作为上下文传递给 LLM
- 生成新摘要后，将旧摘要标记为 superseded
- 保存新摘要为 active 状态

### 2. compressionApplier.ts 修改

**applyCompression 方法**：
- 只使用最新的活跃摘要（summaries 数组中的最后一条）
- 简化逻辑，不再需要遍历多条摘要
- 在压缩范围起始位置插入摘要后，跳过所有被压缩的消息

**优化点**：
- 由于 `getActiveCompressedSummariesByChatId()` 只返回 active 状态的摘要
- 理论上 summaries 数组只包含一条记录
- 代码更清晰，性能更好

## 数据库状态管理

### status 字段的三种状态

- **active**：当前活跃的摘要，会被应用到消息列表
- **superseded**：已被新摘要替代，保留用于历史追溯
- **invalid**：无效的摘要（预留，暂未使用）

### 查询逻辑

```sql
-- 获取活跃摘要（只返回最新的一条）
SELECT * FROM compressed_summaries
WHERE chat_id = ? AND status = 'active'
ORDER BY compressed_at DESC
```

## 效果对比

### 优化前

假设有 50 条消息，每 10 条压缩一次：

```
摘要1: 消息1-10 (100 tokens)
摘要2: 消息11-20 (100 tokens)
摘要3: 消息21-30 (100 tokens)
摘要4: 消息31-40 (100 tokens)
原始消息: 消息41-50 (500 tokens)

发送给 LLM: 100 + 100 + 100 + 100 + 500 = 900 tokens
```

### 优化后

同样的 50 条消息，滚动压缩：

```
摘要4: 消息1-40 的综合摘要 (150 tokens)
原始消息: 消息41-50 (500 tokens)

发送给 LLM: 150 + 500 = 650 tokens
```

**节省效果**：(900 - 650) / 900 = 27.8% 的额外 token 节省

## 测试建议

### 1. 验证旧摘要被标记为 superseded

```sql
-- 查看某个 chat 的所有摘要
SELECT id, status, compressed_at,
       LENGTH(summary) as summary_length,
       json_array_length(message_ids) as message_count
FROM compressed_summaries
WHERE chat_id = ?
ORDER BY compressed_at ASC;
```

### 2. 验证只有一条活跃摘要

```sql
-- 应该只返回一条记录
SELECT COUNT(*) as active_count
FROM compressed_summaries
WHERE chat_id = ? AND status = 'active';
```

### 3. 验证摘要内容的连贯性

- 查看最新的活跃摘要内容
- 确认它包含了之前所有消息的关键信息
- 检查是否避免了重复内容

## 注意事项

1. **向后兼容**：已有的多条 active 摘要会在下次压缩时被处理
2. **数据迁移**：不需要手动迁移旧数据，系统会自动处理
3. **性能影响**：优化后每次压缩需要传递旧摘要给 LLM，但 token 总量更少
4. **摘要质量**：依赖 LLM 的合并能力，建议使用较强的模型进行压缩

## 总结

这次优化通过"滚动压缩"策略，显著减少了摘要冗余，提高了 token 节省效果。每个 chat 只保留一条活跃摘要，使得压缩功能更加高效和易于维护。
