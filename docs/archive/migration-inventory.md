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

## 2026-09-29 content review

Scope: retire superseded implementation instructions, consolidate current explanations,
replace external source mirrors, and preserve pending acceptance separately.
Previous batches above remain historical facts.

| Source | Current destination | Reason |
| --- | --- | --- |
| `docs/chat/chat-virtual-list.md` | [2026-09-29-chat-virtual-list.md](2026/chat/2026-09-29-chat-virtual-list.md) | TanStack Virtual was replaced by MessageScroller. |
| `docs/chat/chat-scroll-hook.md` | [2026-09-29-chat-scroll-hook.md](2026/chat/2026-09-29-chat-scroll-hook.md) | The historical scroll hook is superseded. |
| `docs/chat/chat-scroll-bottom-button-fix.md` | [2026-09-29-chat-scroll-bottom-button-fix.md](2026/chat/2026-09-29-chat-scroll-bottom-button-fix.md) | The sentinel-based button implementation is historical. |
| `docs/chat/chat-top-mode-scroll-summary.md` | [chat-transcript-scrolling.md](../architecture/chat-transcript-scrolling.md) | Consolidated current scrolling ownership and behavior. |
| `docs/chat/chat-top-anchor-lock-current.md` | [chat-transcript-scrolling.md](../architecture/chat-transcript-scrolling.md) | Consolidated current scrolling ownership and behavior. |
| `docs/integrations/WEB-SEARCH-OPTIMIZATION.md` | [2026-09-29-web-search-playwright-optimization.md](2026/integrations/2026-09-29-web-search-playwright-optimization.md) | The Playwright implementation and proposed optimizations no longer describe production. |
| `docs/integrations/WEB-SEARCH-PERFORMANCE-GUIDE.md` | [2026-09-29-web-search-window-pool-performance.md](2026/integrations/2026-09-29-web-search-window-pool-performance.md) | Retain the historical window-pool experiment separately from the current guide. |
| `docs/ui/WELCOME_DESIGN_ANALYSIS.md` | [2026-09-29-welcome-design-exploration.md](2026/ui/2026-09-29-welcome-design-exploration.md) | Exploratory component variants are absent from production; numerical engagement claims have no cited evidence. |
| `docs/chat/flowtoken/优化实施方案.md` | [2026-09-29-flowtoken-implementation-plan.md](2026/chat/2026-09-29-flowtoken-implementation-plan.md) | Historical FlowToken-inspired exploration; production uses local typewriter components. |
| `docs/chat/flowtoken/打字机效果优化方向.md` | [2026-09-29-flowtoken-design-directions.md](2026/chat/2026-09-29-flowtoken-design-directions.md) | Historical FlowToken-inspired exploration; production uses local typewriter components. |
| `docs/chat/flowtoken/flowtoken原理.md` | [2026-09-29-flowtoken-principles.md](2026/chat/2026-09-29-flowtoken-principles.md) | Historical FlowToken-inspired exploration; production uses local typewriter components. |
| `docs/guides/testing/flowtoken.md` | [2026-09-29-typewriter-test-guide.md](2026/chat/2026-09-29-typewriter-test-guide.md) | The old guide contains superseded playback parameters and dependency installation steps. |
| `docs/chat/flowtoken.md` | [flowtoken.md](../reference/flowtoken.md) | Replaced external source dump with a source card. |
| `docs/integrations/modelcontextprotocol-servers.md` | [mcp-servers.md](../reference/mcp-servers.md) | Replaced third-party server directory mirror with authoritative links. |
| `docs/integrations/mcp-hub.md` | [mcp-hub.md](../reference/mcp-hub.md) | Replaced unused external implementation mirror with a source card. |
| `docs/integrations/registry.modelcontextprotocol.io-docs.md` | [mcp-registry.md](../reference/mcp-registry.md) | Consolidated Registry references; runtime API version comes from the settings client. |
| `docs/integrations/registry-aggregators.mdx` | [mcp-registry.md](../reference/mcp-registry.md) | Consolidated Registry references; runtime API version comes from the settings client. |
| `docs/integrations/claude-code-skills-implementation.md` | [2026-09-29-claude-code-skills-implementation.md](2026/integrations/2026-09-29-claude-code-skills-implementation.md) | Local analysis snapshot has no recorded upstream version; current app behavior is documented in skills.md. |
| `docs/integrations/skills-implementation-comparison.zh.md` | [2026-09-29-skills-implementation-comparison.zh.md](2026/integrations/2026-09-29-skills-implementation-comparison.zh.md) | Local analysis snapshot has no recorded upstream version; current app behavior is documented in skills.md. |
| `docs/work/plans/notifications/os-native-notification-plan.md` | [2026-09-29-os-native-notification-plan.md](2026/notifications/2026-09-29-os-native-notification-plan.md) | Work was marked Done; current notification behavior is retained in architecture. |
| `docs/work/plans/web-fetch-workspace-artifacts.md` | [2026-09-29-web-fetch-workspace-artifacts.md](2026/tools/2026-09-29-web-fetch-workspace-artifacts.md) | Implementation record is historical; remaining live acceptance is tracked separately. |
| `docs/data/memory-implementation.md` | [2026-09-29-memory-implementation.md](2026/data/2026-09-29-memory-implementation.md) | Earlier API examples and automatic-save claims are superseded by the current implementation summary. |
| `docs/work/tasks/data/memory-todo.md` | [2026-09-29-memory-todo.md](2026/data/2026-09-29-memory-todo.md) | Preload and settings integration already exist; old speculative code and estimates are retired. |
| `docs/work/plans/chat/message-scroller-integration-implementation.md` | [2026-09-29-message-scroller-integration.md](2026/chat/2026-09-29-message-scroller-integration.md) | Implementation history is separated from the remaining Electron acceptance checklist. |
| `docs/decisions/0022-unified-computer-use-tool.md` | [0024-unified-computer-use-tool.md](../decisions/0024-unified-computer-use-tool.md) | Resolve duplicate ADR-0022 identifier. |

| `docs/ui/react-resizable-panels.md` | [react-resizable-panels.md](../reference/react-resizable-panels.md) | Replace an external API mirror with a version-aware project source card. |
| `docs/ui/speed-highlight.md` | [speed-highlight.md](../reference/speed-highlight.md) | Replace an external API mirror with a version-aware project source card. |

| `docs/features/breathing-bar-demo.html` | [Waiting output animation](../features/waiting-output-animation.md) | Removed unreferenced standalone animation prototypes; production specifications live in the feature document. |

### Remaining acceptance

The documentation cleanup does not close Electron scrolling, web artifact/provider,
Memory disable-semantics, native overlay or live search acceptance. See
[Active work](../work/README.md). Existing historical test counts and failure records
retain their original dates; they are not fresh verification results.

### Reference and prototype cleanup

Incremark, FlowToken, MCP server catalogs, MCP Hub, Registry API/aggregator copies,
Cheerio and Turndown were replaced with source cards. Resizable-panels and Speed Highlight API mirrors were also replaced with source
cards; the copied third-party tool-search article was replaced with the app contract
and a bounded research card. The unreferenced breathing-bar HTML prototype was
removed. No production dependency or source implementation was removed. Full historical content remains available in
Git history. Welcome exploration is archived; its unsupported numerical engagement
claims are not current evidence. The historical Web Search contact footer and
license assertion were removed because they had no verified project authority.

### Historical archive metadata

Added missing archive headers to 17 existing records. The archival year comes
from their existing directory; missing original days and paths are explicitly
marked as unrecorded. Retired source links are rendered as historical paths
instead of pointing to a different modern implementation.

### Cleanup verification (2026-09-29)

- `pnpm run check:renderer-doc-paths`: passed.
- `pnpm run check:main-doc-paths`: passed.
- `git diff --check -- docs`: passed; new document files also passed no-index whitespace checks.
- Local documentation scan: 192 Markdown documents reachable from `docs/README.md`; no missing local file links or active Markdown anchors.
- Work/spec/archive metadata, unique ADR identifiers and package-script names: passed.
- Punctuation check for added active prose: 59 files passed; unchanged historical bodies were preserved.
- Non-archive Markdown/MDX content decreased from 45,599 to 19,390 lines.
- The pre-existing staged `.gitignore` and two CLI guides were unchanged. Parallel renderer/smoke edits were outside this documentation change.

This cleanup changed documentation only. It did not rerun behavior suites, build
or package the app, or perform Electron/native/platform/provider acceptance.
No commit or push was performed.
