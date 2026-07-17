# Emotion State Transition Hardening

Archived: 2026-07-17<br>
Reason: Phases 1, 2, and 3 completed and durable contracts moved into active
architecture and ADR-0005.<br>
Original path: `docs/work/plans/emotion-state-transition-hardening.md`<br>
Replaced by:
[Emotion system design](../../../architecture/emotion-system-design.md),
[ADR-0005](../../../decisions/0005-emotion-semantic-authority.md)<br>

Owner: Repository maintainers<br>
Status: Done<br>
Started: 2026-07-17<br>
Target: Emotion state correctness, BERT fallback removal, and design alignment<br>
Exit criteria: The approved phases are implemented and verified, active emotion
architecture documentation reflects runtime behavior, and this plan is archived.<br>
Related specs: [Documentation governance](../../../specs/documentation-governance.md)<br>
Related implementation:
[emotion state reducer](../../../../src/main/services/emotion/emotion-state.ts),
[chat step persistence](../../../../src/main/hosts/chat/persistence/ChatStepStore.ts),
[awake snapshot](../../../../src/main/services/awake/AwakeSnapshotService.ts),
[emotion tool definition](../../../../src/shared/tools/emotion/definitions.ts)<br>
Related architecture:
[Emotion system design](../../../architecture/emotion-system-design.md),
[Awake state design](../../../architecture/awake/awake-state-design.md)

## Goal

Strengthen the existing emotion state transition loop while preserving its
current ownership boundaries:

```text
persisted EmotionState
        |
        v
awake_state.emotion ---------> model
                                |
                         emotion_report?
                                |
                                v
                    deterministic state reducer
                    - current transition guard
                    - background migration
                    - accumulated decay
                    - bounded history
                                |
                    +-----------+-----------+
                    |                       |
                    v                       v
              emotion_states       message presentation
                    |
                    v
             next awake_state
```

The model remains the semantic authority for a changed inner emotion through
`emotion_report`. The main process owns deterministic validation, transition
constraints, decay, persistence, and presentation derivation.

## Baseline before implementation

The initial runtime loop contained:

1. `AwakeSnapshotService` reads the chat's persisted emotion state and exposes
   its baseline, background, accumulated residue, and recent history through
   `awake_state.emotion`.
2. The model may call `emotion_report` with the current emotion and a rewritten
   accumulated residue list.
3. `ChatStepStore.finalizeAssistantMessage()` extracts a successful tool result.
4. The state builder constructed current, background,
   accumulated, and history.
5. `emotion_states` stores one snapshot per chat.
6. The next turn restores the stored snapshot through `awake_state`.

The initial reducer had these correctness gaps:

- accumulated entries are clamped to a minimum intensity of `1` before the
  removal threshold is applied, so natural eviction cannot occur;
- background intensity drifts only when its label matches current, while a new
  label has no promotion rule;
- current intensity accepts an arbitrary one-turn jump within the global
  `1..10` range;
- persisted JSON has no schema version or compatibility parser;
- same-chat concurrent finalization can overwrite a state derived from a newer
  snapshot.

The initial design document also contained an implementation-gap section that
predated the persisted state and awake-state loop.

## Decisions

### 1. Remove the BERT emotion fallback

`emotion_report` becomes the only source of a new semantic current emotion.
When the tool is absent or invalid:

- preserve the previous `current`;
- run accumulated decay according to the reducer policy;
- keep background transition deterministic;
- append no synthetic current-history event;
- persist only when decay or another deterministic state transition changes the
  snapshot.

For the first turn without persisted state and without a successful tool call,
use the stable neutral baseline:

```ts
{
  label: 'neutral',
  intensity: 5,
  source: 'computed'
}
```

This rule gives tool omission a clear meaning: the model considered the restored
baseline accurate for the turn.

### 2. Delete only emotion-specific embedded model assets

Remove:

- the emotion-specific inference service implementation;
- its focused unit test;
- `resources/models/bert-emotion/`;
- EmotionInferenceService imports, mocks, and expectations in chat/runtime
  tests;
- emotion fallback-classifier references in active architecture documentation.

Keep:

- `@xenova/transformers`, because `EmbeddingService` uses it;
- `resources/models/all-MiniLM-L6-v2/`;
- the `resources/models` electron-builder copy rule;
- the Vite externalization entry for `@xenova/transformers`.

The deleted model currently accounts for approximately 44 MB of repository and
packaged resources. Packaging verification must confirm the final artifact no
longer contains `bert-emotion`.

### 3. Use one deterministic reducer

Evolve `buildNextEmotionStateSnapshot()` into a transition API that accepts
explicit inputs:

```ts
type EmotionTransitionInput = {
  previous?: EmotionStateSnapshot
  reported?: {
    emotion: ChatEmotionState
    accumulated?: EmotionAccumulatedEntry[]
  }
  now: number
}

type EmotionTransitionResult = {
  state: EmotionStateSnapshot
  changed: boolean
  presentation: ChatEmotionState
  diagnostics: EmotionTransitionDiagnostics
}
```

The reducer remains a pure function. Database access, tool-segment extraction,
and message mutation stay in `ChatStepStore`.

### 4. Bound current intensity changes

A successful tool report may change the label. Its intensity transition is
bounded to `previous.current.intensity ± 2`. A first persisted state accepts the
reported intensity after the global `1..10` clamp.

The resulting bounded value becomes both `state.current.intensity` and the
message presentation intensity. This keeps the displayed result aligned with
the persisted source of truth.

### 5. Give background an explicit hysteresis rule

Background represents a slow baseline and uses recent history as evidence:

- matching current and background labels move background intensity toward
  current by `driftFactor`;
- a different current label adds evidence through history;
- three consecutive successful reports with the same new label promote that
  label to background;
- promotion starts at the previous background intensity moved by one
  `driftFactor` step toward the bounded current intensity;
- background intensity remains within `3..7`;
- turns without a successful tool report add no label-promotion evidence.

This rule is deterministic, testable, and resistant to one-turn oscillation.

### 6. Make accumulated decay capable of eviction

Decay operates on the continuous stored value before presentation rounding:

1. compute `nextIntensity = intensity * decay`;
2. remove the entry when `nextIntensity < 0.25`;
3. retain the raw bounded value in `0.25..5`;
4. apply display formatting only when producing prompt summaries or UI text.

Each finalized turn without an accumulated rewrite applies one decay step.
A successful rewrite replaces the list after validation and normalization.
Elapsed-time decay remains outside this change because current state evolution
is turn-based.

### 7. Version persisted state

Add `schemaVersion` to the serialized snapshot envelope while retaining the
existing `emotion_states` table:

```ts
type PersistedEmotionState = {
  schemaVersion: 1
  state: EmotionStateSnapshot
}
```

The mapper parses and validates version 1 envelopes. Invalid version 1 fields
receive documented defaults. Malformed JSON and unsupported schemas produce
classified diagnostics and a neutral baseline.

### 8. Keep one semantic authority and label ontology

The 13 resource labels form one ontology across state, presentation, and asset
selection. `emotion_report` owns new semantic emotion decisions. The reducer
owns deterministic state constraints and privacy-safe transition diagnostics.

Fixed-weight candidates, an immediate classifier, and an internal-to-render
label mapping have left the roadmap. [ADR-0005](../../../decisions/0005-emotion-semantic-authority.md)
records this accepted boundary.

## Delivery phases

### Phase 1: Remove fallback and harden state transitions

Status: Implemented and focused verification completed on 2026-07-17.

This phase is independently mergeable and delivers the immediate runtime
benefit.

Implementation:

1. Remove `EmotionInferenceService` and `resources/models/bert-emotion`.
2. Remove imports and test mocks across chat finalization, run-service, runtime,
   and vision tests.
3. Change finalization to treat a successful `emotion_report` as the sole new
   emotion signal.
4. Add the neutral first-turn baseline for missing persisted state.
5. Implement accumulated eviction, current intensity bounding, and background
   label hysteresis in the pure reducer.
6. Ensure message presentation uses the reducer's bounded current.
7. Update emotion prompt wording so tool omission explicitly carries the awake
   baseline forward.
8. Synchronize active emotion and awake architecture documents.

Primary files:

- `src/main/hosts/chat/persistence/ChatStepStore.ts`
- `src/main/services/emotion/emotion-state.ts`
- `src/main/services/emotion/__tests__/emotion-state.test.ts`
- `src/main/hosts/chat/persistence/__tests__/ChatStepStore.test.ts`
- `src/shared/prompts/emotion.ts`
- `docs/architecture/emotion-system-design.md`
- `docs/architecture/awake/awake-state-design.md`
- the deletion targets and affected test mocks listed above

Verification:

```bash
pnpm test:run src/main/services/emotion/__tests__/emotion-state.test.ts
pnpm test:run src/main/hosts/chat/persistence/__tests__/ChatStepStore.test.ts
pnpm run typecheck:node
pnpm build
```

Verification record, 2026-07-17:

- emotion reducer, chat persistence, run-service, and vision focused tests:
  28 passed
- main-process architecture boundary checks: passed
- active main and renderer documentation path checks: passed
- node and renderer TypeScript checks invoked by `pnpm build`: passed
- main and preload production bundles: passed
- renderer production bundle stopped at the existing unresolved
  `@codemirror/state` entry
- source resource assertions confirm `bert-emotion` is absent and
  `all-MiniLM-L6-v2` remains present
- `git diff --check`: passed

Packaging acceptance:

- the application starts with no `bert-emotion` directory;
- a successful tool report updates message presentation and persisted state;
- tool omission preserves current while applying deterministic decay;
- a first turn without a report produces neutral `5`;
- repeated new labels promote background only after the hysteresis threshold;
- accumulated residue eventually leaves the state;
- packaged resources retain `all-MiniLM-L6-v2`;
- packaged resources contain no `bert-emotion`.

### Phase 2: Add versioned persistence and concurrency protection

Status: Implemented and focused verification completed on 2026-07-17.

This phase is independently mergeable after Phase 1.

Implementation:

1. Add a versioned emotion-state mapper with runtime validation.
2. Accept version 1 envelopes as the persisted contract.
3. Add classified diagnostics for malformed and unsupported state.
4. Make read-transition-write atomic for one chat. Use a database transaction
   at the repository boundary and verify the latest row before upsert.
5. Define aborted and tool-only finalization behavior through integration tests.

Verification:

```bash
pnpm test:run src/main/db/dao/__tests__/EmotionStateDao.test.ts
pnpm test:run src/main/db/repositories/__tests__/EmotionStateRepository.test.ts
pnpm test:run src/main/hosts/chat/persistence/__tests__/ChatStepStore.test.ts
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run typecheck:node
```

Acceptance:

- unsupported schemas recover to a neutral state with classified evidence;
- malformed snapshots produce a neutral state and diagnostic evidence;
- concurrent finalization cannot silently overwrite a newer transition;
- database deletion continues to cascade with chat deletion.

Verification record, 2026-07-17:

- mapper, DAO, repository, chat persistence, run-service, and vision focused
  tests: passed
- version 1 envelope round-trip, unsupported schema recovery, malformed JSON recovery, and
  field normalization fixtures: passed
- repository transaction test confirms read-transition-conditional-upsert uses
  one DAO transaction
- tool-only and aborted finalization paths have explicit persistence assertions
- node and renderer TypeScript checks: passed
- main and preload production bundles: passed
- renderer production bundle remains blocked by the existing unresolved
  `@codemirror/state` entry

### Phase 3: Stabilize the semantic contract and observability

Status: Implemented and focused verification completed on 2026-07-17.

Implementation:

1. Remove legacy unversioned snapshot migration from the version 1 mapper.
2. Recover unsupported schemas to `neutral / 5` with `unsupported_schema`.
3. Return transition diagnostics with mode, previous/requested/resolved values,
   intensity bounding, background action, accumulated action, and eviction
   count.
4. Log diagnostics at assistant finalization while keeping accumulated
   descriptions inside the state privacy boundary.
5. Add table-driven conversation transition fixtures for stable discussion,
   recognition, challenge, promotion, decay, omission, and reversal.
6. Accept ADR-0005 and synchronize the architecture documentation.

Exit criteria:

- one 13-label ontology governs state and rendering;
- `emotion_report` is the documented semantic authority;
- reducer interventions are inspectable through structured diagnostics;
- unsupported persisted schemas have deterministic recovery;
- conversation transition fixtures pass.

Verification record, 2026-07-17:

- reducer, mapper, repository, and chat finalization focused tests: 37 passed
- node TypeScript check: passed
- main-process boundary and architecture checks: passed
- active main and renderer documentation path checks: passed
- `git diff --check`: passed

## Test matrix

| Area | Required cases |
| --- | --- |
| Tool report | valid, invalid, failed segment, missing intensity, rewritten accumulated |
| Tool omission | existing state, first turn, visible assistant text, tool-only response |
| Current | first value, same label, changed label, upward and downward `±2` cap |
| Background | matching drift, mismatch evidence, promotion threshold, oscillating labels, `3..7` bounds |
| Accumulated | rewrite, default decay, repeated decay, threshold eviction, five-entry cap |
| History | successful reports only, source correctness, ten-entry cap |
| Persistence | version 1, unsupported schema, malformed JSON, missing fields, chat cascade |
| Runtime | finalize upsert, next-turn awake restore, aborted run, same-chat concurrent finalization |
| Packaging | BERT absent, embedding model present, application startup |

## Scope boundaries

This plan changes emotion transition behavior, model resources, related tests,
and active emotion documentation. It preserves:

- the 13-label render catalog;
- emotion asset-pack selection;
- `emotion_report` public tool name and current payload shape;
- the `emotion_states` table in Phase 1;
- embedding and memory-search model infrastructure;
- renderer emotion presentation contracts.

## Risks and controls

| Risk | Control |
| --- | --- |
| Model skips `emotion_report` frequently | Prompt states that omission carries forward baseline; runtime telemetry measures report frequency |
| Current emotion appears less reactive | Tool report remains available for meaningful changes; stable carry-over is intentional |
| Background promotion oscillates | Three-report hysteresis and table-driven tests |
| Decimal accumulated intensity leaks into UI | Presentation and summary layers own formatting |
| Unsupported state JSON reaches the runtime | Neutral recovery and `unsupported_schema` diagnostics |
| Packaged model cleanup removes embedding assets | Delete only `bert-emotion`; assert `all-MiniLM-L6-v2` in packaging checks |
| Concurrent writes lose transitions | Phase 2 atomic repository update |

## Rollback

Phase 1 rollback restores the deleted service and model directory, then restores
the previous finalize fallback branch. Persisted state remains readable because
Phase 1 keeps the existing storage shape.

Phase 2 and Phase 3 establish version 1 as the persistence contract. A rollback
reader restores the versioned mapper alongside its matching application build.

Phase 3 diagnostics are additive to reducer results and finalization logs.

## Approval gate

The approved plan covers all three implemented phases. ADR-0005 records the
durable Phase 3 semantic authority decision.
