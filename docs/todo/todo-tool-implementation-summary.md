# Todo 工具实现阶段总结

**创建日期**: 2026-05-10
**状态**: 已实现并验证
**相关文件**:
- `src/shared/tools/todo/definitions.ts`
- `src/shared/tools/todo/index.d.ts`
- `src/shared/tools/todo/metadata.ts`
- `src/main/tools/todo/TodoToolsProcessor.ts`
- `src/main/db/dao/TodoDao.ts`
- `src/main/db/repositories/TodoRepository.ts`
- `src/shared/prompts/index.ts`

---

## 背景

本阶段新增内置 todo 工具，用于维护跨回复、跨 chat 可持续追踪的用户待办事项。工具语义聚焦长期、可编辑、用户可见的 action item，与已有能力分工如下：

- `todo_*`: 用户待办清单，支持新增、列表、更新、删除。
- `plan_*`: 当前复杂目标的执行步骤。
- `work_context`: 当前 chat 的短期状态快照。
- `activity_journal_*`: 重要工作事件时间线。
- `schedule_*`: 未来时间触发的任务。

## 实现范围

### 工具能力

新增 4 个工具：

- `todo_add`: 新增待办，支持 `title`、`notes`、`priority`、`tags`。
- `todo_list`: 列表查询，默认返回跨 chat 的 open todos，支持 `status`、`scope`、`tag`、`priority`、`limit`。
- `todo_update`: 更新标题、备注、状态、优先级和标签；完成任务通过 `status: "done"`，重开任务通过 `status: "open"`。
- `todo_delete`: 软删除待办。

### 存储设计

todo 存储在主 app SQLite 中的独立 `todos` 表，便于精确更新、过滤、排序和后续 UI 接入。当前字段包括：

- `id`
- `chat_uuid`
- `title`
- `notes`
- `status`
- `priority`
- `tags_json`
- `created_at`
- `updated_at`
- `completed_at`
- `deleted_at`

索引覆盖 `chat_uuid` 和 `status + updated_at`，满足默认列表和当前 chat 过滤。删除采用软删除，`todo_list` 默认排除 `deleted_at` 已设置的记录。

### Prompt 优化

`src/shared/prompts/index.ts` 已加入 todo 调用规则，覆盖以下触发场景：

- 用户要求记录、跟进、加入待办、维护 action item 时调用 `todo_add`。
- 用户询问待办、未完成项、已完成项或全局待办时调用 `todo_list`。
- 用户要求完成、重开、修改优先级或改内容时调用 `todo_update`。
- 用户要求删除或取消某个待办时调用 `todo_delete`。

默认列表范围为全局跨 chat；用户明确要求当前对话、当前项目或这个 chat 的待办时使用 `scope: "current_chat"`。

## 关键行为

- `todo_list` 默认参数语义：`scope: "all"`、`status: "open"`、`limit: 50`。
- `todo_update` 从 `open` 切到 `done` 时设置 `completed_at = Date.now()`。
- `todo_update` 从 `done` 切回 `open` 时清空 `completed_at`。
- 再次完成重开的 todo 时，`completed_at` 记录最近一次完成时间。
- tag 查询使用参数化 LIKE，并对 JSON 字符串与 LIKE 通配符进行转义。
- `priority` 支持 `low`、`medium`、`high`，并可用于 `todo_list` 过滤。

## 验证

已通过以下验证：

```bash
pnpm test:run src/main/tools/todo/__tests__/TodoToolsProcessor.test.ts src/shared/tools/__tests__/definitions.test.ts
pnpm run typecheck:node
```

用户实测确认当前工作正常。
