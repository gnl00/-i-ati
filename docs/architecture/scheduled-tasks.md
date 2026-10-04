# Scheduled task architecture

Status: Current<br>
Owner: Main process and chat renderer maintainers<br>
Last verified: 2026-10-05<br>
Related decisions: [ADR-0010](../decisions/0010-persisted-cron-schedule-occurrences.md), [ADR-0021](../decisions/0021-scheduled-fresh-execution-chats.md), [ADR-0041](../decisions/0041-scheduled-misfire-window.md)

## Data model

```text
schedule action=create / action=update
  -> CronScheduleCalculator
  -> planningDb facade
  -> scheduled_tasks 1 ---- N scheduled_task_runs 1 ---- N scheduled_task_run_attempts
                               |                            |
SchedulerService timer --------+                            +-> fresh execution chat
  -> atomic claim -> attempt -> chat bind -> RunService -> run events
                                                            +-> chat renderer
```

`scheduled_tasks` owns the user-facing definition: `once` or `cron`, goal,
payload, timezone, expression, next wake time, status, retry limit, last-run
summary, and run count. `scheduled_task_runs` owns an occurrence's scheduled
time, retry wake time, claim state, attempt count, submission identity, result,
error, and `execution_chat_uuid`. `scheduled_task_run_attempts` preserves each
attempt's submission and execution chat association under the stable occurrence
ID. The association table has a unique `(run_id, attempt)` key and cascades
when an occurrence is trimmed or its task is deleted.

A new attempt clears `execution_chat_uuid` before preparation; prior attempt
associations remain queryable. The nullable column and association table are
added idempotently to the current occurrence schema while preserving its rows.

The current schema requires `schedule_type`. Earlier releases reset the prior
table generation before creating the definition-and-occurrence schema; current
startup no longer accepts that earlier shape.

The database enforces unique `(task_id, scheduled_for)` identity and one active
occurrence per task. A due claim changes the occurrence from `pending` to
`running` inside a SQLite transaction. The parent enters `running` in the same
transaction. Claims accept due `next_attempt_at` values at most 15 minutes old,
including the exact boundary. Older rows remain pending until reconciliation
settles them, so a direct claim cannot allocate an execution chat for them.

## Cron contract

The tool accepts standard five-field expressions:

```text
minute hour day-of-month month day-of-week
```

Cron schedules require an IANA timezone. The calculator prefixes seconds with
`0` and uses `cron-parser` strict mode. Expressions use minute precision.
Day-of-month and day-of-week share strict exclusive specificity. Numeric cron
syntax, ranges, lists, and steps form the active grammar.

One-time creation uses `goal + run_at`, with `run_at` expressed as ISO-8601
including `Z` or a numeric timezone offset. Recurring creation uses
`goal + cron_expression + timezone`. Updates preserve the schedule type and
atomically replace its pending occurrence. Creation and updates wake the
scheduler so its due timer tracks the new earliest time immediately.

## Execution lifecycle

The scheduler keeps a fallback interval, an exact next-due timer, and an
in-process `isTicking` guard. SQLite remains the cross-caller claim authority.

1. Reconcile overdue pending occurrences, then claim one due occurrence.
2. Assign a submission ID and increment the occurrence attempt.
3. Resolve the current source chat and execution model.
4. Validate the final instruction and model reference, prepare the workspace,
   recheck the source settings, and atomically insert an empty execution chat
   with its attempt association and current run chat reference.
5. Execute through `RunService` with `source: schedule` and the execution chat identity.
6. Finish the occurrence and update the source task summary.
7. For cron, calculate one occurrence strictly after the current wall clock.
8. Repeat up to five serial executions, checking wall time before each claim.

The first startup tick and every later claim reconcile due pending rows. For an
unattempted cron occurrence, the calculator finds the latest schedule time at or
before the current wall clock, including an exact match. An older persisted row
finishes as `skipped`; one replacement targets that latest time if it falls
within the 15-minute grace window, or the next future time otherwise. Missing
intermediate slots are folded without materializing their rows. Future rows and
running occurrences are preserved.

Expired one-time occurrences finish as `skipped`. Retry lateness uses
`next_attempt_at`, retaining the original `scheduled_for` and retry budget.
An overdue cron retry finishes as `skipped` and folds to a newer due cron
occurrence within grace, or advances to the future. Fresh retries retain their
occurrence and are not folded to another cron slot.
Skipping consumes no attempt, creates no chat, sends no native failure
notification, and preserves earlier attempt/chat associations. The skipped row
and its replacement share the same SQLite transaction. Skipped rows count in
the parent occurrence summary and the bounded terminal history.

Failures retry after 30, 60, 120 seconds and continue doubling to a 15-minute
cap. `max_attempts` counts total attempts for each occurrence. A final one-time
failure closes its parent. A final recurring failure records the failed run and
advances its parent.
Retryable failures update the parent's latest occurrence scheduled time, failure status and
error while it remains pending; `run_count` increments only at occurrence
settlement. Invalid persisted cron definitions fail independently during
reconciliation, so other due tasks can continue.

On timezone offset transition days, latest-time reconciliation follows the
forward parser from local midnight. This bounds the scan to one day's minute
slots and preserves the existing spring-gap and repeated-hour behavior; other
days use the reverse parser directly.

Every occurrence attempt creates a new chat after its attempt row is started.
The source chat supplies the current workspace. Every new execution chat stores
the resolved model, an empty transcript and session instruction, `NewChat` as
its initial title, and `auto` as its permission approval mode. Run submission
uses that same mode, including retries, independently of the source chat and
the app default. Normal post-run title generation names the chat from its
instruction and reply; title failures retain `NewChat` without failing the
occurrence. Scheduled time and attempt number remain in execution history. Source history, summaries,
attachments, skills, fork metadata, and host bindings remain outside the
execution chat. Cancellation detected during workspace preparation prevents
chat allocation. Chat insertion and attempt binding share one SQLite
transaction; errors roll back the entire operation. A bound execution chat
remains available through normal chat lifecycle controls, including when
cancellation arrives before model output.

Prompt, model reference, and effective instruction validation precede chat
allocation. After asynchronous workspace preparation, the scheduler verifies
that the source chat still exists with the same workspace;
changes settle through the normal failure and retry policy.

## Cancellation and recovery

Cancellation updates the parent and active occurrence transactionally. A
running occurrence exposes its persisted `submission_id` to
`RunService.cancel()`. The execution finalizer reads the parent again before a
success write, preserving cancellation as the terminal authority. Cancellation
during workspace creation is checked after the await and again by the
conditional attempt bind, so a cancelled run cannot start a fresh model
execution.

Application startup scans `running` occurrences. Recovery records them as
failed with `Interrupted by application restart`. One-time parents finish as
failed. Recurring parents receive one next future occurrence. This policy
prioritizes avoiding duplicated external side effects.

After the scheduler starts, `MainApplication` registers `powerMonitor.resume`
to call `schedulerService.wake()`. This immediately rechecks pending time after
system sleep; the fallback interval and due timer continue to provide normal
wakeups. Shutdown removes the listener.

## Events and renderer

- `schedule.started` carries the source task, occurrence, submission ID, attempt,
  and execution chat entity. Its envelope targets the execution chat.
- `schedule.run_finished` carries the terminal occurrence and current parent;
  its envelope targets `run.execution_chat_uuid`, with source-chat fallback for
  legacy runs.
- `schedule.updated` targets the source chat and refreshes the plan board
  definition.
- message events target the execution chat and deliver its persisted messages.

The renderer binds the normal run event stream after `schedule.started`, routes
messages and lifecycle state by execution chat UUID, and applies the execution
chat to the background chat list without changing the selected shell. Normal
run terminal events clear each attempt, including retryable failures. The task
board keeps source-chat ownership and labels recurring definitions with
expression, timezone, next run, and last-run status.

Occurrence completion preserves subscriptions while blocking compression is
pending. The normal maintenance completion event settles the chat phase;
background title updates retain their own subscription until completion.

## Native notifications

Scheduled executions enter the main-agent runtime with `source: schedule`.
`DefaultMainAgentRuntimeRunner` registers `AgentNotificationSink` for scheduled
and interactive desktop runs. Telegram and other host sources retain their
host-owned notification paths.

The sink consumes one agent-loop terminal event. `loop.completed` produces a
completion notification; `loop.failed` produces a failure notification when
the current attempt exhausts the occurrence retry budget. `SchedulerService`
passes `nativeNotification.notifyOnFailure: false` for retryable attempts and
`true` for the final attempt. A successful attempt always produces the
completion notification. This gives each occurrence at most one native
notification across all retries. Every attempt carries the stable occurrence
run ID as `occurrenceKey`; the sink keeps a bounded 1000-key process-local
deduplication set for cross-attempt and repeated terminal delivery.

Failures can also settle before the agent loop starts. Missing chats, unresolved
models, and chat preparation errors reach `SchedulerService` before
`DefaultMainAgentRuntimeRunner` creates its event sink. On the final attempt,
the scheduler calls the notification module's direct terminal-failure entry
with the same occurrence key. The direct entry shares foreground gating,
deduplication, native display, badge, strong-reference, and click-to-focus
behavior with `AgentNotificationSink`.

The fallback is limited to execution attempts that have not returned
successfully. An explicit execution-settled flag keeps later cron calculation
and persistence errors on the scheduler state path without presenting them as
agent execution failures. Startup recovery continues through persisted
occurrence state and schedule events.

Foreground gating keeps visible, focused sessions on the existing renderer
feedback path. Background, minimized, and unfocused sessions receive the native
notification with summary text, badge increment, and click-to-focus behavior.
Streaming message updates remain on the renderer event path.

## Operational data

Scheduler control-plane logs route through `createSchedulerLogger()` into
`scheduler-YYYY-MM-DD.log`. Every task keeps its latest 100 terminal occurrence
rows. The task row provides the efficient board projection; occurrence history
remains available through the planning database facade.

## Tasks chat list

The task board uses a master-detail layout. Selecting a task displays its full
goal, status, scheduled time, schedule, timezone, execution link and error in the
adjacent detail panel. Execution errors appear in an inline muted red badge beside the current state, with the full error available on hover or keyboard focus; recurring tasks awaiting their next run retain Pending and identify the previous run failure. Skipped one-time tasks appear in History with a neutral `Skipped` state and a removable entry. Recurring tasks with a skipped previous occurrence show `Last run skipped` and the reason with existing neutral surfaces. The execution chat link aligns with the other detail values. The first visible task is selected initially; selection
survives live updates and falls back to the first visible task when filtering or
removal hides it. Cancel confirmation and execution-chat navigation remain
independent of selection. At container widths of 640px or less, the same detail
panel follows the task list within one scrolling board, keeping every action
reachable. Desktop task and detail columns scroll independently.

The Tasks page retains its schedule board and adds a separate **Chats**
list below it. Tasks uses 2/5 and Chats 3/5 of the available content height with independent list scrolling,
so filter changes preserve the chat section position. All/Active/History filter only the schedule board; scheduled chats
sort by chat update time and have an independent title search. The search control
expands within the flexible space beside the fixed Chats heading; its container
allows the shared search field to grow instead of clipping it to icon width.
Both Tasks and the Chat Sheet reuse the `ChatSearch` actions layout, sharing
the borderless surface, controls, and focus lifecycle. Their parent grids own
width transitions; Tasks filters titles locally while the Chat Sheet retains
its ranked title/message search.
The Tasks grid animates between length tracks (`36px` and
`min(315px, 100%)`); changing the second track from a length to `minmax()`
prevents continuous interpolation in Chromium. Reduced motion disables the
transition.

The opt-in Electron regression samples actual opening and closing widths in
Light/Dark at 315px and 640px, including reduced motion. Run it against an
isolated development profile with its remote debugging port enabled:

```sh
ATI_SEARCH_TEST_CDP_URL=http://127.0.0.1:9341 pnpm --config.verify-deps-before-run=false exec vitest run src/renderer/src/features/chat/schedule/__tests__/SchedulerChats.animation.test.ts
```

Without this environment variable, the runtime test is skipped; ordinary DOM
tests do not validate Chromium animation interpolation.

Chat rows use spacing and shared hover/focus surfaces without horizontal
separators. Opening chevrons appear on hover or keyboard focus. Selecting a chat row
opens the existing transcript using the normal workspace and hydration path.
Load errors, empty states and navigation failures remain visible. Selection
request and epoch guards prevent an obsolete asynchronous open from taking over.

`chats.is_scheduled` persists execution origin independently of bounded occurrence
history. The execution insertion transaction writes it, and startup backfills
existing UUID associations after schema initialization. Chat updates preserve it.
The shared all-chat store retains both kinds for background events; the ordinary
chat list and its scoped title/message search exclude scheduled origin. Forks use
the ordinary default. See [ADR-0032](../decisions/0032-scheduled-chat-list-ownership.md).

## Misfire verification (2026-10-05)

The regression cases were observed failing before their fixes: overdue claims,
stale one-time tasks/retries, cron folding, serial wait expiry, invalid-cron
isolation, retry summary after skip, and spring-forward latest-time calculation.

Automated checks passed:

```sh
pnpm test:coverage
pnpm run typecheck
pnpm run check:main-boundaries
pnpm run test:main-architecture
pnpm run check:renderer-boundaries
pnpm run test:renderer-architecture
pnpm run check:main-doc-paths
pnpm run check:renderer-doc-paths
pnpm exec electron-vite build
git diff --check
```

Coverage execution: 355 files and 2642 tests passed; 30 tests skipped, including
native and opt-in runtime tests. The native SQLite/IPC checks were also executed:

```sh
ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  ./node_modules/vitest/vitest.mjs run \
  src/main/db/dao/__tests__/ScheduledTaskDao.test.ts \
  src/main/db/repositories/__tests__/ScheduledExecutionChatTransaction.test.ts \
  src/main/db/core/__tests__/ScheduleSchemaUpgrade.test.ts \
  src/main/ipc/__tests__/scheduled-tasks.test.ts
```

Those four files executed 24 tests successfully. ESLint was run on all changed
source files. Its 14 errors match HEAD: six existing errors in
`MainApplication.test.ts` and eight in `db/services/DatabaseService.ts`; other
changed files have no lint errors. Existing Prettier style warnings remain.

An isolated Electron profile also passed restart acceptance: stale one-time
rows became skipped, cron rows advanced to the future, attempt count stayed
zero and no execution chats were created. A simulated
`powerMonitor.emit('resume')` immediately settled a newly inserted stale row;
shutdown removed the listener. Tasks was checked in Light/Dark at native
1000px and 500px window widths, with eight screenshots and no document
horizontal overflow. Physical hardware sleep/resume remains unverified.
