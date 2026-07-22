# Main Process Architecture

## Scope

`src/main` is organized around existing runtime, host, orchestration, service,
tool, IPC, and database boundaries. The structure favors direct imports and
small local factories. `main-ipc.ts` and `tools/index.ts` remain the searchable
central registries for IPC handlers and embedded tools.

## Directory ownership

```text
src/main/
  index.ts                 Electron entry
  app/                     startup, activation, shutdown, protocol registration
  agent/                   runtime contracts and agent execution kernel
  hosts/                   chat and Telegram host adapters
  orchestration/           run lifecycle, maintenance, and post-run jobs
  services/                reusable main-process capabilities
  tools/                   embedded tool processors and registration
  ipc/                     IPC handler groups
  db/                      database runtime, repositories, and domain facades
  request/                 provider request adapters
  logging/                 main-process logging
```

Small capabilities remain flat within `services`, `tools`, and `ipc`. Larger
capabilities may introduce internal subdirectories when their own file count
and responsibilities justify them.

## Application lifecycle

`src/main/index.ts` performs two explicit actions:

1. Register privileged protocol schemes before Electron readiness.
2. Construct `MainApplication` and register lifecycle handlers.

`src/main/app/MainApplication.ts` owns startup, activation, and idempotent
shutdown. Startup order is:

```text
logging
  -> database and config
  -> memory and knowledgebase
  -> skills
  -> embedded tools, IPC, and protocols
  -> schedulers
  -> main window
  -> background window pool and Telegram gateway
```

IPC registration completes before the main window is created. macOS activation
restores or recreates the window, and `window-all-closed` preserves the usual
menu-bar application behavior. Long-lived services stop during `before-quit`.
`src/main/app/__tests__/MainApplication.test.ts` executes the lifecycle boundary
and verifies one-time registration, startup ordering, activation behavior, and
idempotent service cleanup.

## Run event boundary

The stable interfaces `RunEventEmitter`, `RunEventSink`, and `RunEventMeta`
live in `src/main/agent/contracts/RunEvents.ts`. Hosts depend on these contracts.
The Electron/database implementation remains in
`src/main/orchestration/chat/run/infrastructure/event-emitter.ts`.

This direction keeps host and service modules independent from orchestration
infrastructure while preserving the concrete emitter and runtime factories.

## Service and tool direction

Service modules provide reusable application behavior. Tool processors adapt
tool schemas and responses to those services. Production dependencies follow:

```text
tools -> services
services -> db facades / agent contracts / shared types
```

Scheduled task execution follows the durable definition and occurrence model
documented in [Scheduled task architecture](scheduled-tasks.md). Schedule tools
write through `db/planning.ts`; `SchedulerService` claims persisted occurrences
and executes them through the chat run boundary.

`SubagentContextReader` is the narrow seam used by the subagent runtime to read
work context and activity journal data. `WorkContextService` owns the canonical
template and safe database-read semantics used by both the reader and the tool
processor. Missing records and work-context read failures return the template;
activity-journal read failures return an empty list. These optional context
failures preserve subagent execution. The subagent service has no dependency on
the corresponding tool processors.

## Database access

`db/services/DatabaseService.ts` remains a compatibility facade over the
assembled database runtime. Production callers use a small set of domain
facades:

- `db/chat.ts`
- `db/config.ts`
- `db/planning.ts`
- `db/plugins.ts`
- `db/assistants.ts`
- `db/run-events.ts`
- `db/smart-messages.ts`
- `db/runtime.ts`

These facades narrow each caller's available surface and support gradual
migration toward existing database application services. New small features
should reuse the closest domain facade.

### Chat message search projection

Chat title search and the `history_search` tool share an indexed message
retrieval boundary:

```text
ChatTitleList -> IPC -> db/chat.ts
history_search tool ----> db/chat.ts
                         -> ChatService
                         -> MessageRepository
                         -> MessageSearchDao
                         -> message_search_documents + message_search_fts
```

`MessageSearchDao` owns SQL for the structured
`message_search_documents` projection and its external-content FTS5 trigram
index. It returns query/scope/time-filtered message candidates with chat
identity, creation time, BM25 relevance, and highlighted snippets. One- and
two-code-point queries use the structured projection fallback and a
JavaScript-produced Unicode-lowercased text column.

`MessageRepository` owns product semantics above indexed retrieval: visible
user/assistant projection rules, chat-title merging, chat-level aggregation,
history keyword OR semantics, neighboring-message windows, and result contract
mapping. Public limits apply after repository aggregation and ranking, which
preserves complete chat-level and message-level result semantics.
`extractSearchableMessageText()` remains the shared text-extraction boundary.
The `history_search` tool converts highlighted transport snippets to plain text
at its response boundary.

Source message mutations, search document mutations, and FTS row mutations
share one SQLite transaction. `MessageSearchDao` explicitly maintains the
external-content index while the connection uses `trusted_schema = OFF`.
Projection-version metadata drives transactional initial backfill and later
rebuilds from `messages.body`.

The durable decision and delivery record are:

- [ADR 0004: Chat Message FTS5 Search](../decisions/0004-chat-message-fts5-search.md)
- [Chat message FTS5 search optimization plan](../archive/2026/chat/chat-message-fts5-search-optimization-plan.md)

## Executable checks

Run these commands after main-process structure changes:

```bash
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
pnpm run typecheck:node
```

The boundary check enforces confirmed rules only:

- production services do not import main-process tool processors;
- services and hosts consume stable event contracts instead of run infrastructure;
- production callers reach `DatabaseService` through approved database facades;
- the root Electron entry depends only on `app/`.

The dependency scanner parses static imports, export-from declarations, dynamic
imports, and TypeScript import-equals declarations. It resolves both `@main`
aliases and relative module paths, normalizes supported JavaScript and
TypeScript source extensions, and applies exact directory boundaries so sibling
names such as `infrastructure-next` remain independent.

The documentation check validates active `src/main` path literals and excludes
archive, reference, and explicitly historical documents.
