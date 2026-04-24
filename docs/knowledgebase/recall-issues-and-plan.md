# Knowledgebase Recall Issues And Plan

## 背景

当前知识库已经支持本地目录索引、向量检索、设置页搜索测试，以及对话前的基础 RAG 注入。

在实际测试里，基于目录 `/Users/gnl/Workspace/code/notes` 构建索引后，搜索 `分布式锁` 时，前排结果出现了与目标主题关联较弱的文档，例如：

- `/Users/gnl/Workspace/code/notes/devops/Docker/docker.html`

这说明当前召回链路已经可用，相关性排序还需要进一步增强。

## 当前问题

### 1. 检索排序偏向纯向量

当前搜索主要依赖向量相似度，再叠加很轻的文件名加分。

这个排序方式对“语义接近但关键词没有直接命中”的长文档比较宽容，容易把主题宽泛、覆盖面大的内容抬到前面。

### 2. HTML 原文直接入库

`.html` 文件索引时保留了大量结构性文本、导航文本和页面噪声。

这类内容会放大向量语义上的“泛匹配”，降低精确主题查询时的稳定性。

### 3. 启动阶段自动索引影响可用性

知识库在应用启动时执行自动 `reindex`，会在启动阶段消耗较多 CPU。

当 source 较大时，这会影响主界面响应速度和整体可用性。

## 已确认的产品决策

- 知识库索引不在应用启动阶段自动执行
- 索引动作由用户手动触发
- 设置页保留直接搜索输入框，作为召回调试入口
- 不保留固定 query 的测试按钮
- Source 管理区域提供就近的 `Build Index` 入口

## 近期已落地优化

### 1. Embedding 批次调优

知识库 `rebuild` 的主要耗时集中在 embedding 阶段，本地 ONNX 推理的内存压力也集中出现在这里。

当前批处理参数已经收敛为：

- `embeddingBatchSize = 24`
- `embeddingBatchCharBudget = 12000`

这组参数覆盖了三层调用边界：

- `KnowledgebaseService` 的全局 reindex 参数
- `KnowledgebaseIndexingPipeline` 的公共批处理策略
- `EmbeddingService` 的安全批次上限

当前批处理逻辑按两个约束切批：

- 每批最多 `24` 个 chunk
- 每批累计文本长度最多 `12000` 字符

这个策略直接服务两个目标：

- 控制单次 ONNX 推理的内存峰值
- 维持较稳定的吞吐

实测数据表明，`24` 是当前语料和当前机器上的更优参数点：

- `batch=16` 时，`embeddingDurationMs` 约 `127s`
- `batch=24` 时，`embeddingDurationMs` 约 `117s`
- `batch=32` 时，`embeddingDurationMs` 约 `124s`

长文本会优先触发 `12000` 字符预算，所以实际执行批次通常落在 `11-14 embeddings / batch`。这也是 `24` 和 `32` 的效果接近、`24` 更稳定的原因。

### 2. Rebuild 分阶段耗时日志

当前 `rebuild` 已经拆成三个阶段记录耗时：

- `reindex.chunking_completed`
- `reindex.embedding_completed`
- `reindex.db_save_completed`

最终汇总日志 `reindex.completed` 会输出：

- `chunkingDurationMs`
- `embeddingDurationMs`
- `dbSaveDurationMs`

现有日志已经确认瓶颈集中在 `embeddingDurationMs`，`chunking` 和 `db save` 通常只有几百毫秒。

### 3. Embedding Cache

在批次参数稳定后，下一层优化集中在 embedding 复用。

当前已经增加 `knowledgebase_embedding_cache` 表，用于缓存 chunk 对应的 embedding 结果。缓存 key 由三个字段共同决定：

- `model`
- `strategyVersion`
- `chunkHash`

具体生成逻辑是：

- `cacheKey = sha256(model + strategyVersion + chunkHash)`

这组字段保证了以下一致性：

- 模型变化会生成新的缓存空间
- chunking / indexing 策略升级会生成新的缓存空间
- 文本内容变化会生成新的缓存空间

缓存表保存以下核心数据：

- `cache_key`
- `model`
- `strategy_version`
- `chunk_hash`
- `embedding`
- `dimensions`
- `created_at`
- `last_used_at`

### 4. Rebuild 中的 Cache 命中流程

当前 rebuild 的 embedding 流程已经切换为：

1. 先为所有 chunk 生成 `cacheKey`
2. 批量读取 `knowledgebase_embedding_cache`
3. 命中的 chunk 直接复用缓存向量
4. 未命中的 chunk 进入批量 embedding
5. 新生成的 embedding 回写到 cache

这个流程把相同内容的重复 rebuild 从“重复推理”切到了“直接复用”。

### 5. Cache 观测日志

`reindex.embedding_completed` 现在会输出以下 cache 观测字段：

- `cacheHits`
- `cacheMisses`
- `cacheHitRate`
- `cacheWrites`
- `batchCount`

`reindex.completed` 也会汇总输出：

- `embeddingCacheHits`
- `embeddingCacheMisses`
- `embeddingCacheHitRate`

这些字段可以直接用于判断：

- 当前 rebuild 是首次建缓存，还是命中缓存
- embedding 时间花在模型推理，还是主要走缓存复用

### 6. Cache 实测效果

`2026-04-23` 的两次连续 rebuild 已经验证了 cache 的效果：

- 第一次 rebuild：`embeddingDurationMs = 116743`，`cacheHits = 0`，`cacheMisses = 2257`，`cacheHitRate = 0`
- 第二次 rebuild：`embeddingDurationMs = 56`，`cacheHits = 2257`，`cacheMisses = 0`，`cacheHitRate = 1`

这组数据说明，相同内容的第二次 rebuild 已经可以把 embedding 阶段从百秒级压缩到毫秒级。

## 后续优化方向

### 1. 索引文本清洗

- `.html` / `.xml` 在入库前提取可读正文
- 去掉 `script`、`style`、注释、标签噪声
- 保留标题、段落、列表、代码块等可检索内容

### 2. 混合召回与重排

- 保留向量召回作为第一阶段候选集
- 增加 query 精确短语命中加分
- 增加 query term 覆盖率加分
- 增加文件路径与文件名命中加分
- 对低词面证据的 `.html` / `.xml` 结果增加轻量惩罚

### 3. 搜索测试体验增强

- 在设置页展示更稳定的 `score / similarity / file path / chunk text`
- 后续可以增加 folder/ext 过滤
- 后续可以增加 query 命中高亮

## 实施顺序

1. 先修正启动期自动索引行为，保证应用可用性
2. 再收敛设置页交互，保留输入式搜索测试
3. 已完成 embedding 批次调优与分阶段耗时日志
4. 已完成 embedding cache
5. 然后推进索引文本清洗
6. 最后推进混合召回和重排参数调优
