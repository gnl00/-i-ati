# Memory 与 Embedding 当前实现

Last verified against source: 2026-09-29.

## 所有权与存储

[MemoryService](../../src/main/services/memory/MemoryService.ts) 在 main process
持有 `userData/memories.db`，使用 better-sqlite3、WAL 和 sqlite-vec 管理持久化记忆及向量。
[MainApplication](../../src/main/app/MainApplication.ts) 负责启动初始化。
Renderer 通过 preload 的通用 IPC bridge 访问已注册 handler。

[EmbeddingService](../../src/main/services/embedding/EmbeddingService.ts)
使用 `all-MiniLM-L6-v2`、384 维向量和 feature-extraction pipeline。
开发模型目录为 `resources/models`，打包目录为 `process.resourcesPath/models`。
初始化前检查模型目录；首次使用时加载模型，并共享进行中的初始化 promise。
当前批量上限为 24 条及 12,000 字符。

服务使用本地模型文件。模型资源、依赖和打包可用性仍需分别验证；本地向量处理
也不意味着整个聊天流程离线，聊天模型仍按 provider 配置运行。

## 保存、更新与检索

记忆包含 `chatId`、`messageId`、`role`、`context_origin`、`context_en`、
`timestamp`、`metadata` 和服务内部使用的 embedding。原语言用于显示，
英文内容用于向量化。列表返回不包含 embedding。

[MemoryToolsProcessor](../../src/main/tools/memory/MemoryToolsProcessor.ts)
实现三个模型工具，定义见 [memory/definitions.ts](../../src/shared/tools/memory/definitions.ts)：

| 工具 | 行为 |
| --- | --- |
| `memory_save` | 保存原文及英文内容，关联 chat；当前 processor 以 system 角色保存 |
| `memory_retrieval` | 英文 query 检索，processor 默认 topK 为 5、threshold 为 0.6 |
| `memory_update` | 按 id 更新字段，未找到或执行失败返回结构化失败 |

记忆写入由保存或更新入口触发。每条聊天消息都自动保存为记忆的描述已被移除。
服务检索支持 chat、排除 id 和时间范围等选项；模型工具暴露的参数以共享定义为准。

[AwakeSnapshotService](../../src/main/services/awake/AwakeSnapshotService.ts)
读取记忆列表，筛选 pinned preferences，并根据 retrieval plan 的 raw/contextual
query 检索候选，投影到 awake memory snapshot。具体请求注入边界见
[Awake state design](../architecture/awake/awake-state-design.md)。

## IPC 与设置页

[tools IPC](../../src/main/ipc/tools.ts) 注册 memory 的增删、检索、列表、统计和清空入口。
通道名见 [shared constants](../../src/shared/constants/index.ts)；
[preload](../../src/preload/index.ts) 暴露通用 Electron IPC bridge，当前实现没有
旧待办提议的 `window.api.memory` 专用接口。

[MemoryManager](../../src/renderer/src/features/settings/MemoryManager.tsx)
支持开关、列表刷新、长文本展开和单条删除；
[SettingsPanel](../../src/renderer/src/features/settings/SettingsPanel.tsx) 保存开关配置。
开关配置、工具选择及 awake 检索是否具有一致的禁用语义，仍在
[Memory 验收任务](../work/tasks/data/memory-todo.md) 中追踪。

## 验证入口

```bash
pnpm exec vitest run \
  src/main/services/embedding/__tests__/EmbeddingService.test.ts \
  src/main/tools/memory/__tests__/MemoryToolsProcessor.test.ts \
  src/main/services/awake/__tests__/AwakeSnapshotService.test.ts \
  src/renderer/src/features/settings/__tests__/MemoryManager.test.tsx
pnpm run typecheck
```

以上是实现变更后的验证命令。本次文档整理只进行了源码对照，实际保存、重启恢复、
禁用语义、打包模型加载和平台 sqlite-vec 验收见待办任务。

[旧技术文档](../archive/2026/data/2026-09-29-memory-implementation.md) 保留历史背景。
