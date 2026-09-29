# Memory 验收与禁用语义核对

Owner: Data capability maintainers<br>
Status: Active<br>
Started: 2026-07-11<br>
Updated: 2026-09-29<br>
Target: 核实 Memory 开关边界和实际持久化、检索链路<br>
Exit criteria: 完成下列验收，记录证据并同步当前实现文档；所有项目完成后归档<br>
Related specs: [Documentation governance](../../../specs/documentation-governance.md)<br>
Related implementation: [MemoryService](../../../../src/main/services/memory/MemoryService.ts), [AwakeSnapshotService](../../../../src/main/services/awake/AwakeSnapshotService.ts), [MemoryManager](../../../../src/renderer/src/features/settings/MemoryManager.tsx)

## 已存在的实现

服务、通用 preload IPC、模型记忆工具、awake 检索和设置页已经存在。
详见 [Memory 当前实现](../../../data/memory-implementation.md)。
旧待办中的专用 preload API、renderer service 和整套设置组件代码已退出当前任务。

## 待验证

- [ ] 核对 `memoryEnabled` 保存后是否一致控制工具可用性和 awake 检索；先记录现有行为，再决定需要的代码变更。
- [ ] 在 Electron 保存、检索、更新、删除记忆，确认设置列表显示与原文一致。
- [ ] 重启应用，确认持久化条目及检索恢复。
- [ ] 覆盖空 query、无命中、失效 id、模型资源缺失及服务失败的反馈。
- [ ] 在目标平台的打包应用确认本地模型和 sqlite-vec 可加载。

源码存在不等于上述运行时验收已经通过。本次文档整理没有执行这些验收，
也没有新增实现任务的时间估算或开关行为承诺。

[旧待办记录](../../../archive/2026/data/2026-09-29-memory-todo.md)。
