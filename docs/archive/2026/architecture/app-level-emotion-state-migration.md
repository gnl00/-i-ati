# App-level Emotion State Migration

Archived: 2026-07-17<br>
Reason: The app-level singleton migration, cause-free accumulated contract,
runtime integration, tests, and durable documentation are complete.<br>
Original path: `docs/work/plans/app-level-emotion-state-migration.md`<br>
Replaced by:
[Emotion system design](../../../architecture/emotion-system-design.md),
[Awake state design](../../../architecture/awake/awake-state-design.md),
[ADR-0006](../../../decisions/0006-app-level-emotion-state.md)<br>

Owner: Repository maintainers<br>
Status: Done<br>
Started: 2026-07-17<br>
Target: Replace chat-scoped emotion persistence with one app-level singleton<br>
Exit criteria: The singleton schema, cause-free accumulated contract, runtime
read/write migration, tests, active architecture, and ADR links are complete;
the finished plan is archived.<br>
Related specs: [Documentation governance](../../../specs/documentation-governance.md)<br>
Related ADRs:
[ADR-0005](../../../decisions/0005-emotion-semantic-authority.md),
[ADR-0006](../../../decisions/0006-app-level-emotion-state.md)<br>
Related architecture:
[Emotion system design](../../../architecture/emotion-system-design.md),
[Awake state design](../../../architecture/awake/awake-state-design.md)<br>
Related implementation:
[emotion reducer](../../../../src/main/services/emotion/emotion-state.ts),
[emotion mapper](../../../../src/main/db/mappers/EmotionStateMapper.ts),
[emotion repository](../../../../src/main/db/repositories/EmotionStateRepository.ts)

## Scope

This migration delivers one app-wide emotion state shared by every chat and
host. It includes:

1. singleton database schema and DAO;
2. app-level repository and facade APIs;
3. atomic cross-chat state transitions;
4. awake, prompt, finalize, IPC, and welcome reader migration;
5. cause-free accumulated residue;
6. removal of chat-scoped persistence APIs and deletion coupling;
7. focused runtime, database, renderer, and documentation tests.

The 13-label ontology, `emotion_report` semantic authority, reducer intensity
bounding, background hysteresis, history, diagnostics, asset selection, and
strict version 1 envelope remain stable.

## Target data flow

```text
                      app_emotion_state(scope='app')
                                  |
          +-----------------------+-----------------------+
          |                       |                       |
       Chat A                  Chat B                 Telegram
          |                       |                       |
          +----------- assistant finalize ---------------+
                                  |
                         SQLite transaction
                    read -> transition -> upsert
                                  |
                           next global state
                                  |
             +--------------------+--------------------+
             |                    |                    |
          awake state       emotion prompt        welcome UI
```

## Persistence contract

Create:

```sql
CREATE TABLE IF NOT EXISTS app_emotion_state (
  scope TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (scope = 'app')
);
```

Use the fixed scope constant:

```ts
const APP_EMOTION_SCOPE = 'app'
```

Persist:

```ts
{
  schemaVersion: 1,
  state: EmotionStateSnapshot
}
```

Remove the chat-scoped `emotion_states` table creation and runtime DAO
statements. This change has no data migration because the current implementation
contract accepts only the new strict schema and the user approved resetting
older chat-scoped emotion data.

## Accumulated contract

Change accumulated entries to:

```ts
type EmotionAccumulatedEntry = {
  label: EmotionLabel
  intensity: number
  decay: number
  updatedAt: number
}
```

Update:

- global type declarations;
- `emotion_report` JSON schema and shared TypeScript contract;
- `EmotionToolsProcessor` validation;
- tool result extraction;
- reducer normalization, rewrite, decay, and eviction;
- mapper parsing;
- awake snapshot;
- prompt summary;
- fixtures and tests.

Normalize rewritten accumulated entries by label. Keep the strongest entry when
duplicate labels arrive, then retain at most five labels.

## API migration

Replace:

```ts
getEmotionStateByChatId(chatId)
getEmotionStateByChatUuid(chatUuid)
getLatestEmotionState()
upsertEmotionState(chatId, chatUuid, state)
transitionEmotionState(chatId, chatUuid, transition)
deleteEmotionState(chatId)
```

With:

```ts
getEmotionState()
upsertEmotionState(state)
transitionEmotionState(transition)
clearEmotionState()
```

`clearEmotionState()` is an internal database capability for tests and explicit
application reset flows. Chat deletion never calls it.

## Runtime migration

- `ChatStepStore.finalizeAssistantMessage()` computes presentation from the
  current singleton, persists and attaches the assistant message, then commits
  the singleton transition. Message update, save, or attachment failures leave
  the singleton unchanged.
- `AwakeSnapshotService` reads the singleton for every chat and host.
- `EmotionPromptProvider` reads the same singleton.
- Emotion IPC returns the singleton.
- The renderer welcome repository and hook use `getEmotionState`.
- Transition logs may include origin chat and host identifiers. Origin metadata
  stays outside persisted emotion state.

## Test matrix

| Area | Required cases |
| --- | --- |
| DAO | singleton get/upsert/delete statements, fixed scope, transaction |
| Mapper | strict v1 round-trip, malformed recovery, unsupported recovery, cause-free accumulated |
| Repository | one-row read, created timestamp preservation, atomic transition, unchanged transition |
| Cross-chat | Chat A transition becomes Chat B awake baseline |
| Deletion | deleting Chat A or Chat B preserves app emotion |
| Accumulated | duplicate-label normalization, rewrite, decay, eviction, five-label cap |
| Tool | cause-free schema, processor validation, extracted result |
| Prompt | awake and summary contain label/intensity/decay and no description |
| Renderer | welcome reads singleton and preserves fallback behavior on read failure |
| Diagnostics | accumulated descriptions and chat content remain absent |
| Architecture | main boundaries and active documentation paths pass |

## Verification commands

```bash
pnpm test:run \
  src/main/db/dao/__tests__/EmotionStateDao.test.ts \
  src/main/db/mappers/__tests__/EmotionStateMapper.test.ts \
  src/main/db/repositories/__tests__/EmotionStateRepository.test.ts \
  src/main/services/emotion/__tests__/emotion-state.test.ts \
  src/main/tools/emotion/__tests__/EmotionToolsProcessor.test.ts \
  src/main/hosts/chat/persistence/__tests__/ChatStepStore.test.ts \
  src/main/services/awake/__tests__/AwakeSnapshotService.test.ts \
  src/main/ipc/__tests__/emotion.test.ts \
  src/renderer/src/features/chat/welcome/__tests__/useWelcomeEmotionState.test.tsx

pnpm run typecheck:node
pnpm run typecheck:web
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run check:main-doc-paths
pnpm run check:renderer-doc-paths
```

## Rollback

Rollback restores the chat-scoped table, facade methods, accumulated
description field, and matching readers as one coherent application version.
The app-level singleton has no dependency on chat deletion or chat foreign
keys.
