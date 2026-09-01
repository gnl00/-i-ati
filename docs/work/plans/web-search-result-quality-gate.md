# Web Search 结果质量门禁优化实现指导

## 状态

- 日期：2026-09-01
- 范围：`web_search` 搜索页识别、结果质量判定、失败诊断与回归测试
- 交付形态：单阶段修复，可独立合并和回滚

## 问题与证据

2026-09-01 10:44 的两次 Bing 请求均完成页面加载、DOM 结果提取和内容抓取，最终返回了与 Time Machine 无关的时间网站：

- 中文查询：`Time Machine 备份磁盘 必须比 内置硬盘 大吗 要求 官方`
- 英文查询：`Time Machine backup disk must be at least as large as startup disk Apple requirement`
- 页面快照正文仅包含“隐私 条款”
- 提取结果集中出现 `timeanddate.com`、`time.is`、`time.gov`
- 主链记录 `results_extracted count=5` 与 `web_search.completed`
- 工具结果对外标记为 `success: true`

该故障属于搜索结果语义失败。网络请求、页面导航和 DOM 提取均完成，结果内容无法回答原查询。

同日 Google 搜索还出现独立故障：请求跳转至 `google.com/sorry` 的 unusual-traffic 验证页，Electron 导航返回 `ERR_ABORTED (-3)`。现有 Google 页面分类已覆盖加载成功后的验证页，导航抛错路径仍保留原始错误诊断。

## 根因

`WebToolsProcessor.processWebSearch()` 目前将三个条件视为搜索成功：

1. 搜索页 `loadURL()` 完成；
2. 页面存在引擎定义声明的结果容器；
3. DOM 提取返回任意数量的结果。

Bing 主链缺少异常页分类，提取完成后也缺少查询相关性门禁。因此，Bing 降级页面或低质量结果页仍会进入抓取阶段，并以 `success: true` 返回。

## 目标

1. 识别 Bing 的异常、隐私、验证或降级页面。
2. 在抓取内容前拒绝明显与查询无关的结果集合。
3. 为页面异常与低相关性结果提供可区分的日志和错误消息。
4. 保持现有工具输入、输出类型、IPC、配置和正常搜索流程兼容。
5. 用聚焦回归测试锁定本次两条 Time Machine 查询的失败形态。

## 范围

### 实现范围

- `src/main/tools/webTools/WebToolsProcessor.ts`
  - 搜索页有效性判断
  - 结果集合质量判定
  - 失败返回与结构化日志
- `src/main/tools/webTools/search-engine/`
  - 仅在引擎定义确实需要承载页面判定信息时调整
- `src/main/tools/webTools/__tests__/`
  - 页面异常、结果相关性、正常搜索与既有 Google 分支回归

### 文档范围

- 本文记录决策、验收条件、测试矩阵和回滚方式。
- 现有性能指南继续描述窗口池与抓取性能，本次修复不改变性能架构。

## 设计

### 处理流程

```text
构造搜索 URL
  -> 加载并捕获页面快照
  -> 引擎页面有效性检查
  -> 等待并提取搜索结果
  -> 结果集合质量门禁
  -> snippetsOnly 直接返回 / 抓取内容页
  -> 返回成功结果
```

### 页面有效性检查

页面检查使用已有的 `PageSnapshot`，依据最终 URL、标题和正文预览识别明确异常信号。Bing 至少覆盖：

- 验证或 CAPTCHA 页面；
- consent、privacy、terms 等仅包含控制面内容的页面；
- 搜索 URL 正常、正文缺少可用搜索内容的降级页面。

门禁应采用明确异常信号，避免把正常搜索页中页脚的“隐私”“条款”文字单独作为失败依据。组合条件应包含正文信息量、异常标题或异常 URL 等至少一个强信号。

### 结果集合质量门禁

质量门禁使用查询文本以及已提取的标题、摘要和链接进行保守判定：

- 对查询和结果文本做轻量归一化；
- 使用有意义的英文单词、数字和连续中文片段作为查询信号；
- 忽略常见低信息词；
- 只在整个结果集合缺少任何有效交集时判为失败；
- 查询过短或缺少可用词元时跳过相关性判定，让现有搜索行为继续工作。

本次实现无需搜索排名模型、分词依赖、站点黑名单、缓存或可调阈值。门禁解决“整组结果明显跑题”的故障，搜索质量排序仍由搜索引擎负责。

### 失败语义与日志

页面异常和结果低相关性均返回现有 `WebSearchResponse` 失败形态：

```json
{
  "success": false,
  "results": [],
  "error": "可诊断的稳定错误消息"
}
```

结构化日志分别记录：

- 引擎；
- 页面分类或质量门禁原因；
- 查询；
- 提取结果数量；
- 结果数量与匹配统计。

日志沿用当前安全边界，不记录页面完整正文、请求头、Cookie 或凭据。

## 关键决策

1. **门禁放在共享搜索主链。** IPC 与模型嵌入工具都会经过同一处理器，一处修复覆盖所有入口。
2. **先判页面，再判结果。** 页面异常提供直接原因；结果门禁覆盖搜索引擎确实返回垃圾结果的情况。
3. **整组零相关才失败。** 该标准保留长尾查询、品牌词、新术语与少量噪声结果。
4. **保持公开协议稳定。** 无需修改工具 schema、IPC 参数、数据库或配置。
5. **失败优先于伪成功。** 调用方可基于明确失败改用 `web_fetch` 或官方 URL，避免模型把垃圾内容当作证据。

## 测试矩阵

| 场景 | 预期 |
| --- | --- |
| Bing 页面仅含隐私/条款控制面信息 | 返回失败，日志标记页面异常 |
| 中文 Time Machine 查询返回时间网站集合 | 返回低相关性失败 |
| 英文 Time Machine 查询返回时间网站集合 | 返回低相关性失败 |
| 正常 Time Machine 查询包含 Apple Support 结果 | 通过门禁 |
| 合法短查询或缺少可用词元 | 沿用既有结果处理 |
| 结果中部分噪声、至少一条明确相关 | 通过门禁 |
| Google 正常结果页 | 沿用既有流程 |
| Google anti-bot / consent | 沿用现有验证或降级行为 |

## 验证命令

```bash
pnpm exec vitest run src/main/tools/webTools/__tests__/webToolsUnits.test.ts
pnpm exec vitest run src/main/tools/webTools/__tests__/WebToolsProcessor.test.ts
pnpm run typecheck:node
```

若仓库中没有独立的 `WebToolsProcessor.test.ts`，处理器回归用例放入现有最近测试文件，并运行对应路径。

## 验收标准

- 两条 Time Machine 垃圾结果夹具均返回失败。
- 至少一个 Apple Support 正常结果夹具返回成功。
- 失败日志能区分页面异常与结果低相关性。
- `web_search` 的公开参数、返回类型和正常结果结构保持兼容。
- 聚焦测试和 Node 类型检查通过。
- 最终 diff 仅包含本文、搜索实现和相关测试。

## 风险与控制

主要风险是相关性门禁误伤模糊、跨语言或极短查询。控制方式采用集合级零相关判定，并对缺少可靠词元的查询放行。运行日志保留匹配统计，便于后续根据真实误判调整。

本方案假设垃圾结果集合与查询之间缺少任何稳定词元交集。若搜索引擎返回包含查询词的广告或 SEO 污染页，当前门禁会放行；该情形需要来源信誉或内容证据评分，属于后续独立优化。

## 回滚

本次变更不写入持久化数据；公开协议仅增加兼容的 `duckduckgo` 枚举值。回滚实现、类型与测试文件即可恢复原行为，文档可随实现一起撤回或移入归档。

## DuckDuckGo 显式搜索引擎补充

2026-09-01 使用 Computer Use 在当前 Chrome 网络环境中验证 DuckDuckGo：同一条 Time Machine 英文查询成功返回 Apple Support 官方结果、摘要和目标链接，页面未进入验证码或空壳状态。

本次将 `duckduckgo` 加入 `web_search.engine` 显式选项，并同步 Main 引擎注册、共享工具 schema、IPC 类型与公开声明。根据范围确认，Google/Bing 风控失败继续沿用现有行为，调用方可主动指定 `engine: "duckduckgo"` 使用独立搜索路径。

DuckDuckGo 提取器使用当前页面的结果卡片契约：

- 结果容器：`article[data-testid="result"]` 或 `[data-testid="result"]`
- 标题链接：`a[data-testid="result-title-a"]`
- 摘要：`[data-result="snippet"]` 或 `[data-testid="result-snippet"]`
- 跳转链接：解码 DuckDuckGo `/l/?uddg=...`，过滤站内导航链接

页面 DOM 属于外部服务契约。回归测试固定引擎注册、URL、选择器和跳转解码脚本；实际页面可达性由运行日志和 Computer Use 验证补充。
