# Architecture decisions

Use this directory for durable decisions that constrain future implementation.
Each ADR records status, context, decision, consequences, and links to the
specification or architecture document that motivated it.

Use sequential names such as `0001-chat-runtime-host-boundary.md`.

## Decision index

- [0001: Code highlighter library](0001-code-highlighter-library.md) - Proposed
- [0002: Prompt cache ordering](0002-prompt-cache-ordering.md) - Accepted
- [0003: Provider database split](0003-provider-database-split.md) - Accepted
- [0004: Chat message FTS5 search](0004-chat-message-fts5-search.md) - Accepted
- [0005: Emotion semantic authority](0005-emotion-semantic-authority.md) - Accepted
- [0006: App-level emotion state ownership](0006-app-level-emotion-state.md) - Accepted
- [0007: Streaming command execution](0007-streaming-command-execution.md) - Accepted
- [0008: Workspace path confinement](0008-workspace-path-confinement.md) - Accepted
- [0009: Background tool-result compaction](0009-background-tool-result-compaction.md) - Superseded by ADR-0033
- [0010: Persisted cron schedule occurrences](0010-persisted-cron-schedule-occurrences.md) - Accepted
- [0011: Size-based web fetch workspace artifacts](0011-size-based-web-fetch-workspace-artifacts.md) - Storage layout superseded by ADR-0033
- [0012: Minimal system prompt kernel](0012-minimal-system-prompt-kernel.md) - Accepted
- [0013: Remove Assistant presets](0013-remove-assistant-presets.md) - Accepted
- [0014: Resource-action tool consolidation](0014-resource-action-tool-consolidation.md) - Accepted
- [0015: Paused user-question tool protocol](0015-paused-user-question-tool-protocol.md) - Accepted
- [0016: Physical chat branch snapshots](0016-physical-chat-branch-snapshots.md) - Accepted
- [0017: Emotion stimulus scoring and VAD state projection](0017-emotion-stimulus-scoring.md) - Accepted
- [0018: Electron CLI Host boundary](0018-electron-cli-host-boundary.md) - Accepted
- [0019: Workspace tool failure contract](0019-workspace-tool-failure-contract.md) - Accepted
- [0020: Skill installation publication and recovery](0020-skill-install-recovery.md) - Accepted
- [0021: Fresh execution chats for scheduled attempts](0021-scheduled-fresh-execution-chats.md) - Accepted
- [0022: Interactive terminal host](0022-interactive-terminal-host.md) - Accepted
- [0023: Assistant work completion presentation](0023-assistant-work-completion-presentation.md) - Accepted

- [0024: Unified computer-use tool](0024-unified-computer-use-tool.md) - Accepted
- [0025: New chat approval default](0025-new-chat-approval-default.md) - Accepted

- [0026: Main-owned tool confirmation lifecycle](0026-main-owned-tool-confirmation-lifecycle.md) - Accepted

- [0027: 统一 Host 输出分发](0027-unified-host-output-dispatch.md)

- [0028: Renderer run 消费与消息版本](0028-renderer-run-ingress-and-message-revisions.md) - Accepted
- [0029: Unified run submission and early chat identity](0029-unified-run-submission.md) - Accepted
- [0030: Retire legacy tool input compatibility](0030-retire-legacy-tool-input-compatibility.md) - Accepted
- [0031: Retire pre-1.2 persisted-data compatibility](0031-retire-pre-1.2-persisted-data-compatibility.md) - Accepted
- [0032: Scheduled chat list ownership](0032-scheduled-chat-list-ownership.md) - Accepted

- [0033: Stable tool-result model content](0033-stable-tool-result-model-content.md) - Accepted

- [0034: Require the modern MCP protocol](0034-modern-mcp-protocol.md) - Accepted

- [0035: Telegram rich output and native drafts](0035-telegram-rich-output-and-drafts.md) - Accepted

- [0036: Runtime ContextManager](0036-runtime-context-manager.md) - Accepted
