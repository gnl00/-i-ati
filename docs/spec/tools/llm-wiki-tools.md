# LLM Wiki Tools

## 背景

LLM wiki tools 提供一组 agent 可调用的本地 wiki 工具，让模型能创建、更新、读取、删除和检索稳定知识条目。当前未提交实现已经接入 shared tool definitions、metadata 和 main tool handler，processor 行为仍处在收口阶段。

外部 LLM-Wiki 方向的核心价值是 agent-native knowledge base：内容以可读页面保存，模型通过搜索定位条目，通过读取获得完整上下文，通过结构化元数据和链接继续探索。当前实现第一阶段聚焦本地 Markdown wiki 和现有 knowledgebase 检索能力的稳定结合。

## Prompt Trigger Policy

System prompt guidance stays concise and routes by knowledge boundary:

- `memory_retrieval` / `memory_save`: long-term user preferences, stable facts, cross-chat decisions, and user-confirmed constraints.
- `wiki_list` / `wiki_read` / `wiki_search`: local wiki pages, project knowledge entries, implementation notes, technical plans, and durable readable docs. Wiki-specific recall prefers `wiki_search`.
- `wiki_write`: when the user asks to save into wiki, or when an output becomes stable project knowledge, technical direction, spec, runbook, or reusable decision record.
- `knowledgebase_search`: configured local folders, docs, code, and notes when the target spans broader local context.
- `history_search`: raw chat titles, message content, and cross-chat keyword lookup.
- `activity_journal_search`: recent completed work, decisions, blockers, milestones, and completion summaries.

## 需求

第一版目标：

1. 提供 `wiki_list`、`wiki_read`、`wiki_write`、`wiki_delete`、`wiki_search` 五个 embedded tools。
2. wiki 条目以 Markdown 文件保存，每个条目带 YAML frontmatter。
3. 读写路径限定在 wiki root 内，工具参数无法逃逸到其他目录。
4. `wiki_write` 支持 `mode` 控制写入语义，并在创建、更新、追加和覆盖时维护 `created`、`updated`、`title`、`type`、`tags`、`source` 等基础元数据。
5. `wiki_list` 返回适合模型浏览的轻量目录信息和正文摘要。
6. wiki root 维护一个自动生成的 `README.md` 索引块，保存 entry path 到 summary 的映射。
7. `wiki_list` 优先读取 `README.md` 索引块；索引缺失或损坏时扫描 wiki 文档并返回 `index_source: 'scan'`。
8. `wiki_search` 返回 wiki root 内的相关条目片段，并保证写入后的检索结果具备可解释的新鲜度策略。
9. 写入和删除类工具走统一的工具确认策略，危险操作可以被用户审核。
10. 每个关键行为有 processor 单元测试覆盖，工具定义、metadata 和 handler 注册继续沿用现有对齐测试。

## 技术方向

### 存储边界

wiki 文件落在固定 wiki root 下。处理器统一走 `resolveWikiEntryPath(name)` 之类的入口完成：

- name trim 和扩展名归一化。
- slug 或受控子路径校验。
- `path.resolve` 生成绝对路径。
- root containment 校验。
- 读、写、删 entry sink 前对已存在的父目录和目标 leaf 做 `lstat`/`realpath` 校验；root 内 symlink entry 或 symlink parent 会被拒绝。
- 写入前创建 root 目录。

第一版采用受控子路径：拒绝绝对路径、`..`、隐藏路径段和危险文件名字符，自动补 `.md`。常规写法使用 `folder/entry-name` 或 `entry-name`。

### 一致性边界

wiki 工具有三个明确层级：

- Markdown entry 是内容源头。`wiki_write` 和 `wiki_delete` 成功返回前必须完成 entry 文件写入或删除。
- root `README.md` managed index 是目录和摘要源头。写入、追加、覆盖、删除成功返回前必须同步更新对应 row 和 checksum。
- knowledgebase/vector index 是派生搜索缓存。写入和删除只调度 wiki root refresh，工具响应通过 `index_status` 和 `index_message` 暴露当前缓存状态。

`wiki_search` 保持只读语义。README managed block 损坏、缺失或 checksum 失配时，search 可以扫描 entry 文件构造内存候选，并保持现有 README 文件内容原样；修复 README 的入口是后续 mutation 的 README 维护路径。

### Frontmatter

使用现有 `yaml` 依赖解析和序列化 frontmatter。processor 维护一个内部 `WikiEntryMetadata` 形态：

- `title: string`
- `type: string`
- `tags: string[]`
- `created: string`
- `updated: string`
- `source: string`

写入策略：

1. 新文件生成默认 metadata。
2. 已有文件保留原 `created`。
3. 每次写入更新 `updated`。
4. 用户提供 frontmatter 时保留可识别字段，并补齐缺失字段。
5. 正文保持 Markdown 原文，末尾保留单个换行。

### `wiki_write.mode`

`wiki_write` 参数包含可选 `mode?: 'upsert' | 'create' | 'append' | 'replace'`，默认值是 `upsert`。

四种模式：

- `upsert`: 默认模式。目标文件缺失时创建，目标文件存在时整体更新正文和可识别 metadata。已有文件的 `created` 保留，`updated` 刷新为当前日期。
- `create`: 只创建新条目。目标文件存在时返回失败，并保持原文件、README checksum 和 knowledgebase index 状态。
- `append`: 只追加正文。目标文件缺失时返回失败。工具会解析 input content，丢弃 input frontmatter，只把 input body 追加到现有 body 末尾；追加前插入两个换行，保持 Markdown 段落边界。现有 frontmatter 中的 `title`、`type`、`tags`、`created`、`source` 和扩展字段保持原值，只刷新 `updated`。input body trim 后为空时返回失败，并保持原文件、README checksum 和 knowledgebase index 状态。
- `replace`: 明确整体覆盖目标内容。目标文件缺失时创建；目标文件存在时使用 input content 的正文和可识别 metadata 覆盖原正文和 metadata，同时沿用当前整体写入策略保留原 `created`，并刷新 `updated`。

成功写入后的共同规则：

1. `create`、`upsert`、`replace`、`append` 都更新 README managed index row 和 checksum。
2. `append` 的 README `Summary` 基于追加后的完整 body 的首个非空行生成，因此常规追加会继续显示原正文摘要。
3. 成功写入后调度 wiki root knowledgebase refresh，并把调度器状态写入工具响应。

### Wiki Index README

wiki root 下维护一个 `README.md` 作为人类和模型都能读取的目录入口。该文件由工具维护一个 managed block：

```md
# Wiki Index

<!-- ati-wiki-index:start -->
<!-- ati-wiki-index:checksum=v1:sha256:<hex> -->
| Entry | Title | Type | Tags | Created | Updated | Source | Summary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| file1 | File 1 | note | release, wiki | 2026-06-29 | 2026-06-29 | user | summary1 |
| folder/file2 | File 2 | guide | imported | 2026-06-28 | 2026-06-29 | import | summary2 |
<!-- ati-wiki-index:end -->
```

managed table 字段和 `WikiEntry` 对齐：

- `Entry`: wiki name，使用不带 `.md` 的相对 entry 名，例如 `file1`、`folder/file2`。
- `Title`: frontmatter `title`，缺省使用 entry name。
- `Type`: frontmatter `type`，缺省为 `note`。
- `Tags`: 逗号分隔 tags，parse 和 render 使用同一格式；空 tags 渲染为空单元格。
- `Created`: frontmatter `created` 日期字符串。
- `Updated`: frontmatter `updated` 日期字符串。
- `Source`: frontmatter `source`，缺省为 `user`。
- `Summary`: entry 正文 body 的首个非空行，截断到 120 字符。

checksum comment 放在 start marker 后、Markdown table 前，格式固定为：

```md
<!-- ati-wiki-index:checksum=v1:sha256:<hex> -->
```

checksum 输入是规范化后的 entry 投影：

- 字段只包含 `name`、`title`、`type`、`updated`、`summary`。
- `tags`、`created`、`source` 只作为 table 展示字段，变化不影响 checksum。
- entries 按 `name` 升序排序后参与计算。
- 字符串字段先 trim。
- 对投影结果 `JSON.stringify` 后用 Node 内置 `crypto` 计算 `sha256`，写入小写 hex。

索引规则：

1. `wiki_write` 成功写入 entry 后更新 `README.md` 中对应条目。
2. `wiki_delete` 成功删除 entry 后移除 `README.md` 中对应条目。
3. summary 使用 entry 正文 body 的首个非空行，截断到 120 字符。
4. `README.md` 的 managed block 由工具全权维护，文件中 block 外内容保留。
5. entry 扫描排除 root `README.md`，root `README.md` entry name 按大小写不敏感规则保留。
6. `README.md` 缺失、managed block 缺失、checksum 缺失、checksum 格式错误、checksum 和 table 内容不匹配、表格解析失败、索引项引用的文件缺失时，`wiki_list` 扫描 `.md` entry，返回 `index_source: 'scan'` 和 repair 提示，并保持 README 文件内容原样。
7. `wiki_write`、`wiki_delete` 和显式 rebuild 路径写 README managed block 时按 wiki root 串行化 read-modify-write，避免同 root 并发 mutation 覆盖彼此的索引更新。

README index 操作：

- `parseReadmeIndex`: 定位 `<!-- ati-wiki-index:start -->` 和 `<!-- ati-wiki-index:end -->`，读取 checksum comment，解析中间 Markdown table，校验 8 个表头字段和分隔行，把每行转成 `WikiEntry`，再重新计算 checksum。
- `renderReadmeIndexBlock`: 按 `Entry, Title, Type, Tags, Created, Updated, Source, Summary` 顺序渲染 Markdown table，对 table cell 内的换行和 `|` 做转义，并写入当前 checksum comment。
- `upsertReadmeIndexEntry`: `wiki_write` 写入文件后从最终文件内容生成 `WikiEntry`，在 root 级索引锁内读取当前 README index，写入或替换同名 entry，再渲染带新 checksum 的 managed block。
- `removeReadmeIndexEntry`: `wiki_delete` 删除文件后在 root 级索引锁内读取当前 README index，移除同名 entry，再渲染带新 checksum 的 managed block。
- mutation fallback rebuild: `wiki_write` / `wiki_delete` 在当前 README index 无法解析时扫描 wiki root 下 `.md` 文件，跳过 root `README.md`，从 frontmatter 和 body 重建全部 `WikiEntry`，再替换或追加 managed block，并复用 root 级索引锁。

`wiki_list` 流程：

1. 读取 wiki root `README.md`。
2. 解析 managed block 里的 Markdown table。
3. 读取 checksum comment，并基于解析出的 table entries 重新计算 checksum。
4. 校验每个 `Entry` 对应的 `.md` 文件存在。
5. 返回 README index 中的 `WikiEntry[]`。
6. README 缺失、managed block 缺失、checksum 缺失、checksum 格式错误、checksum 不匹配、表格解析失败、引用文件缺失时，扫描 wiki root 下 `.md` entries，返回 `index_source: 'scan'`、扫描得到的 `WikiEntry[]` 和 repair 提示。

这样日常 `wiki_list` 的主要内容读取 I/O 是读取一个索引文件；异常回退也是只读扫描。写入、更新、删除承担索引维护成本。

### Search

`wiki_search` 复用 knowledgebaseService 的向量检索能力，并把查询范围固定到 wiki root 和 `.md` 扩展。schema 对齐 `knowledgebase_search` 的双 query 设计：

- `query`
- `localized_query`
- `top_k`
- `threshold`

检索流程：

1. 校验 `query` 和 `localized_query`。
2. 读取 wiki root `README.md` managed index。索引损坏或缺失时扫描 wiki entries 构造内存候选，保持 `wiki_search` 只读语义。
3. 基于 README index 的 `name`、`title`、`type`、`tags`、`summary` 生成 entry 级 lexical candidates。
4. 收集 `query` 和 `localized_query` 的非空去重候选。
5. 每个候选调用 `knowledgebaseService.search`，查询范围固定为 wiki root 和 `.md`。
6. 将 vector chunk result 映射回 wiki entry，并补充 README metadata；root `README.md` vector chunk 从 wiki entry 结果中过滤。
7. 使用 deterministic ranking 合并 vector score 和 README lexical boost。
8. vector 结果为空或缺少 README 命中的 entry 时，返回 README fallback result，提示后续可调用 `wiki_read` 获取完整页面。
9. 返回统一的 search response。

`wiki_search` response 返回 wiki-native results。每个 result 面向 wiki entry 摘要和后续读取动作，底层 knowledgebase chunk 字段已在 processor 内裁剪。

- `entry_name`: wiki entry name。
- `title`: README index title。
- `summary`: README index summary。
- `text`: 命中的正文片段，README fallback 使用轻量说明并提示 `wiki_read`。
- `score`: 合并后的排序分数。
- `similarity`: 向量相似度；README fallback 为 `0`。
- `match_source`: `vector`、`readme` 或 `hybrid`。
- `match_reason`: 简短解释命中来源，例如 title、entry name、summary 或 vector chunk。

result contract 不暴露 `chunk_id`、`document_id`、`file_path`、`folder_path`、`ext`、`chunk_index`、`char_start`、`char_end`、`token_estimate` 等 knowledgebase chunk 字段。完整页面上下文通过 `wiki_read` 获取。

当前阶段使用业务逻辑层 ranking：README lexical candidate 负责把正确 entry 拉入候选集，knowledgebase vector result 负责正文 chunk grounding。reranker 模型作为后续可插拔排序层，适合在候选集稳定且 top results 排序质量成为主要问题时接入。

索引新鲜度策略：

1. `wiki_write` 和 `wiki_delete` 成功完成 entry/README 更新后，把 wiki root 标记为 dirty generation。
2. 每个 wiki root 维护独立 refresh scheduler，跟踪 `writtenGeneration`、`runningGeneration`、`indexedGeneration`。
3. scheduler 使用短 debounce 合并 burst mutations，并在 debounce 后调用 `knowledgebaseService.reindex`。
4. routine refresh 使用 `force: false` 和 wiki root `configOverride`，依赖 knowledgebase indexing pipeline 跳过未变化文档。
5. mutation 发生在 active refresh 期间时，scheduler 保持最新 generation dirty，并在 active job settled 后自动调度一次 follow-up refresh。
6. reindex 抛错时 entry/README 成功状态保留，scheduler 状态变为 `stale`，`index_message` 保留失败原因。
7. `wiki_write`、`wiki_delete` 和 `wiki_search` 都返回当前 `index_status`：`queued`、`running`、`fresh`、`stale` 或 `unknown`。
8. response 避免把 queued/running mutation 报告为 fresh；最新 dirty generation indexed 后才返回 fresh。
9. scheduler 在 knowledgebase service 已有 active job 时先 join 当前 job，再执行一次 wiki root refresh，覆盖 queued mutation 的最新 generation。
10. `wiki_search` 在结果为空时给出可执行提示，指明当前 wiki 索引可能需要重建。

### Renderer Summary

`ToolCallResult` 为 wiki tools 提供专用 Summary 展示，Detail 继续显示完整 JSON payload：

- `wiki_list`: 展示 entry count，以及最多前三个 entry 的 name/title/summary。
- `wiki_read`: 展示 title/name 和 content preview。
- `wiki_write` / `wiki_delete`: 展示 success/failure、entry name 或 title、`index_status` 和 `index_message`。
- `wiki_search`: 展示 total hits、query、最多前三个 result 的 title/name/summary、`match_source`、`match_reason`，以及 index 状态。

Summary 内容来自工具结果本身，用于让 UI 摘要直接表达 wiki 工具输出。

### Confirmation

工具确认由 metadata 驱动。`embeddedToolMetadata` 已包含 `riskLevel` 和 `mutatesWorkspace`，执行器应统一使用该信息决定确认需求。

建议策略：

- `riskLevel: dangerous` 触发确认。
- `mutatesWorkspace: true` 触发确认。
- `plan_create` 保留既有自动审批开关。
- `execute_command` 保留现有命令确认行为。

这样 `wiki_write` 和 `wiki_delete` 可以进入通用写操作审核路径，后续新工具也能复用同一规则。

## 技术方案

### 代码改动

1. `src/main/tools/wiki/WikiToolsProcessor.ts`
   - 增加安全路径解析。
   - 改用 YAML frontmatter parser。
   - 修复 summary 生成。
   - 维护 wiki root `README.md` managed index table block。
   - `wiki_list` 优先读取 `README.md` 索引表，索引异常时只读扫描并返回 repair 提示。
   - 修复 search 查询融合。
   - 写入和删除后调度 wiki root refresh。

2. `src/shared/tools/wiki/definitions.ts`
   - 给 `wiki_search` 增加 `localized_query` 和 `threshold`。
   - 收紧 `name` 字段描述。

3. `src/shared/tools/wiki/index.d.ts`
   - 补齐 search 参数类型。
   - 补齐 `queued` 和 `running` index 状态。
   - `wiki_search` result 改为 wiki-native shape，只暴露 entry 级字段、正文片段、分数和匹配解释。

4. `src/renderer/src/components/chat/chatMessage/assistant-message/toolcall/ToolCallResult.tsx`
   - 为 `wiki_list`、`wiki_read`、`wiki_write`、`wiki_delete`、`wiki_search` 增加专用 Summary。
   - Detail 保留完整 JSON payload。

5. `src/main/agent/tools/ToolExecutor.ts`
   - 引入 metadata-driven confirmation 判断。
   - 保留现有 plan 和 command 特殊行为。

6. Tests
   - 新增 `src/main/tools/wiki/__tests__/WikiToolsProcessor.test.ts`。
   - 覆盖 `README.md` 索引创建、更新、删除同步、README 优先读取、索引损坏和缺失回退重建、managed block 外内容保留。
   - 覆盖 scheduled refresh coalescing、active refresh follow-up、stale 状态保留、search index 状态透传、root README vector result 过滤。
   - 更新 ToolExecutor confirmation 相关测试。
   - 继续运行 shared definitions、metadata、embedded registration 对齐测试。

### 验收

目标命令：

```bash
pnpm exec vitest run \
  src/main/tools/wiki/__tests__/WikiToolsProcessor.test.ts \
  src/main/agent/tools/__tests__/ToolExecutor.test.ts \
  src/shared/tools/__tests__/definitions.test.ts \
  src/shared/tools/__tests__/metadata.test.ts \
  src/main/tools/__tests__/embeddedToolsRegistration.test.ts
```

扩大验证：

```bash
pnpm run typecheck:node
```

当前仓库存在 `src/shared/task-planner/schemas.ts` 缺 `zod` 类型依赖的独立 typecheck 风险。wiki 改动验收需要至少清除 wiki 自身 TypeScript 错误，并把独立失败记录在最终结果中。

README index 测试验收：

- `wiki_write` 创建 entry 后生成 root `README.md`，managed block 内含完整表头和对应 entry row。
- README managed block 在 start marker 后、table 前包含 `<!-- ati-wiki-index:checksum=v1:sha256:<hex> -->`。
- checksum 输入只覆盖 `name`、`title`、`type`、`updated`、`summary`；`tags`、`created`、`source` 变化仍可使用 README index。
- checksum 缺失、格式错误或与 table 内容不匹配时，`wiki_list` 扫描 `.md` entries，返回 `index_source: 'scan'`，并保持 README 原样。
- `wiki_write` 更新已有 entry 后同步 row 的 `Summary` 和 `Updated`。
- `wiki_delete` 删除 entry 后同步移除 row。
- `wiki_write` 和 `wiki_delete` 后写入新的 checksum。
- `wiki_write` 默认 `upsert` 行为保持创建或整体更新。
- `wiki_write` `create` 模式在目标存在时失败，并保持文件、README checksum 和 reindex 调用状态。
- `wiki_write` `create` 模式可创建新条目，同步 README checksum，并返回 queued/running/fresh/stale/unknown index 状态。
- `wiki_write` `append` 模式在目标缺失或 input body 为空时失败，并保持文件、README checksum 和 reindex 调用状态。
- `wiki_write` `append` 模式只追加 input body，保留原 metadata，刷新 `updated`，README summary 使用追加后完整 body 的首个非空行。
- `wiki_write` `replace` 模式覆盖正文和 metadata，目标缺失时创建，目标存在时保留原 `created` 并刷新 `updated`。
- `wiki_list` 在 README index 有效时从 README 返回 `WikiEntry[]`，主路径避免读取 entry 文件内容。
- README 缺失或表格损坏时，扫描 wiki root 下 `.md` entries，保持 README 和 root durable files 原样。
- managed block 外的 README 手写内容在 upsert、remove、rebuild 后保留。
- 同 root 并发 `wiki_write`、`wiki_delete` 后，README managed block 保留全部应保留 entries，checksum 有效，`wiki_list` 可从 README 返回可信目录。
- root `README.md` 的 vector chunk 在 wiki_search 合并前过滤。
- `wiki_search` result shape 为 wiki-native，包含 `entry_name`、`title`、`summary`、`text`、`score`、`similarity`、`match_source`、`match_reason`，并裁掉底层 knowledgebase chunk 字段。
- `ToolCallResult` Summary 能展示 `wiki_list`、`wiki_read`、`wiki_write`、`wiki_delete`、`wiki_search` 的结果摘要，Detail 保留完整 JSON。
- burst `wiki_write`/`wiki_delete` 在同一 wiki root 内合并为一次 scheduled incremental reindex。
- knowledgebase service 已有 active job 时，wiki scheduler join 当前 job 后再执行 wiki root refresh。
- active refresh 期间发生 mutation 时，active job settled 后自动执行 follow-up refresh。
- reindex 失败时，entry/README 成功状态保留，后续 `wiki_search` 报告 stale index 状态和失败原因。

## 实施顺序

1. 完成 wiki processor 和 tests。
2. 完成搜索索引策略。
3. 完成 metadata-driven confirmation。
4. 运行目标测试。
5. 运行 node typecheck，记录独立阻塞项。
