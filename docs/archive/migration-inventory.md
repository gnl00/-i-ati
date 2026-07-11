# Documentation Migration Inventory

**Batch:** `reorganize-existing-docs` lifecycle migration<br>
**Date:** 2026-07-11<br>
**Scope:** procedural guides, selected durable decisions, explicit lifecycle summaries, and `docs/2026/` history

## Guides

| Source | Destination |
| --- | --- |
| `docs/spec/tailwindcss/tailwindcss-v4-syntax-rules.md` | `docs/guides/development/tailwindcss-v4-syntax-rules.md` |
| `docs/spec/tools/tool-definition-workflow.md` | `docs/guides/development/tool-definition-workflow.md` |
| `docs/plugins/plugin-author-checklist.md` | `docs/guides/development/plugin-author-checklist.md` |
| `docs/integrations/sqlite-vec-troubleshooting.md` | `docs/guides/troubleshooting/sqlite-vec.md` |
| `docs/chat/flowtoken/测试指南.md` | `docs/guides/testing/flowtoken.md` |

## Decisions

| Source | Destination |
| --- | --- |
| `docs/todo/code-highlighter-migration-decision.md` | `docs/decisions/0001-code-highlighter-library.md` |
| `docs/architecture/prompt-cache-ordering.md` | `docs/decisions/0002-prompt-cache-ordering.md` |
| `docs/architecture/provider-db-split-summary.md` | `docs/decisions/0003-provider-database-split.md` |

## Archive

| Source | Destination |
| --- | --- |
| `docs/architecture/agent-core-chat-adapter-stage-summary.md` | `docs/archive/architecture/agent-core-chat-adapter-stage-summary.md` |
| `docs/architecture/chat-run-architecture-refactor-summary.md` | `docs/archive/architecture/chat-run-architecture-refactor-summary.md` |
| `docs/architecture/emotion-system-stage-summary.md` | `docs/archive/architecture/emotion-system-stage-summary.md` |
| `docs/architecture/telegram-host-adapter-stage-summary.md` | `docs/archive/architecture/telegram-host-adapter-stage-summary.md` |
| `docs/chat/chat-top-mode-scroll-fix-summary.md` | `docs/archive/chat/chat-top-mode-scroll-fix-summary.md` |
| `docs/chat/flowtoken/优化完成总结.md` | `docs/archive/chat/flowtoken-optimization-completion-summary.md` |
| `docs/todo/todo-tool-implementation-summary.md` | `docs/archive/tools/todo-tool-implementation-summary.md` |
| `docs/2026/arch/agent-v2-design.md` | `docs/archive/architecture/2026-agent-v2-design.md` |

## Stable paths retained

- Core architecture entry points remain under `docs/architecture/` for a later content-aware batch.
- `docs/architecture/telegram-run-responder-streaming-summary.md` remains in place because its generic summary name does not establish a stage, refactor, fix, or completion lifecycle.
- Mixed current/history documents remain in their domain directories until their owning capability receives a focused review.

## Lifecycle migration (2026-07-11)

| Source | Destination |
| --- | --- |
| `docs/spec/tools/` | `docs/specs/tools/` |
| `docs/chat/token-usage-cache-persistence-plan.md` | `docs/work/plans/chat/token-usage-cache-persistence-plan.md` |
| `docs/chat/chat-window-next-scroll-virtual-list-optimization-plan.md` | `docs/work/plans/chat/chat-window-next-scroll-virtual-list-optimization-plan.md` |
| `docs/knowledgebase/recall-issues-and-plan.md` | `docs/work/investigations/knowledgebase/recall-issues-and-plan.md` |
| `docs/data/memory-todo.md` | `docs/work/tasks/data/memory-todo.md` |
| `docs/render-pipeline-optimization.md` | `docs/archive/2026/architecture/render-pipeline-optimization.md` |
| `docs/plugins/request-adapter-plugin-api.md` | `docs/archive/2026/plugins/request-adapter-plugin-api.md` |
| `docs/telegram/telegram-response-optimization.md` | `docs/archive/2026/telegram/telegram-response-optimization.md` |
| `docs/chat/message-segmentation-optimization.md` | `docs/archive/2026/chat/message-segmentation-optimization.md` |
| `docs/chat/typewriter-optimization-with-segments.md` | `docs/archive/2026/chat/typewriter-optimization-with-segments.md` |

The existing archive domain directories moved below `archive/2026/` during the
same batch. New archive entries use explicit lifecycle metadata; older archive
entries receive metadata when their content is next reviewed.
