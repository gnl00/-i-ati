# ADR 0055: Telegram current conversation

Status: Accepted

## Context

After a scheduled push, ordinary Telegram input continued the session established
by `/newchat`. Explicit replies selected the pushed conversation for one run only.
Users expect subsequent input to follow the conversation most recently visible in Telegram.

## Decision

Persist routing in `telegram_conversation_routes`, keyed by bot, peer, topic and
Telegram message ID. The empty message ID stores the current conversation; real
message IDs preserve origins for explicit replies. Foreign keys remove routes
when the source chat is deleted. No existing transcripts or bindings are migrated.

Ordinary inbound input uses the current conversation, falling back to the existing
host binding when no valid cursor exists. An explicit reply first checks the new
message route, then legacy delivery receipts, and selects that source for subsequent
input. `/newchat` creates a chat and replaces the cursor. Model, workspace and status
commands operate on the current cursor without treating command replies as switches.

Confirmed proactive text delivery and newly sent assistant text advance the cursor.
Streaming edits, private drafts, tool status notifications, background execution,
desktop edits and unsuccessful sends do not. Partial delivery with confirmed chunks
advances it because the user received content. Concurrent sends advance in delivery
completion order; the last recorded delivery wins. A later delivery can supersede
`/newchat` or an explicit reply. Each request keeps its selected chat once submitted.

Keep recipient associations and legacy bindings independent from the cursor so that
changing the active conversation does not remove existing outbound destinations.
Each chat retains its own history; no cross-chat transcript concatenation is added.

## Failure and compatibility

A database failure after sending still reports delivery success with local recording
failure and the existing instruction not to resend. Responder recording failures use
the existing event error logger and never retry the network send. Old proactive
messages remain replyable through receipts; older ordinary replies without recorded
origins fall back to the current conversation. The legacy host binding fallback
retains its existing bot-independent behavior; new cursors and message routes are
strictly bot scoped. Removing the new code leaves existing bindings usable.

## Verification

Targeted tests cover source routing, persisted cursors, bot/peer/topic isolation,
source deletion, explicit reply continuation, `/newchat`, pending/failed/partial sends,
streaming edits and database failures after delivery. Live Telegram and visual
Electron acceptance are separate from these automated checks.

Implementation checks (2026-10-29):

```sh
pnpm exec vitest run src/main/hosts/telegram src/main/services/telegram src/main/tools/telegram src/main/db/dao/__tests__/ChatHostBindingDao.telegram.test.ts src/main/db/repositories/__tests__/ChatHostBindingRepository.test.ts src/main/db/core/__tests__/Database.test.ts
pnpm test:coverage
pnpm run typecheck:node
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run check:main-doc-paths
pnpm exec eslint <changed TypeScript files>
git diff --check
```

The targeted run passed 158 tests. Full coverage passed 3034 tests with 37 skipped;
line coverage was 73.76%. Node typecheck, architecture boundaries, all eight Main
architecture tests and documentation paths passed. ESLint remains blocked by 24
pre-existing errors in the selected files; comparing each file with HEAD found no
additional error diagnostics. Existing formatting warnings remain.

An isolated Electron process with the production schema, native SQLite DAO and
Telegram adapter passed default selection, scheduled-conversation selection,
explicit reply continuation, a new-chat cursor, reopening the database and bot
isolation. Its DB facade was bridged to the real DAO and initial binding resolution
was stubbed; it made no network requests. The sandboxed launch aborted; the permitted
isolated launch passed after fixing the temporary script's module resolution.
Live Telegram delivery and user-facing Electron flows remain unverified.
