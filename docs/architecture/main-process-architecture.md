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
  hosts/                   chat, Telegram, CLI, and TUI host adapters
  orchestration/           run lifecycle, CLI/TUI sessions, maintenance, and post-run jobs
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

Agent-core module boundaries, runtime scenarios and type mappings are documented
in [Agent runtime](agent-runtime/README.md).

### Host to agent-core contract surface

`hosts/` consumes the agent core only through `src/main/agent/contracts/`.
The runtime types a host actually needs are re-exported from
`src/main/agent/contracts/HostRuntimeContracts.ts`, so the public surface of
`agent/runtime/` is declared in one reviewable place instead of being implied by
whatever deep path a host imports. Definitions stay in `agent/runtime/`;
`HostRuntimeContracts.ts` performs no mapping and adds no behaviour.

`pnpm run check:main-boundaries` enforces this direction with the rule
"hosts must consume agent core through stable agent contracts": any `hosts/`
module that reaches `src/main/agent/**` outside `agent/contracts/` fails the
check. Adding a name to `HostRuntimeContracts.ts` widens the core's public
surface and belongs in the same review as the host change that needs it.

Composition roots under `orchestration/` and `services/subagent/` still import
`agent/runtime/*` directly, because assembling the runtime is their job.

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

Ordinary chat runs use one Main submission boundary and a separate shared
output dispatcher. The two flows, caller-specific completion behavior, and
early chat identity binding are shown in the
[chat runtime architecture](chat-runtime-architecture-current.md#run-flow-at-a-glance).
The durable ownership decision is [ADR-0029](../decisions/0029-unified-run-submission.md).

### Active-run steering

Interactive steering uses the main-owned active run queue:

```text
run:steer (submissionId + chatUuid + queueItemId)
  -> IPC shape and payload limits
  -> RunManager exact active-run lookup
  -> bounded AgentRun FIFO
  -> AgentLoop stable checkpoint + next-step budget gate
  -> user transcript record
  -> steering.consumed runtime fact
  -> ChatRenderResponder message boundary split
  -> optional vision observation transcript record
```

A stable checkpoint follows a complete assistant response. Tool-producing
responses reach the checkpoint after the whole tool batch has emitted and
persisted its results. A checkpoint consumes one queue item when the loop budget
admits the following model step. Items remain queued through a terminal budget
boundary and return through `run.steering.returned`. The chat host
persists the inserted user message, resets the render fold, and starts a fresh
assistant draft, preserving `assistant A -> tool results -> inserted user ->
assistant B` ordering. `run.steering.consumed` confirms a specific queue item;
the runtime acknowledges that item after host persistence and event delivery.
`run.steering.returned` releases pending and unacknowledged in-flight ids when
the run reaches a terminal state first.

The IPC boundary validates identifiers, text, data-URL image strings, and null
clipboard placeholders before the request reaches `RunManager`. ArrayBuffer
images require a MIME-aware conversion before steering submission. Each run
accepts up to five pending steering items and enforces per-item and aggregate
byte limits. Recently acknowledged ids use a bounded cache to preserve retry
idempotency.

Image steering uses the same visible user-message persistence boundary. The chat
host creates a hidden `vision_observation` after the visible message, and the
loop appends that model-readable observation before materializing the next
provider request. The sidecar request shares the active run abort signal. Once
the visible user message is persisted, cancellation settles that item as
consumed and moves directly into loop abort cleanup. Raw image parts remain
outside the provider request transcript.

### Active-run cancellation

Interactive Stop uses the main-owned `RunRegistry` as the live-control boundary:

```text
run:cancel ({ submissionId?, chatUuid? })
  -> request validation
  -> RunService
  -> RunManager
  -> exact submission or active chatUuid lookup
  -> AgentRun.cancel()
  -> run.aborted
  -> renderer terminal-state projection
```

`RunManager` returns a structured cancellation result with the resolved
submission identity. Exact submission requests require a matching `chatUuid`
when both identifiers are present. Chat-keyed requests resolve the current
active run for that chat, which keeps Stop effective across renderer remounts,
HMR updates, and window reloads. Pending tool confirmations and user questions
are released for every resolved submission. `RunRegistry` remains in memory
because it owns live `AgentRun` objects and their abort signals; durable
accepted, state, tool, and terminal facts continue through `chat_run_events`.

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
- `db/run-events.ts`
- `db/smart-messages.ts`
- `db/runtime.ts`

These facades narrow each caller's available surface and support gradual
migration toward existing database application services. New small features
should reuse the closest domain facade.

The retired Assistant preset capability is removed across its database facade,
repository, service, IPC handlers, and schema. Earlier releases dropped the
retired `assistants` table; current startup no longer repeats that migration.
The transcript `assistant` role, chat-level User
Instruction, Scheduled run instructions, and Subagent execution remain
independent runtime contracts.

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
- hosts consume the agent core through `agent/contracts/` instead of deep
  `agent/runtime/` paths;
- production callers reach `DatabaseService` through approved database facades;
- the root Electron entry depends only on `app/`.

The dependency scanner parses static imports, export-from declarations, dynamic
imports, and TypeScript import-equals declarations. It resolves both `@main`
aliases and relative module paths, normalizes supported JavaScript and
TypeScript source extensions, and applies exact directory boundaries so sibling
names such as `infrastructure-next` remain independent.

The documentation check validates active `src/main` path literals and excludes
archive, reference, and explicitly historical documents.

## CLI Host

The CLI is a separate Electron main entry at `src/main/cli.ts`. The Node
launcher in `scripts/run-cli.mjs` starts `out/main/cli.js`, forwards arguments
and termination signals, and returns the CLI exit code. It does not construct
`MainApplication` or create a renderer window.

The CLI defaults to the desktop application profile and accepts `--profile-dir`
for an explicitly isolated profile. `CliChatProfile` reuses Chat's
`RunRequestFactory` for configured tools, prompts, auxiliary models and request
context. CLI has no separate tool allowlist. Session storage and run artifacts
remain under the requested output directory.

The CLI shares the strict `ToolExecutor` approval policy with Chat. Its
toolset fingerprint covers effective names, schemas and sources from the
central registry and MCP connections. The profile records the final system prompt, prompt/config
fingerprints, timeout, budget, approval mode, and its differences from the
desktop profile in `result.json`.

## Interactive terminal host

`src/main/tui.ts` delegates to `src/main/app/TuiApplication.ts`. The launcher
selects this entry for `pnpm tui`; services run in Electron without a renderer.
`src/main/orchestration/tui/TuiSession.ts` reuses Chat RunService, persisted chat
messages, model configuration, cancellation and human tool interactions.
`src/main/hosts/tui/` owns terminal event projection and Pi-based rendering.

The shared `isInteractiveMessageSource()` predicate treats desktop and `tui` as
interactive when preparing question tools and registering the question handler.
Terminal events are scoped by submission ID and chat UUID. Steering stays in the
visible queue until consumed; failed/interrupted inputs require recovery.
Drafts and pending inputs use configs keys `tui:input:<chatUuid>` on orderly exit
or session switch. No new message or database schema is introduced.

RunService exposes `waitForPostRunJobs()` backed by PostRunJobService's pending
job set. TUI shutdown also awaits toolResultCompactionScheduler.waitForIdle()
before closing database/logging, so deferred jobs retain their persistence
resources. See [the TUI guide](../guides/development/ati-tui.md) and
[ADR 0022](../decisions/0022-interactive-terminal-host.md).

## Telegram transport

`services/telegram/telegram-fetch.ts` supplies the fetch implementation for both
Bot API calls (gateway startup, connection tests, polling and replies) and file
downloads. It uses Electron `net.fetch`, with a global fetch fallback for runtimes
without Electron networking. grammY supplies a polyfill `AbortSignal`; the adapter
converts it to a native signal for Electron, forwards cancellation (including
already aborted signals and their reasons), and removes listeners when fetch
settles.

Transport failures emit `TelegramFetch/request.failed` diagnostics with the
underlying error name and message. Bot credentials and recognized sensitive text
are redacted before logging; request payloads and raw error stacks are excluded.
The original exception is rethrown so grammY retains its existing error behavior.

### Telegram tool notification lifecycle

`hosts/telegram/runtime/TelegramToolMessages.ts` owns the Telegram message ID
shared by approval projection in `TelegramGatewayService` and execution rendering
in `TelegramRenderResponder`. Each submission/tool call/chat/topic combination
sends one message; subsequent states edit that message with HTML formatting and
remove approval buttons once resolved. Ordinary assistant text keeps its existing
streaming behavior.

Approval remains authoritative in the versioned run interaction stream. The
transport serializes updates per tool endpoint, suppresses identical updates,
and prevents late approval or running updates from replacing an execution result.
Denied, expired and cancelled approvals retain their specific explanation when an
aborted tool result follows. Tool arguments remain bounded to 200 characters in
execution notifications. Only successfully delivered content is deduplicated, so
failed delivery can be retried; the gateway retains its existing approval retry.
A failed execution edit is reported through the responder's existing error path.
No duplicate completion message is sent as a fallback. Terminal message records
retain the latest 500 entries; pending and running entries are kept until settled.
No database schema or agent event contract changes are involved.
