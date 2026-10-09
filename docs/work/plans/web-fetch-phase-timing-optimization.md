# Web Fetch 后续优化与阶段耗时测量

Owner: Web tools maintainers<br>
Status: Active<br>
Started: 2026-10-09<br>
Updated: 2026-10-09<br>
Target: 用真实 Electron 数据确定下一步 fetch 优化范围<br>
Exit criteria: 完成阶段测量和对比，记录下一步优化的验收条件<br>
Related specs: [文档治理](../../specs/documentation-governance.md)<br>
Related implementation: [Processor](../../../src/main/tools/webTools/WebToolsProcessor.ts), [Tests](../../../src/main/tools/webTools/__tests__/WebToolsProcessor.test.ts)<br>
Related guide: [Web Search and Fetch](../../guides/development/web-search-and-fetch.md)

## 已确认的方向

网页统一通过 Electron 窗口加载后提取 DOM，再转 Markdown；直接文件继续走 HTTP。
搜索返回候选来源，全文读取由显式 web_fetch 承担。保留短正文、加载中和受阻页面的现有判定。
上一轮数据表明搜索发现更快，但网页读取增加了渲染和稳定等待时间，端到端收益取决于所读页面。

## 实施顺序

1. **阶段耗时诊断（本轮）**：复用结构化日志，测量排队、导航、稳定等待、DOM 获取、正文转换、内容物化和窗口释放；重跑样例确认瓶颈。
2. **稳定观察与导航重叠（待评估）**：若数据确认稳定等待占主要成本，再研究导航过程中开始观察正文。继续保留 900 ms 稳定要求，验证延迟 SPA、重定向和加载占位页。
3. **有证据的 DOM 噪声规则**：Copy 控件已有精确结构过滤。其他控件需先取得真实 DOM 与回归样例，保留正文和代码中的同名文本。
4. **多来源并行读取验证**：利用已有三个内容窗口，测量吞吐与排队；根据实测决定调用策略和资源上限。

第 1 项已实现；第 2 项已评估并保留现有生产等待逻辑；第 3 项已完成下文的控件清洗与运行验收。第 4 项已完成窗口池与实际 IPC 并发验收，Agent 批次的串行调用边界见下文。

## 日志契约

每次调用生成独立 fetchId，关联 web_fetch.started、web_fetch.completed 和 web_fetch.timings。
耗时使用单调时钟 performance.now()；最终摘要记录成功、失败原因、路由和返回类型。
工具响应结构保持原有形式，阶段字段只进入日志。

| 字段/阶段 | 测量范围 |
| --- | --- |
| durationMs | 调用开始到最终日志快照，含正常返回前的窗口释放 |
| queue | 获取内容窗口，含信号量排队和窗口准备 |
| navigation | loadURL 及下载识别等待，含页面子资源加载 |
| readiness | 导航后正文稳定观察；结果为 stable 或 deadline |
| domExtraction | 在渲染进程获取 HTML、标题、URL 和正文快照 |
| contentExtraction | DOM 清理、Markdown 转换及可用正文校验 |
| materialization | 内联预算、编码、工件描述及必要的写文件；不是纯磁盘写入时间 |
| release | 归还/回收内容窗口 |
| spoolAllocation / httpDownload / httpMaterialization / spoolCleanup | 直接文件与渲染后识别的下载路径；物化含格式处理和必要写文件，cleanup 仅失败路径 |

route 为 render、http 或 render-download；outputKind 为 inline 或 artifact。
phaseDurationsMs 只包含实际执行的阶段，缺失不表示零。
failedPhase 标记最近抛错的测量阶段；正文校验失败属于 contentExtraction。
超时或取消可能先返回、再完成异步清理；inFlightPhases 标记快照时仍执行的阶段，
对应耗时截取到返回时点，不能据此判断后台资源已经释放。释放行为另由既有测试验证。
阶段之间和日志本身有少量开销，阶段之和不要求与总耗时完全相等。

## 验证方法

自动测试验证成功路径的阶段边界、调用编号关联、导航/提取失败、排队超时和文件路由。
实际测试重启 pnpm dev，直接调用运行中应用的 web-fetch-action IPC。
对比已安装 1.2.2 和开发版：七个本地样例、三个公开网页各三次；开发版另发四个并发 SPA 请求。
保持已有缓存，不混用冷启动结论；记录实际总耗时、阶段日志、正文内容及工件哈希。
这是工具运行验证，模型选择来源、下一轮读取工件及提供商链路不在本轮测量中。

## 本轮实测

2026-10-09，重启开发版后完成 36 次实际 IPC 抓取：安装版 16 次、开发版 20 次。
两版均运行七个本地样例和三个公开网页各三次；开发版增加四个并发 SPA 请求。
公开 URL：`https://example.com`、`https://docs.python.org/3/library/asyncio-task.html`、
`https://www.electronjs.org/docs/latest/api/browser-window`。cleanMode 均为 full。
安装版为 1.2.2；开发版基于 65b90794，包含 Copy 控件过滤及本轮计时改动。
双方保留已有缓存，同机按开发版、安装版顺序执行，联网样本量较小。

各列为独立中位数，单位 ms，不能按行相加推导总耗时：

| 页面（各 3 次） | 安装版 IPC 总耗时 | 开发版 IPC 总耗时 | 导航 | 稳定等待 | DOM 获取 | Markdown/校验 | 物化 | 释放 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Example Domain | 72.7 | 1,336.5 | 396.3 | 910.4 | 1.1 | 2.2 | <0.1 | 21.1 |
| Python asyncio tasks | 178.5 | 1,323.6 | 286.2 | 932.0 | 9.3 | 69.8 | 3.6 | 27.2 |
| Electron BrowserWindow | 78.9 | 2,254.8 | 679.7 | 1,288.2 | 6.6 | 82.7 | 3.2 | 34.6 |

无并发时公开网页的获取窗口耗时均低于 0.1 ms。
Example 三次开发版总耗时为 1,336.5、11,274.5、1,308.9 ms。
第二次导航占 10,338.8 ms，稳定等待仍为 909.9 ms。日志把长尾定位到导航阶段；
具体网络或页面子资源原因仍需导航事件证据，不能仅凭总时间归因于正文稳定算法。

Python 六份工件均为 57,385 bytes、34 个代码块，SHA-256 相同：
`006906fda4429cdbebd8a721cf5da6cd62363cfff7151e3691d0f35b09aa5d8a`。
Electron 六份工件均为 93,969 bytes、17 个代码块，SHA-256 相同：
`8ae88222be2a7d8e341d15abb3e8b476b520074c80c2053147cd60430e33527d`。
两组均没有独立 Copy 控件行，阶段字段没有进入工具响应。

| 本地样例 | 安装版 ms / 行为 | 开发版 ms / 行为 |
| --- | --- | --- |
| 静态文章 | 14.8 / 正文 | 1,074 / 正文 |
| 延迟 1,200 ms SPA | 36.5 / Loading... | 2,158 / 最终正文与代码 |
| 完整短文 | 26.1 / 正文 | 949 / 正文 |
| 持续加载 | 8,040 / 成功返回 Loading... | 8,051 / WEB_FETCH_CONTENT_NOT_READY |
| 受阻页 | 8,045 / WEB_FETCH_BLOCKED_PAGE | 947 / WEB_FETCH_BLOCKED_PAGE |
| 直接文本文件 | 3.1 / 原文 | 8 / 原文 |
| 持续变动 Copy 按钮 | 33.2 / 含控件噪声 | 950 / 保留代码中的 Copy，排除控件 |

持续加载页的 readiness 为 8,001.1 ms，结果 deadline，随后正文校验失败；
受阻页 readiness 为 907.3 ms、stable，随后校验失败。两者均记录 contentExtraction
失败阶段和正常窗口释放，避免把内容失败误判为导航失败。
直接文本文件只记录 HTTP 路径：分配 1.7 ms、下载 3.9 ms、物化 1.6 ms。

四个并发 SPA 请求均返回相同最终正文。前三个 IPC 总耗时约 2,242–2,244 ms，
第四个 4,390 ms，其中 queue 为 2,230.6 ms。现有三个内容窗口的排队边界得到确认；
该数据支持利用已有并发能力，也说明并发数增加会产生等待，尚未测量 CPU/内存预算。

## 数据结论与下一阶段验收

当前首要可控成本是稳定等待，普通静态网页约 900 ms；大文档 Markdown 转换约 70–83 ms，
物化约 3–4 ms。优先评估第 2 项，把稳定观察与导航重叠，保留完整的稳定持续时间。
这只能改善导航与正文已稳定区间存在重叠的页面，不能消除真实延迟 SPA 的等待。
导航长尾需要继续保留计时，窗口容量调整需要资源数据，当前没有充分理由优先改文件写入。
本轮新增诊断没有改变等待规则，数据不代表本轮取得速度提升。

第 2 项实施前应明确观察起点、跨重定向重置和取消/回收规则。
验收沿用本轮 URL 与内容哈希，增加导航尚未完成而正文先稳定、导航后正文再变动、重定向、
持续 aria-busy、多个相同文本的 DOM 变化和渲染进程卡死场景；要求延迟 SPA 最终正文正确、
加载占位页继续失败、窗口许可正常释放，并重复记录各阶段及冷/热状态。

## 验证与证据位置

- `pnpm exec vitest run src/main/tools/webTools/__tests__`：6 个文件、112 个测试通过。
- `pnpm run typecheck:node`：通过。
- `pnpm exec eslint --quiet src/main/tools/webTools/WebToolsProcessor.ts src/main/tools/webTools/__tests__/WebToolsProcessor.test.ts`：通过；现有 React version 设置警告仍出现。
- `pnpm run check:main-doc-paths`：通过。
- `git diff --check`：通过。

临时测量目录 `/private/tmp/ati-web-fetch-timings` 保存 server.py、results.jsonl、
phases.json、analyze.py 和 summary.json。此目录属于本机复核证据，未纳入版本库。
36 次调用已完成，开发版 20 条阶段摘要均可关联，公开文档工件内容已复核。
开发版保持运行，测试样例服务测量后停止。模型链路验收仍独立于本轮工具测量。


## 第 2 项评估：稳定观察与导航重叠

评估日期：2026-10-09。结论：技术上可行，但会改变导航后观察窗口；当前建议保留生产逻辑。
前述“优先评估重叠”的建议已执行，以下反例说明它不能作为保持原有行为的直接替换。

### API 与执行边界

现有 `waitForPageContent` 通过 `webContents.executeJavaScript` 每 300 ms 获取正文。
Electron 44.5.0 的该方法在主框架仍加载时会等待 did-stop-loading；
`executeJavaScriptInIsolatedWorld` 也经过同一等待门。因此提前启动现有函数不保证实际重叠。
官方 `webContents.mainFrame.executeJavaScript` 可以在当前主文档 dom-ready 后执行。

依据：[44.5.0 WebContents 实现](https://github.com/electron/electron/blob/v44.5.0/lib/browser/api/web-contents.ts)、
[WebFrameMain 官方 API](https://www.electronjs.org/docs/latest/api/web-frame-main)。
本机安装包类型声明也注明 WebContents 的脚本执行要等待加载停止。
重叠不需要增加 headless、CDP、preload、MutationObserver 或第三方依赖。

### 隔离 Electron 证据

使用项目安装的 Electron 44.5.0、本机 HTTP 服务和隐藏窗口，sandbox/contextIsolation 开启，
nodeIntegration 关闭、backgroundThrottling 关闭，与内容窗口的相关选项一致。
HTML 立即返回，图片响应延迟 1,800 ms。三种样例均在 dom-ready 为 true 的主框架加载期间读取正文。
随后调用当前生产 `waitForPageContent`，没有修改产品代码。

| 样例 | 主框架提前读取 | loadURL 完成 | 当前正文等待完成 | 结果 |
| --- | ---: | ---: | ---: | --- |
| 静态正文、慢图片 | 57 ms | 1,848 ms | 2,758 ms | 正文一致，有约 900 ms 可重叠的理论空间 |
| 正文在 1,400 ms 更新、慢图片 | 80 ms | 1,870 ms | 2,778 ms | 初次读取为旧正文，导航结束时已是最终正文 |
| load 后 50 ms 更新、慢图片 | 85 ms | 1,872 ms | 3,079 ms | 导航完成时仍是旧正文，当前等待取得更新后的正文 |

后两种分别说明：提前稳定后停止观察会错过加载期间的变化；即便观察持续到导航完成并重新取样，
也可能错过 load 之后的异步变化。第一个样例的收益是理论推算，未实现或实测重叠版整体 fetch。
数据来自隔离进程和受控样例，不是已运行开发版的新的性能对比，也不能预测公开网页提速幅度。
临时证据目录：`/private/tmp/ati-web-navigation-overlap`，含 probe.cjs、readiness.cjs、results.json。
探针和本地服务已退出，开发版保持原有运行状态。

### 方案取舍

最小改动是提前启动现有等待函数；加载门会使实际执行仍然推迟，收益没有保证。
真正重叠需要从当前主文档 dom-ready 开始，通过 mainFrame 获取正文，持续观察到导航完成，
并在抽取前再次验证快照、文档身份、非空/非忙状态及 900 ms 稳定持续时间。
这可以把导航期间的稳定时间计入，但它将“导航后至少观察 900 ms”改成了“抽取前已稳定 900 ms”。
上面的 load 后更新反例在后一种规则下可能返回旧内容。

额外保留完整的导航后 900 ms 观察，可以延续现有保障，但会消除这项重叠优化的主要收益。
缩短到任意导航后宽限期只能移动反例发生的时间，无法证明正文完整。
主文档 MutationObserver 也无法预知尚未触发的网络回调或定时器。
因此本次建议保持现有实现和阶段日志，不引入可配置模式或按页面特征猜测的快速分支。
若后续选择更积极的快照策略，应明确接受这一正文完整性取舍，再实施并对比。

### 激进策略的实施边界与验收条件

若明确采用“导航期间的稳定时间可以计入”的策略，实施范围限定为 Processor、现有正文等待工具、
两处相关测试和对应架构/使用文档。工具响应、数据库、窗口数、文件下载和用户配置保持现有契约。

- 从本次目标主文档 dom-ready 开始取样，避免读取旧页或 about:blank。主文档切换、重定向及路由变化使已有快照失效；子框架事件不作为主文档就绪信号。
- 导航期间稳定后仍持续取样。导航完成后主动取最新快照，内容改变或出现忙状态时重新计时；最终抽取与已验证快照不一致时重新观察。
- 保留导航 15 s、导航后正文等待上限 8 s、提取 8 s 和总调用 45 s 的现有界限。提前观察不能提前耗尽导航后的等待预算。
- 每次调用独立拥有监听器、轮询、取消与文档代次。导航失败、下载、取消、超时和窗口销毁均停止观察，先清理监听器再交还窗口；旧代次的在途结果不能写回新调用。
- 保留 changing、aria-busy、Copy 控件、短文和受阻页规则。日志增加实际观察起点、导航后剩余等待和重叠量；重叠阶段不能按耗时直接相加。
- 自动测试包括：慢资源静态页、导航期间晚变化、load 后异步变化的策略取舍、完整/同文档重定向、连续加载、主框架替换、挂起执行、下载、取消和窗口复用；保留已有故障与许可恢复测试。
- 运行 Web 工具测试、Node 类型检查、改动文件 lint、适用主进程架构与文档检查；随后重启开发版重测本地样例和三组公开 URL，比较正文哈希、阶段中位数和长尾。回滚只恢复等待逻辑，不涉及工件或数据库迁移。

本次仅评估并更新文档，没有更改生产代码。评估文档链接、`pnpm run check:main-doc-paths` 和
`git diff --check` 已验证；本轮没有重复运行未变更的生产代码测试。


## 第 3 项实施：渲染后控件清洗

2026-10-09 完成。正文抽取与稳定观察共用一个内部选择器集合，覆盖原 Python/Sphinx 复制按钮，
并补充真实 Electron/Docusaurus 复制按钮、VitePress 复制按钮和 Docusaurus 移动目录折叠按钮。
选择器限定原生 button、精确 accessible label 或已观察的父容器/属性组合，保留普通按钮、标签页、
同名正文、目录链接和代码中的 HTML。未增加配置或依赖，稳定等待时序与 900 ms 条件保持原状。

忙状态检查现在基于去除噪声后的正文克隆；复制按钮内部的 aria-busy 或 progressbar 不再阻塞正文。
正文根节点 aria-busy 与保留在正文中的 progressbar 继续阻止就绪。

证据采集先等待生产稳定条件，再获取 Electron、MDN 和 Vite HTML。
捕获快照中匹配 17 个 Electron 控件（含一个目录按钮）和 57 个 Vite 控件，MDN 为零。
对同一 HTML 使用修改前后抽取器，lite/full 两种模式逐字比较：
Electron 仅删除 `On this page` 及其空行，93,969 → 93,955 bytes；MDN 4,100 bytes、
Vite 40,033 bytes 均完全相同。图标复制按钮原本无可见文字，此次主要覆盖其动态反馈。

重启开发版后的真实 IPC 验收：

| 样例 | 总耗时 | 结果 |
| --- | ---: | --- |
| 控件反馈每 100 ms 变化，复制按钮自带忙/进度状态 | 1,086 ms | 正文稳定等待 909 ms；无反馈噪声，保留普通控件和三段源码 |
| 延迟 SPA | 2,156 ms | 最终正文与代码 |
| 持续加载 | 8,036 ms | WEB_FETCH_CONTENT_NOT_READY |
| Python tasks | 1,823 ms | 57,385 bytes、34 代码块，哈希与上一轮一致 |
| Electron BrowserWindow | 2,764 ms | 93,955 bytes、17 代码块，仅删除目录按钮文本 |
| Vite features | 1,983 ms | 40,033 bytes、57 代码块 |

这是每页一次的回归验收，不能用于一般性能提升结论。
证据目录 `/private/tmp/ati-web-controls-next` 保存渲染快照、控件结构、同 HTML 前后对比、
真实 IPC 响应、阶段日志及验证脚本。服务验证后停止，开发版继续运行。

验证：Web 工具 6 个文件、118 个测试通过；Node typecheck、改动文件 ESLint、
主进程边界检查、8 个主进程架构测试、主进程文档路径检查、文档链接和 diff 空白检查通过。
未修改模型工具参数/响应或测试提供商链路。未知控件结构和 Shadow DOM 不在这组规则的覆盖范围。


## 第 4 项验证：多来源并发抓取

2026-10-09 完成实际开发版 IPC 验证。本轮没有更改生产代码、窗口数量或 Agent 执行顺序。
使用已运行的开发版（包含计时与控件清洗），内容池实际配置为三个窗口。
每次直接调用 web-fetch-action，cleanMode=full；串行批次逐个等待，并发批次同轮发出所有调用。
保留已有缓存与同一应用进程；前三轮串/并行顺序交替，以降低固定顺序的缓存偏差。
仍然是小样本热环境测量，不能证明冷启动、其他网络或提供商任务的普遍收益。

### 批次耗时与内容一致性

本地三个来源为静态文章、延迟 1,200 ms SPA、变化控件页；公开来源为 Python tasks、
Electron BrowserWindow、Vite features，URL 沿用前述验收。
总计 15 批、51 次调用，其中三个来源组各运行三轮串行和三轮并发。

| 三来源批次 | 串行三轮 ms | 并发三轮 ms | 中位数变化 | 耗时减少 |
| --- | --- | --- | --- | ---: |
| 本地不同页面 | 4,100 / 4,042 / 4,016 | 2,231 / 2,139 / 2,135 | 4,042 → 2,139 ms | 47.1% |
| 公开文档 | 7,068 / 4,473 / 4,948 | 2,222 / 3,001 / 2,054 | 4,948 → 2,222 ms | 55.1% |

成功正文按来源计算 SHA-256，串行、并发和后续恢复批次均一致。
Python 57,385 bytes / 34 代码块，Electron 93,955 bytes / 17 代码块，Vite 40,033 bytes / 57 代码块。
18 份公开文档工件具有 18 个不同路径，内容逐一读取复核，没有串页或文件覆盖。
51 条阶段日志具有 51 个不同 fetchId，均关联到对应调用，结束快照的 inFlightPhases 均为空。

### 容量、失败隔离与恢复

六个 SPA 同时发出，总耗时 4,394 ms。前三个 2,238–2,245 ms 完成、排队小于 0.1 ms；
后三个 4,390–4,394 ms 完成，queue 为 2,232–2,240 ms，形成两个波次。
同时发出更多调用会排队，不会把渲染窗口容量提高到六个。

混合六请求批次：

| 来源 | 总耗时 ms | queue ms | 结果 |
| --- | ---: | ---: | --- |
| 持续加载 | 8,038 | <0.1 | WEB_FETCH_CONTENT_NOT_READY |
| 受阻页 | 949 | <0.1 | WEB_FETCH_BLOCKED_PAGE |
| 延迟 SPA | 2,159 | <0.1 | 成功、最终正文 |
| 静态文章 | 1,885 | 944 | 成功 |
| 直接文本文件 | 20 | 不经过内容窗口 | 成功、HTTP 路径 |
| 完整短文 | 2,813 | 1,879 | 成功 |

失败请求没有取消其他来源，文件路径未受窗口队列阻塞。
随后静态、SPA、控件页三来源并发均成功，批次 2,147 ms，queue 均小于 0.1 ms，
证明本次内容失败后窗口容量恢复。取消和渲染进程卡死的保障由相关自动测试覆盖；
本轮实际 IPC 未注入取消或卡死，也未测量三个窗口都被长期慢页占用的公平性。

### 资源数据与适用边界

每秒通过 ps 只读采样本项目 Electron 主进程及其子进程的 RSS 总和。
测试前 8 秒样本中位数约 885 MiB，测试期间峰值 1,745 MiB，结束后 15 秒中位数约 1,229 MiB。
公开文档串行批次采样峰值最高 1,745 MiB，并发批次最高 1,691 MiB；
进程缓存、渲染进程创建和 GC 时点会影响样本，不能把整体增加归因于并发本身。
RSS 求和可能重复计算共享页，且包含应用 UI、GPU 等进程，不是单个 fetch 的独占内存。
未做 CPU 基准、长期泄漏或低内存机器验收。这些数据支持保留现有三个窗口，不能支持扩容。

### Agent 调用链的重要边界

阶段四验收时，窗口池和 IPC 支持并发，但当时
`src/main/agent/runtime/tools/ToolExecutorDispatcher.ts` 的 dispatch 对每个 call
逐一 await executeCall；后者把单元素数组传入 executeToolCalls。
`DefaultMainAgentRuntimeRunner` 虽然配置 ToolExecutor maxConcurrency=3，单元素输入使
同一模型批次仍然串行。跨调用者/聊天可能共享并发池，本轮没有对模型批次做真实提供商验收。
因此上述收益是并发 IPC 调用的实测收益，不能描述为普通聊天已获得的加速。

若下一步要求把收益接入聊天，应在批次调度所有者处单独设计：仅对确认可以独立执行、
授权已解决的连续 web_fetch 调用采用最多三个并发，结果按原索引返回，单页内容失败独立记录；
整体取消、终止结果、审批和 ask_user_question 屏障保留各自顺序语义。
这涉及 Agent 调度契约，需要相应 ADR、事件/结果顺序和取消测试；本轮验证没有扩大到该改动。
不需要增加窗口、恢复搜索自动全文抓取或新增批量 fetch 参数。

### 验证和证据

- 15 个真实 IPC 批次、51 次调用完成；两次预期内容失败，其余 49 次成功。
- 51 条阶段日志、18 份工件路径和全部成功正文哈希已逐一校验。
- `pnpm exec vitest run src/main/tools/webTools/__tests__/BrowserWindowPool.test.ts src/main/tools/webTools/__tests__/WebToolsProcessor.test.ts src/main/agent/runtime/tools/__tests__/ToolExecutorDispatcher.test.ts`：相关窗口/工具/调度测试通过。
- 主进程文档路径、文档链接和 `git diff --check` 通过。本轮只更新文档，沿用上一轮通过的类型和 lint 验证。

证据目录 `/private/tmp/ati-web-concurrency` 保存 server.py、results.jsonl、phases.json、
monitor.py、resources.jsonl、analyze.py、summary.json。测试服务和采样进程已停止；开发版保持运行。


## 阶段五：Agent 批次调度（2026-10-09）

已完成 [ADR-0044](../../decisions/0044-bounded-web-fetch-batch-concurrency.md) 的实现。
Dispatcher 将连续、无需确认的 web_fetch 按最多三个一组交给现有执行器，
组间等待、其他工具和审批保持顺序，用户提问保留屏障。
同组完成事件实时发出并去重，最终结果按原调用顺序交给模型。
单页失败独立；父级取消等待已启动调用收敛并停止后续组，返回有序部分结果。
没有新增批量参数、配置或窗口。

### 真实模型聊天验收

重启 `pnpm dev` 后，使用当前 DeepSeek 模型发送 Python/Electron/Vite 三个来源，
要求同一批抓取，再各读取工件前 60 行。UI 显示三个 fetch 同时 running；
实际日志开始时间为 14:39:29.306 / .307 / .307，最大相差 1 ms。

| 来源（原调用顺序） | 总耗时 ms | queue ms | bytes |
| --- | ---: | ---: | ---: |
| Python asyncio-task | 1,898 | 0.43 | 57,385 |
| Electron BrowserWindow | 3,478 | 0.20 | 93,955 |
| Vite features | 2,894 | 0.03 | 40,033 |

完成顺序为 Python → Vite → Electron，批次抓取跨度约 3,479 ms。
下一轮模型读取了三个不同工件路径，最终 UI 显示 6 个工具调用并报告三个页面标题。
Electron 工件正文没有 H1，模型明确区分抓取元数据 title 与工件正文标题。
本次证明聊天链路的批次并发和下一轮读取已接通；单次网络样本没有配对串行对照，
不能把之前 IPC 的 55.1% 收益直接换算为聊天端到端收益。
实际失败/取消未在此次聊天注入，相关边界由自动测试覆盖。
结构化阶段日志保存于临时验收目录的 phases.json；开发版保持运行。

### 自动验证

- 调度、运行集成、执行器和全部 webTools 定向测试：9 个文件、197 项通过。
- Node typecheck、调度实现及调度测试 lint 通过。
- 运行集成测试文件与 HEAD 都有 21 个既存 lint 错误，本次新增诊断为 0。
- 主进程架构边界和 8 项架构测试通过。
- `pnpm test:coverage`：361 个文件、2803 项测试通过，6 个文件和 30 项测试按既有配置跳过。
- 主进程文档路径、所改文档的本地链接及 `git diff --check` 通过。
