# Tool Result Compaction Design

Owner: Repository maintainers<br>
Status: Active<br>
Started: 2026-07-17<br>
Target: Metadata-driven background tool-result compaction for future model reuse<br>
Exit criteria: The storage contract, trigger policy, compactor interface, request selection, failure handling, and delivery sequence are approved for implementation.<br>
Related specs: [`../../specs/documentation-governance.md`](../../specs/documentation-governance.md)<br>
Related decision: [`../../decisions/0009-background-tool-result-compaction.md`](../../decisions/0009-background-tool-result-compaction.md)<br>
Current delivery plan: [`background-tool-result-compaction.md`](background-tool-result-compaction.md)<br>
Related implementation: [`../../../src/shared/tools/metadata-types.ts`](../../../src/shared/tools/metadata-types.ts), [`../../../src/shared/tools/webTools/metadata.ts`](../../../src/shared/tools/webTools/metadata.ts), [`../../../src/shared/tools/command/metadata.ts`](../../../src/shared/tools/command/metadata.ts), [`../../../src/main/agent/runtime/tools/ToolResultContentProjector.ts`](../../../src/main/agent/runtime/tools/ToolResultContentProjector.ts), [`../../../src/main/hosts/chat/runtime/ChatRenderOutput.ts`](../../../src/main/hosts/chat/runtime/ChatRenderOutput.ts), [`../../../src/main/agent/runtime/transcript/RequestMaterializer.ts`](../../../src/main/agent/runtime/transcript/RequestMaterializer.ts)

## Goal

Add a dedicated compaction path for tool call results. The system keeps the raw
tool result for recovery, re-compaction, and auditing. A reusable compact
representation is generated after persistence. The active continuation and
renderer consume raw content. Future submitted runs select ready compact
content during request preparation.

The first implementation focuses on tool results with predictable high-volume
output. Each tool declares its result-compaction behavior in shared tool
metadata. The runtime reads the metadata and schedules the configured
compactor.

## Scope

This plan covers:

- raw tool-result persistence;
- background compaction after raw tool-result persistence;
- metadata-driven compaction policy;
- multi-level compact results;
- persisted compact-result lookup;
- model-request selection and fallback;
- versioning, retries, logs, and tests.

User, assistant, system, and runtime-context message compaction belong to later
design work.

Conversation-level rolling summaries continue to use the existing
`compressed_summaries` path.

## Current behavior

The current replay path is:

```text
tool execution
  -> ToolResultFact
  -> hot transcript record
  -> tool message persistence
  -> later history import
  -> RequestMaterializer
  -> ToolResultContentProjector
  -> cold result truncated to the first 4,000 characters
  -> provider request
```

[`MessageMapper.ts`](../../../src/main/db/mappers/MessageMapper.ts) serializes
the complete `ChatMessage` into `messages.body`. This remains the raw data source.

[`ToolResultContentProjector.ts`](../../../src/main/agent/runtime/tools/ToolResultContentProjector.ts)
currently compacts cold results while the provider request is being assembled.
The implementation uses a character limit and preserves the beginning of the
content.

[`ToolResultNormalizer.ts`](../../../src/main/agent/runtime/tools/result-normalization/ToolResultNormalizer.ts)
already extracts inline image artifacts and generates model-facing content for
large results. Its artifact handling should be reused by the compaction module.

## Target flow

```text
tool execution
  -> ToolResultFact(raw)
  -> raw tool message persisted
  -> raw result delivered to renderer
  -> raw result appended to the active transcript
  -> current agent loop continues with full raw content
  -> background compaction job
  -> compact result persisted for future runs

later context assembly
  -> load raw tool messages
  -> batch-load ready compact results
  -> select compact model content
  -> provider request
```

Future-run model content uses compact output when it provides positive size
gain. Raw content covers disabled policies, unavailable compactors, empty
output, zero-gain output, compaction failures, and incomplete background work.
Database entities and renderer projections preserve the raw source.

## Storage

Use an independent `tool_result_compactions` table:

```sql
CREATE TABLE IF NOT EXISTS tool_result_compactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  tool_call_id TEXT,
  level TEXT NOT NULL,
  status TEXT NOT NULL,
  content TEXT,
  original_hash TEXT NOT NULL,
  original_characters INTEGER,
  compacted_characters INTEGER,
  estimated_tokens INTEGER,
  execution_type TEXT,
  model_id TEXT,
  prompt_version TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  input_characters INTEGER,
  sent_characters INTEGER,
  input_truncated INTEGER,
  redaction_count INTEGER,
  compactor_id TEXT NOT NULL,
  compactor_version INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  UNIQUE (
    message_id,
    level,
    compactor_id,
    compactor_version,
    original_hash
  )
);

CREATE INDEX IF NOT EXISTS idx_tool_result_compactions_lookup
  ON tool_result_compactions(message_id, level, status);

CREATE INDEX IF NOT EXISTS idx_tool_result_compactions_jobs
  ON tool_result_compactions(status, updated_at);
```

`messages.body` stores the raw result. `tool_result_compactions.content` stores
the provider-neutral compact representation.

### Levels

| Level | Use | Content |
| --- | --- | --- |
| `balanced` | Normal cold replay | Main facts, structure, source references, and up to 1,000 body characters |
| `minimal` | Distant history or tight context budget | Status, identifiers, conclusions, errors, artifact references, and up to 500 body characters |

Phase 1 generates `balanced`. The table and compactor contract reserve
`minimal` for the next phase.

### Status

`status` supports:

- `pending`: job created;
- `running`: compactor executing;
- `ready`: content available for request selection;
- `failed`: attempt ended with a recorded error.

`original_hash` ties a compact result to the exact raw content.
`compactor_version` allows the algorithm to evolve while older rows remain
traceable.

## Compaction module

Add a tool-result compaction package under chat orchestration:

```text
chat orchestration / tool-result-compaction
  ToolResultCompactionScheduler
  ToolResultCompactorRegistry
  compactors/
    WebFetchResultCompactor
```

Database access follows the current DAO, mapper, repository, and facade
boundaries.

### Core contract

```ts
export type ToolResultCompactionLevel = 'balanced' | 'minimal'

export interface ToolResultCompactionInput {
  messageId: number
  toolName: string
  toolCallId?: string
  args?: unknown
  status: 'success' | 'error' | 'timeout' | 'aborted' | 'denied'
  rawContent: unknown
  level: ToolResultCompactionLevel
}

export interface ToolResultCompactionOutput {
  content: string
  compactorId: string
  compactorVersion: number
  originalCharacters: number
  compactedCharacters: number
  estimatedTokens: number
  execution: {
    executionType: 'model' | 'deterministic'
    modelId?: string
    promptVersion?: string
    promptTokens?: number
    completionTokens?: number
    latencyMs?: number
    inputCharacters?: number
    sentCharacters?: number
    inputTruncated?: boolean
    redactionCount?: number
  }
}

export interface ToolResultCompactor {
  compact(
    input: ToolResultCompactionInput
  ): Promise<ToolResultCompactionOutput | undefined>
}
```

`undefined` means the tool result can continue using raw content for the
requested level.

## Trigger policy

Compaction configuration belongs to `EmbeddedToolMetadata`:

```ts
export type ToolResultCompactionLevel = 'balanced' | 'minimal'

export interface ToolResultCompactionMetadata {
  enabled: boolean
  level: ToolResultCompactionLevel
  compactorId: string
}

export interface EmbeddedToolMetadata {
  capability: EmbeddedToolCapability
  riskLevel: EmbeddedToolRiskLevel
  mutatesWorkspace: boolean
  subagent: 'allow' | 'deny'
  roles?: SubagentRole[]
  resultCompaction?: ToolResultCompactionMetadata
}
```

The optional field keeps the default behavior explicit:

```text
resultCompaction.enabled === true
  -> schedule the configured level and compactor

resultCompaction missing or disabled
  -> preserve raw replay behavior
```

The first metadata configuration lives in
[`webTools/metadata.ts`](../../../src/shared/tools/webTools/metadata.ts):

```ts
export const webToolMetadata = {
  web_search: {
    capability: 'web',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  web_fetch: {
    capability: 'web',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow',
    resultCompaction: {
      enabled: true,
      level: 'balanced',
      compactorId: 'web-document'
    }
  }
} satisfies EmbeddedToolMetadataMap
```

`web_fetch` uses this configuration because its result normally contains a
fetched document, page metadata, extraction details, and repeated page text.
Its output has a stable semantic shape and a high probability of benefiting
from compaction.

The `web_fetch` compact result should preserve:

- requested and final URL;
- page title;
- content type;
- fetch and extraction status;
- truncation state;
- source or citation references;
- heading structure;
- main content;
- errors and fallback path.

Navigation text, repeated page chrome, duplicated sections, and low-value
markup can be removed.

The second metadata configuration lives in
[`command/metadata.ts`](../../../src/shared/tools/command/metadata.ts).
`execute_command` uses `level: 'balanced'` with the `command-output` compactor.
Its compact envelope preserves command, exit code, execution time, errors,
confirmation state, and risk fields. The semantic `output_summary` retains
stdout and stderr attribution, failure evidence, test names and totals,
warnings, file paths, line and column numbers, generated artifacts, process
status, and actionable next steps.

### Model-backed semantic extraction

`WebFetchResultCompactor` delegates body extraction to the reusable
`CompactAgent`. The agent resolves the configured lite model and runs one
tool-free request under the `compact-agent` request-log identity. The
`web-fetch-result` profile asks the model to retain concrete facts, names,
numbers, dates, conclusions, errors, headings, and source attribution.
Model-backed compaction uses a 20-second default timeout before selecting the
deterministic fallback. Its prompt requires source-grounded extraction without
expansion, and its generated-token budget matches the semantic character
budget.

The balanced profile bounds model input to 12,000 Unicode characters and the
minimal profile bounds it to 6,000. Each compactor creates a structured
untrusted-source JSON envelope before dispatch. Dynamic URL, title, command,
status, and result fields stay in that envelope. `modelInputPolicy` selects
secret redaction or verbatim forwarding. The shared sensitive-text redactor is
also applied to request debug-log strings. The parent run abort signal is
combined with the agent's internal timeout.

The model returns extracted body text. `WebFetchResultCompactor` owns the stable
provider-neutral JSON envelope and restores requested URL, final URL, title,
status, content type, source, citations, and truncation metadata. `balanced`
passes a 1,000-character body budget and `minimal` passes a 500-character body
budget.

Model errors, timeouts, and empty output run the deterministic head-tail
algorithm under the same character budget. Scheduler-level size comparison
selects compact content only when the complete envelope has positive gain.

## Trigger point

[`ChatRenderOutput.appendToolResult()`](../../../src/main/hosts/chat/runtime/ChatRenderOutput.ts)
receives the stable `ToolResultFact`, creates the tool `ChatMessage`, and
persists it through `ChatStepStore`. The host depends on a narrow scheduling
contract. `RunRuntimeFactory` injects the production scheduler so loading the
render runtime does not eagerly load embedded tools or Electron window modules.

The scheduling sequence is:

```text
appendToolResult(result)
  -> build raw tool message
  -> persistToolResultMessage()
  -> receive message ID
  -> emit raw tool result to renderer
  -> schedule metadata-declared compaction
  -> return raw content
  -> continue the agent loop with full raw content
```

The scheduler receives:

- persisted message ID;
- tool name and tool call ID;
- tool status;
- raw result;
- metadata-declared compaction level and compactor ID;
- raw-content hash.

Queue insertion is idempotent through the table's unique key.
`INSERT ... ON CONFLICT DO NOTHING` preserves ready and running rows. Claiming
uses a conditional `pending|failed -> running` update. Terminal writes require
the running state, and the scheduler uses an identity-keyed singleflight promise
to share concurrent work in one process. The scheduler drains a bounded FIFO
queue with one active worker and eight waiting jobs. Queue work begins through
`setImmediate` so the active model continuation can dispatch first.

`ToolResultCompactionScheduler` reads
`embeddedToolsRegistry.getToolMetadata(toolName)?.resultCompaction`. It contains
no tool-name branches. `ToolResultCompactorRegistry` resolves the configured
`compactorId` to an implementation.

## Job execution

```text
schedule
  -> read tool metadata
  -> validate enabled, level, and compactor ID
  -> compute original hash
  -> insert pending row
  -> claim pending row
  -> mark running
  -> run compactor
  -> request semantic extraction through CompactAgent
  -> apply deterministic fallback when required
  -> verify raw hash
  -> write compact content, model identity, token usage, and latency
  -> mark ready
```

The active tool-result boundary schedules this job and returns raw content. The
default transcript record factory keeps the original `ToolResultFact` in the
active transcript. Renderer delivery uses the persisted raw message. Compact
content becomes eligible when a future submitted run rebuilds its initial
transcript.

A raw-hash mismatch excludes a ready row during replay selection. A failed job
records `last_error_code` and `attempts`; a later schedule can claim it again.

Application-startup recovery belongs to the multi-level follow-up phase.

## Context selection

Context preparation performs one batch lookup for tool-message IDs:

```text
history messages
  -> collect tool-message IDs
  -> load ready tool_result_compactions
  -> select content
  -> InitialTranscriptSeedBuilder
  -> RequestMaterializer
  -> provider request
```

Selection uses persisted message IDs, which keeps results distinct when
providers reuse a tool call ID across turns. Request preparation reloads the
persisted raw tool messages before validating each ready row's SHA-256 hash.
Hash mismatches select the current raw content. Ready lookups deduplicate IDs
and use batches of 500. Repository updates preserve the stored raw content of
tool messages across renderer updates.

Phase 1 selection:

| Tool-result position | Selected content |
| --- | --- |
| Immediate continuation in the active run | Full raw |
| Older result in the same active run | Existing cold projection |
| Result without ready compaction | Raw with existing request guard |
| New-run result with ready metadata-declared compaction | Configured level |

Phase 2 can add `minimal` selection according to message-pair distance and
available context budget.

The existing 4,000-character request guard remains as rollout protection for raw
cold results.

## Relationship with existing normalization

The current `ToolResultNormalizer` handles inline images and oversized payload
artifacts when a transcript becomes cold. The compaction service should reuse
its artifact-store capability.

The target ownership is:

| Capability | Owner |
| --- | --- |
| Raw tool-result display projection | `ToolResultContentProjector` |
| Inline image and raw artifact persistence | Shared artifact store |
| Persisted cold replay content | Tool-result compaction module |
| Active UI and model content | Raw host message and hot transcript |
| Historical model overlay | `RunRequestFactory` and shared selection helpers |
| Provider request assembly | `RequestMaterializer` |

During migration, normalized legacy content remains readable through
`ToolResultContentProjector`.

## Observability

The operational follow-up phase should add a compaction completion log:

```json
{
  "scope": "ToolResultCompactionService",
  "msg": "tool_result_compaction.completed",
  "context": {
    "messageId": 123,
    "toolName": "web_fetch",
    "level": "balanced",
    "compactorId": "web-document",
    "compactorVersion": 2,
    "originalCharacters": 48210,
    "compactedCharacters": 1320,
    "estimatedTokens": 330,
    "executionType": "model",
    "modelId": "configured-lite-model",
    "promptVersion": "web-fetch-v1",
    "promptTokens": 12110,
    "completionTokens": 247,
    "latencyMs": 820
  }
}
```

It should also add a request selection log:

```json
{
  "scope": "ToolResultCompactionSelector",
  "msg": "tool_result_compaction.selected",
  "context": {
    "messageId": 123,
    "requestedLevel": "balanced",
    "selectedLevel": "balanced",
    "cacheHit": true
  }
}
```

The persisted row records attempts, compact ratio inputs, execution type,
model identity, prompt version, token usage, latency, and update time.
Structured runtime logs record started, ready, skipped, and failed transitions.

## Failure behavior

- Raw persistence completes before compaction execution.
- Compaction rows use idempotent insertion.
- Raw hash and compactor version protect request selection from stale content.
- Atomic claims and in-process singleflight prevent duplicate model execution
  for one compaction identity.
- Parent-run cancellation reaches queued and active compactor work.
- Model input budgets and secret redaction run before provider dispatch.
- Pending and failed rows use raw content with the existing request guard.
- Database deletion cascades remove compact results with their message.
- Compactor errors leave raw content available for the active run, UI display,
  and later requests.
- Queue overflow records a warning and leaves raw historical replay available.
- Persisted job state supports a later application-restart recovery worker.

## Delivery plan

### Phase 1: Metadata-driven balanced compaction

Extend `EmbeddedToolMetadata` with `resultCompaction`. Add the table, database
access, scheduler, compactor registry, selector, and `WebFetchResultCompactor`.
Configure `web_fetch` with `level: 'balanced'` and
`compactorId: 'web-document'` in its metadata. Schedule compaction after a raw
tool result is persisted and its metadata enables the feature. Batch-load ready
compact results during context preparation.

This phase provides the complete raw-to-compact-to-request path for one
high-volume tool.

Status: historical model-result resolution was added on 2026-07-17.
Model-backed semantic extraction through `CompactAgent`, deterministic
fallback, and execution metrics were added in the same phase. Atomic claims,
immutable runtime facts, message-ID replay selection, bounded compact-agent
input, shared secret redaction, and parent-run cancellation were added on
2026-07-18. ADR-0009 replaces active-result resolution with full raw active
continuation and background compaction.

### Phase 2: Multi-level replay

Add `minimal` output and select between `balanced` and `minimal` using
message-pair distance and context budget. Add startup recovery for stale
`pending` and `running` rows.

### Phase 3: Additional tool policies

Add `resultCompaction` metadata to tools according to observed request volume
and semantic shape. Each new `compactorId` receives an implementation and
field-preservation tests.

Status: `execute_command` joined this phase on 2026-07-17 with `balanced`
metadata, the `command-output` profile, model-backed semantic extraction, and a
bounded head-tail fallback.

## Verification

Automated coverage:

- database migration, uniqueness, cascade deletion, and batch lookup;
- metadata type validation and registry propagation;
- enabled, disabled, and missing `resultCompaction` routing;
- configured level and compactor ID propagation;
- `web_fetch` metadata configuration;
- `execute_command` metadata configuration;
- compaction after raw tool-result persistence;
- raw result equality across the active agent loop and renderer event;
- active-loop continuation before background compaction completion;
- original runtime fact preservation for later side-effect sinks;
- raw entity preservation during renderer reads;
- raw-hash validation and repeated tool-call-ID isolation;
- input budget, structured untrusted data, secret redaction, and cancellation;
- atomic database claim and in-process singleflight behavior;
- 500-ID batch lookup behavior;
- positive-size-gain selection and raw resolution;
- pending, running, ready, failed, stale-hash, and stale-version states;
- ready compact-result selection for a new submitted run;
- raw fallback through the existing request guard;
- one compaction batch query per context build;
- URL, title, extraction status, truncation state, references, and errors in the
  `web_fetch` compact result;
- command, exit code, execution time, errors, stream attribution, and diagnostic
  evidence in the `execute_command` compact result;
- lite-model semantic extraction, request identity, output budget, and prompt
  version;
- model error, timeout, and empty-output deterministic fallback;
- execution type, model identity, prompt tokens, completion tokens, and latency
  persistence;
- CJK-heavy, Latin-heavy, inline-image, and oversized page payloads;
- retry and application-restart recovery;
- compatibility with legacy normalized tool results.

Verification commands:

```bash
pnpm run typecheck:node
pnpm test:run
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
git diff --check
```

## Decisions

1. The first implementation handles tool call results only.
2. Raw tool results stay in `messages.body`.
3. Compact results live in `tool_result_compactions`.
4. Compaction starts after raw tool-result persistence.
5. The active agent loop and renderer consume full raw content.
6. Shared tool metadata controls compaction eligibility, level, and compactor.
7. `web_fetch` declares `balanced` compaction in `webTools/metadata.ts`.
8. `execute_command` declares `balanced` compaction in `command/metadata.ts`.
9. New submitted runs prefer a positive-gain ready compact result.
10. The current request guard handles raw fallback.
11. Renderer history reads raw persisted content.
12. `CompactAgent` provides reusable model-backed semantic extraction.
13. `WebFetchResultCompactor` owns the web document profile and stable output
    envelope.
14. `ExecuteCommandResultCompactor` owns the command output profile and stable
    diagnostic envelope.
15. Deterministic head-tail compaction handles unavailable model output.
16. Shared runtime facts retain raw structured content throughout the active
    run. Request preparation supplies compact content to future model seeds.
17. Model input is bounded, dynamically sourced fields stay untrusted, and
    metadata declares the sensitive-data policy.
18. Atomic database claims and scheduler singleflight protect one compaction
    identity from duplicate execution.
19. The background queue runs one job at a time and holds at most eight waiting
    jobs.
20. The immediate continuation sends full raw content without a character
    guard.

## Implementation snapshot

Phase 1 uses these concrete paths:

- shared metadata: `src/shared/tools/metadata-types.ts` and
  the `src/shared/tools/webTools/metadata.ts` and
  `src/shared/tools/command/metadata.ts` policies;
- scheduler and compactor:
  `src/main/orchestration/chat/toolResultCompaction/`;
- raw-result trigger: `src/main/hosts/chat/runtime/ChatRenderOutput.ts`;
- batch lookup and cold overlay:
  `src/main/hosts/chat/preparation/RunRequestFactory.ts` and
  `src/main/hosts/chat/preparation/request/InitialTranscriptSeedBuilder.ts`;
- persistence: `src/main/db/dao/ToolResultCompactionDao.ts`,
  `src/main/db/mappers/ToolResultCompactionMapper.ts`, and
  `src/main/db/repositories/ToolResultCompactionRepository.ts`.

Verification covers focused Vitest suites, Node and renderer TypeScript checks,
main-boundary checks, documentation path checks, architecture tests, and
`git diff --check`.
