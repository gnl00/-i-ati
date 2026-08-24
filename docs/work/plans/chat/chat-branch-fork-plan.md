# Assistant Message Chat Branch Fork Plan

Owner: Chat runtime maintainers<br>
Status: Implemented<br>
Started: 2026-08-20<br>
Completed: 2026-08-20<br>
Target: Create a self-contained chat branch from a completed assistant message<br>
Exit criteria: Transactional fork, branch switching, summary inheritance, ready tool-result compaction reuse, focused tests, architecture checks, and build pass<br>
Related specs: [Documentation governance](../../../specs/documentation-governance.md)<br>
Related implementation: `src/main/db`, `src/main/ipc`, `src/shared`, `src/renderer/src/features/chat`

## Goal

Add a `Branch chat` operation below a completed assistant message. Activating it
creates a new ordinary Chat whose persisted message history ends at that
assistant message, then selects the new Chat in the renderer.

The branch retains the source provider/model context, workspace, chat-level
user instruction, permission approval mode, loaded skills, and work context. A
lineage-derived numeric suffix distinguishes its title. System prompts and other
ephemeral runtime context continue through their existing live composition path.

The implementation spans more than eight files and introduces one focused Main
database repository. The scope crosses SQLite schema, database composition,
IPC contracts, renderer persistence, chat coordination state, and assistant
message operations.

## Product behavior

1. Every persisted terminal assistant response exposes `Branch chat` in its
   hover operations.
2. The operation is available while the current Chat run is idle.
3. Main validates that the source Chat exists, the target message belongs to
   it, and the target is a terminal assistant message.
4. Main creates a physical snapshot containing every persisted source message
   through the target assistant message, inclusive. The target source message
   ID is a strict cutoff; later user, assistant, and tool rows stay in source.
5. Renderer receives the new Chat and copied messages, prepends the Chat list
   entry, installs the transcript buffer, switches the shell, restores the
   branch model selection, and scrolls to the copied assistant message.
6. A success toast confirms the branch. A typed Main error produces one error
   toast and leaves the selected Chat unchanged.

Host bindings, task plans, todos, scheduled tasks, run-event traces, pending
tool confirmations, pending structured questions, and active-run state continue
to belong to the source Chat.

## Data model

Extend `chats` with nullable lineage fields:

| Column | Entity field | Meaning |
| --- | --- | --- |
| `parent_chat_uuid TEXT` | `parentChatUuid?: string` | Immediate source Chat UUID |
| `forked_from_message_id INTEGER` | `forkedFromMessageId?: number` | Source assistant message boundary |
| `forked_at INTEGER` | `forkedAt?: number` | Snapshot creation time |

Existing databases receive the columns through the current additive
`ensureColumn` migration style. New Chat rows store the lineage values; ordinary
Chat creation stores null values. The lineage columns serve UI diagnostics and
future branch navigation. Message ownership remains physical and branch-local.

Shared IPC contracts:

```ts
interface ChatForkRequest {
  sourceChatId: number
  sourceChatUuid: string
  forkedFromMessageId: number
}

interface ChatForkResult {
  chat: ChatEntity
  messages: MessageEntity[]
}
```

The channel is `chat:fork`. Main derives the destination UUID, timestamps,
message count, lineage, and copied records. Renderer supplies source identity
and the selected assistant message boundary.

## Transaction owner

Add `ChatBranchRepository` under `src/main/db/repositories/`. It receives the
live SQLite connection and the DAOs required for chat, message, message search,
skill, work-context, compressed-summary, and tool-result-compaction writes.

The repository owns one `better-sqlite3` transaction:

```text
validate source chat and assistant boundary
  -> create destination chat
  -> copy source messages in ID order through the boundary
     -> collect destination IDs covered by a compatible summary
     -> save ready tool-result compactions for each copied tool message
  -> save one independent active compressed summary
  -> copy loaded skills in load order
  -> copy work context
  -> return destination chat and copied messages
```

Any thrown validation or SQLite error rolls back the destination Chat and every
dependent row. The repository returns entities read from the committed snapshot
shape used by the renderer.

## Chat and message copy rules

The destination Chat copies:

- a title derived from the lineage root's current title and next flat suffix
- target assistant `body.modelRef`, with source Chat `modelRef` as fallback
- `workspacePath`
- `userInstruction`
- `permissionApprovalMode`
- loaded skills and their order
- work-context content

The destination receives a fresh UUID and timestamps. `msgCount` reflects the
same counted-message rule used by normal message persistence.

Messages are selected by source Chat UUID, ordered by ascending message ID, and
cut strictly at the validated assistant message ID. Every copied row receives
the destination `chatId/chatUuid` and a fresh autoincrement message ID. `body`,
`tokens`, and `tokenUsage` are preserved. User and assistant copies update the
existing message-search projection inside the transaction.

The terminal assistant validation accepts a persisted `role=assistant` message
whose `typewriterCompleted` value is true or absent for compatible historical
rows. An explicit false value produces `INVALID_FORK_BOUNDARY`. Renderer exposes
the operation only for completed, persisted assistant messages.

If the selected boundary body contains protocol `toolCalls`, the destination
boundary copy removes that field while retaining content, segments, model
metadata, timestamps, and token information. Tool-call segments continue to
render the completed historical operation. Tool-result rows after the selected
source message ID remain in the source Chat.

Title numbering follows the whole lineage. The repository walks
`parent_chat_uuid` to the root, uses the root's current title as the base, scans
that lineage's `${baseTitle} (n)` titles, and assigns `max(n) + 1` inside the
immediate transaction. Missing parents and cycles fall back deterministically
to the selected source Chat as the local root. Existing branch titles remain
unchanged after a later root rename.

## Compressed summary copy

Read all source summaries and retain candidates whose complete `messageIds`
set exists inside the selected source prefix. Select the candidate with the
largest covered set, then use `compressedAt` and row ID as deterministic
tie-breakers.

During message copy, membership in the selected source summary drives a local
array of destination compressed message IDs. This array exists only inside the
transaction; the design has no general old-to-new mapping table or persistent
message-lineage relation.

Save one fresh destination summary:

- destination `chatId/chatUuid`
- destination compressed `messageIds`
- `startMessageId` and `endMessageId` derived from destination IDs
- source summary body and compression provenance fields
- fresh summary row ID
- `status=active`

A candidate-free prefix starts as raw branch history. This covers forks before
the earliest compatible summary and preserves exact source semantics. Normal
request construction sends the raw prefix, and the existing compression
lifecycle owns later summaries for the destination Chat.

## Ready tool-result compaction copy

Tool-result compaction lookup uses persisted message ID. Each copied
`role=tool` message therefore receives fresh copies of its source `ready`
compaction rows.

For every ready row:

- assign the copied tool message ID
- preserve `toolName`, `toolCallId`, `level`, compact content, raw hash,
  character/token metrics, execution metadata, compactor identity/version, and
  attempt provenance
- write a fresh compaction row ID and destination creation/update timestamps
- retain `status=ready`

`pending`, `running`, and `failed` jobs continue with the source Chat. The
destination request builder validates current tool metadata and the copied raw
content hash through the existing selection pipeline. Ready cache copies are
inserted through an internal DAO method dedicated to snapshot reuse, outside
the scheduler claim-state lifecycle.

`toolCallId` remains byte-equivalent across earlier copied assistant and tool
messages, preserving provider protocol pairing. Tool rows and their compactions
after the selected boundary remain source-owned.

## IPC and renderer flow

Add `CHAT_FORK` to shared constants and register one `ipcMain.handle` in the
chat IPC module. The renderer persistence boundary exposes `forkChat(request)`
through the existing IPC client and Chat repository modules.

`AssistantMessageContainer` receives the persisted message ID from
`ChatMessageComponent`. Its fork handler:

1. reads current Chat identity and run state;
2. invokes `forkChat` with the assistant message ID;
3. prepends the returned Chat to `chatList`;
4. restores returned messages into the destination transcript buffer;
5. selects and hydrates the destination shell/model state;
6. reports success or failure through the existing toast surface.

The operation button uses the existing footer operation primitive, a fork icon,
the label `Branch chat`, and the current hover/focus/motion treatment. Pending
assistant previews and active response overlays keep the current footer
visibility contract.

## File targets

Expected implementation touches include:

- `src/types/index.d.ts`
- `src/shared/constants/index.ts`
- `src/main/db/core/Database.ts`
- `src/main/db/dao/ChatDao.ts`
- `src/main/db/mappers/ChatMapper.ts`
- `src/main/db/dao/ToolResultCompactionDao.ts`
- `src/main/db/repositories/ChatBranchRepository.ts`
- `src/main/db/core/DbRuntime.ts`
- `src/main/db/services/DbAppServices.ts`
- `src/main/db/services/ChatService.ts`
- `src/main/db/services/DatabaseService.ts`
- `src/main/db/chat.ts`
- `src/main/ipc/chat.ts`
- `src/renderer/src/infrastructure/ipc/persistence.ts`
- `src/renderer/src/infrastructure/persistence/ChatRepository.ts`
- `src/renderer/src/features/chat/state/chatCoordinatorStore.ts`
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
- `src/renderer/src/features/chat/message/ChatMessageComponent.tsx`
- `src/renderer/src/features/chat/message/message-operations.tsx`
- `src/renderer/src/features/chat/message/assistant-message/`

Tests stay beside their owning DAO, repository, IPC, store, and renderer
components. The implementation may reduce this list by placing orchestration
behind an existing facade while preserving Main-process dependency boundaries.

## Verification

Automated coverage:

1. Fork an uncompressed Chat and verify destination metadata, physical message
   IDs, exact prefix, search projection, skills, and work context.
2. Fork a compressed Chat after its compatible summary and verify one fresh
   active summary containing destination message IDs.
3. Fork at a point with a superseded compatible summary and verify selection of
   the largest compatible candidate.
4. Fork before any compatible summary and verify raw destination history.
5. Copy ready tool-result compactions and verify destination message identity,
   raw-hash compatibility, content, toolCallId, and compactor provenance.
6. Verify source pending/running/failed compactions remain source-owned.
7. Reject a foreign message ID, a missing Chat, a UUID mismatch, and an
   explicitly incomplete assistant boundary; verify full rollback.
8. Invoke `chat:fork` through IPC and verify the returned snapshot.
9. Activate `Branch chat` and verify Chat list insertion, transcript restoration,
   shell/model selection, scroll hint, busy guard, success toast, and failure
   toast.
10. Verify assistant operation accessibility label and hover visibility.
11. Verify strict source-ID cutoff, boundary tool protocol normalization, and
    exclusion of summaries and tool compactions that extend past the boundary.
12. Verify first, consecutive, nested, and maximum lineage title suffixes plus
    rollback without a consumed suffix.

Commands:

```bash
pnpm exec vitest run src/main/db/repositories/__tests__/ChatBranchRepository.test.ts
pnpm exec vitest run src/main/ipc/__tests__/chat.test.ts
pnpm exec vitest run src/renderer/src/features/chat/state/__tests__/chatPerChatState.test.ts
pnpm exec vitest run src/renderer/src/features/chat/message/__tests__/MessageOperations.test.tsx
pnpm run check:main-boundaries
pnpm run check:main-doc-paths
pnpm run test:main-architecture
pnpm run check:renderer-boundaries
pnpm run check:renderer-doc-paths
pnpm run test:renderer-architecture
pnpm build
```

Manual Electron acceptance:

- Fork a recent assistant message from an uncompressed Chat.
- Fork a recent assistant message after multiple compressions.
- Confirm complete historical rendering through the selected assistant message.
- Send a new user message and inspect the request context for summary plus recent
  raw messages plus the new message.
- Confirm a prior ready tool-result compact is selected in the destination run.
- Check Light and Dark footer operation states at full and narrow widths.

Implementation verification on 2026-08-20 passed the focused 44-test suite,
Node and Web type checks, Main and Renderer boundary/doc-path/architecture
checks, `git diff --check`, and the production build. Electron completed Main,
preload, renderer, database migration, and window initialization. Window-level
visual capture confirmed `Branch chat` inside the assistant operation row in
the running Electron window.

## Failure handling and rollback

The database transaction is the rollback boundary. Renderer state changes begin
after a successful IPC result, so Main failures retain the source selection.
Deleting a successfully created destination Chat uses the existing Chat delete
path. Existing database ownership and cleanup rules continue to govern its
physical messages and ancillary rows.

The feature adds nullable lineage columns and additive rows. Reverting renderer
and IPC exposure leaves existing Chat behavior intact; the additive columns
remain readable by older code.
