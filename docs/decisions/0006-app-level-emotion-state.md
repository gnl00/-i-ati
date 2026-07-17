# ADR-0006: App-level emotion state ownership

**Status:** Accepted<br>
**Date:** 2026-07-17<br>
**Related architecture:** [Emotion system design](../architecture/emotion-system-design.md)<br>
**Related decision:** [ADR-0005](0005-emotion-semantic-authority.md)<br>
**Related work:** [App-level emotion state migration](../archive/2026/architecture/app-level-emotion-state-migration.md)

## Context

The emotion runtime currently stores one snapshot per chat. Awake context and
emotion prompt preparation read the snapshot associated with the active chat,
while the welcome surface reads the most recently updated chat snapshot.
Switching chats therefore changes the restored current, background,
accumulated, and history state.

The application represents one continuing @i identity across desktop chat,
Telegram, and other hosts. Emotion belongs to that identity and continues
across conversation boundaries.

The current accumulated entries include free-text descriptions. A global state
would make those chat-specific descriptions available to unrelated chats and
hosts through awake prompt injection.

## Decision

Store one app-level emotion snapshot under the fixed scope `app`.

```sql
CREATE TABLE app_emotion_state (
  scope TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (scope = 'app')
);
```

The persistence API exposes one state:

```ts
getEmotionState(): EmotionStateSnapshot | undefined

transitionEmotionState<T>(
  transition: (previous: EmotionStateSnapshot | undefined) => T
): T
```

The repository performs read, transition, and conditional upsert inside one
SQLite transaction. Concurrent finalization from different chats therefore
observes the latest committed app state.

Accumulated residue uses cause-free entries:

```ts
type EmotionAccumulatedEntry = {
  label: EmotionLabel
  intensity: number
  decay: number
  updatedAt: number
}
```

`emotion_report` rewrites a maximum of one accumulated entry per label.
Conversation-specific people, tasks, identifiers, and causes remain in chat
history, work context, and memory. Emotion state and transition diagnostics
contain labels, intensity, decay, timestamps, and state actions.

All readers use the singleton:

- awake state preparation;
- emotion prompt preparation;
- assistant finalization;
- welcome emotion display;
- desktop, Telegram, and future hosts.

Chat deletion leaves app emotion unchanged. The chat-scoped `emotion_states`
table and its APIs leave the runtime contract in the same implementation
change.

## Consequences

- Switching chats preserves one continuous personality emotion.
- Every host observes the latest committed app emotion.
- SQLite transaction ordering resolves concurrent cross-chat transitions.
- Chat deletion has no emotion-state side effect.
- Cause-free accumulated residue keeps conversation content outside global
  state and cross-chat prompt injection.
- The schema change touches the database, main-process facades, awake and
  prompt readers, IPC, renderer welcome reads, tool contracts, tests, and
  active documentation.

## Verification

- A transition from Chat A becomes the baseline read by Chat B.
- Chat deletion preserves the singleton row.
- Welcome and awake readers return the same snapshot.
- Concurrent transitions execute in one repository transaction each.
- Persisted state, prompt summaries, tool results, and diagnostics contain no
  accumulated description.
- Strict version 1 parsing and neutral recovery remain active.
