# sqlite-vec 集成问题排查与解决

## 概述

本文档记录了在集成 `sqlite-vec` 向量搜索扩展时遇到的关键问题、根本原因及解决方案。

---

## 核心问题

### 问题 1：向量存储维度不匹配

**错误信息**：
```
SqliteError: Dimension mismatch for inserted vector for the "embedding" column.
Expected 384 dimensions but received 96.
```

**根本原因**：
使用 `Buffer.from(float32Array)` 会将 `Float32Array` 作为可迭代对象处理，导致每个 float32 值被截断为 1 字节，而非预期的 4 字节。

**错误代码**：
```typescript
// ❌ 错误：float32Array 被当作 iterable 处理
const embeddingBuffer = Buffer.from(float32Array)
// 结果：384 个 float32 → 384 字节 (应为 1536 字节)
```

**正确方案**：
```typescript
// ✅ 正确：直接从底层 ArrayBuffer 创建 Buffer
const embeddingVector = new Float32Array(embedding)
const embeddingBuffer = Buffer.from(
  embeddingVector.buffer,
  embeddingVector.byteOffset,
  embeddingVector.byteLength
)
// 结果：384 个 float32 × 4 字节 = 1536 字节 ✓
```

**关键要点**：
- sqlite-vec 的 `FLOAT[384]` 列需要 384 个 4 字节的浮点数（共 1536 字节）
- 必须使用 `Float32Array.buffer` 访问底层二进制数据
- 需要指定 `byteOffset` 和 `byteLength` 以确保正确的内存范围

---

### 问题 2：向量检索时的格式转换

**场景**：从数据库读取 Buffer 并还原为 Float32Array

**正确方案**：
```typescript
const vecRow = db.prepare(
  'SELECT embedding FROM vec_memories WHERE memory_id = ?'
).get(row.id) as { embedding: Buffer }

const float32Array = new Float32Array(
  vecRow.embedding.buffer,
  vecRow.embedding.byteOffset,
  vecRow.embedding.byteLength / 4
)

const embedding = Array.from(float32Array)
```

---

### 问题 3：中文 embedding 的非确定性

**现象**：相同中文文本多次生成 embedding，结果不一致

**测试结果**：

| 文本 | 第一次生成 | 第二次生成 | 是否一致 |
|------|-----------|-----------|---------|
| 英文 "hello" | `[0.123, 0.456, ...]` | `[0.123, 0.456, ...]` | ✓ 一致 |
| 中文 "用户最喜欢" | `[0.014, 0.076, ...]` | `[0.020, 0.078, ...]` | ✗ 不一致 |

**影响**：
- 中文文本的向量相似度搜索不可靠
- 无法精确匹配相同内容的记忆
- 相似度分数不稳定

**根本原因**：
`transformers.js` 的中文分词器存在非确定性，可能是 tokenizer 实现的已知限制。

**当前策略**：
- 专注于英文记忆的优化和测试
- 中文功能作为可选特性，接受现有限制

**未来方案**（如需支持中文）：
1. 使用外部 embedding API（OpenAI、Cohere 等）
2. 尝试其他本地模型（如支持中文的 BERT 系列）
3. 等待 transformers.js 修复 tokenizer 问题

---

## 技术实现要点

### 查询接口选择

**MATCH 操作符的问题**：
```sql
-- ❌ 使用 MATCH 时难以添加额外的 WHERE 条件
SELECT * FROM vec_memories WHERE embedding MATCH ? AND k = 5
```

**推荐方案：使用 `vec_distance_cosine` 函数**
```sql
-- ✅ 灵活添加各种过滤条件
SELECT
  m.*,
  vec_distance_cosine(v.embedding, ?) as distance
FROM vec_memories v
INNER JOIN memories m ON v.memory_id = m.id
WHERE m.chat_id = ?           -- 可添加聊天过滤
  AND m.timestamp >= ?        -- 可添加时间范围
  AND m.id NOT IN (?, ?)      -- 可排除特定 ID
ORDER BY distance ASC
LIMIT ?
```

### 余弦距离 vs 相似度

sqlite-vec 返回的是**余弦距离**（distance），而非相似度（similarity）：

```
distance = 1 - similarity
```

**对应关系**：
- distance = 0.0 → similarity = 1.0（完全相同）
- distance = 0.5 → similarity = 0.5（中等相似）
- distance = 1.0 → similarity = 0.0（完全不相似）

**转换代码**：
```typescript
const results = rows.map((row, index) => ({
  entry: rowToEntry(row),
  similarity: 1 - row.distance,  // distance → similarity
  rank: index + 1
}))
```

---

## 当前状态

### 已完成
- ✅ 向量存储格式正确（Float32Array → Buffer）
- ✅ 向量检索正确（Buffer → Float32Array）
- ✅ 使用 `vec_distance_cosine` 实现灵活搜索
- ✅ 英文 embedding 稳定且可重复
- ✅ 完全匹配返回 similarity = 1.0

### 已知限制
- ⚠️ 中文 embedding 存在非确定性（transformers.js 限制）
- ⚠️ 跨语言相似度较低（预期行为，不同语言语义空间不同）

### 推荐使用场景
- 英文对话记忆：完全可用
- 中文对话记忆：功能可用但精确度受限
- 代码片段记忆：推荐使用（英文/技术术语为主）

---

## 关键文件

- `src/main/services/memory/MemoryService.ts` - 记忆存储和检索服务
- `src/main/services/embedding/EmbeddingService.ts` - Embedding 生成服务
- `src/renderer/src/constant/prompts.ts` - LLM 使用记忆工具的指导

---

## 参考资料

- [sqlite-vec 官方文档](https://github.com/asg017/sqlite-vec)
- [transformers.js 文档](https://huggingface.co/docs/transformers.js)
- [all-MiniLM-L6-v2 模型](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
