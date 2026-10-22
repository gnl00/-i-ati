# ADR-0051: Persistent subagent sessions, runs and messages

**Status:** Accepted<br>
**Date:** 2026-10-22<br>
**Extends:** [ADR-0050](0050-supervised-subagent-lifecycle.md)<br>
**Related:** [Subagent architecture](../architecture/subagent-mvp.md)

## Decision

Persist three additive tables in the profile database: subagent_sessions owns
stable child identity and parent chat, subagent_runs owns each execution and its
immutable terminal facts, and subagent_messages owns ordered durable delivery
receipts. Chat deletion cascades these records. Services use the subagents domain
facade. Controllers, subscriptions, concurrency leases and host channels stay in
process. No credential or live object is stored in run inputs.

Snapshot model reference, workspace, role and task context at admission; reject
admission when initial persistence fails. Save terminal transcript, partial output,
usage, status and a queryable run reference. Store only each run's new transcript
records and its previous-run reference; reconstruct history in order with record-ID
deduplication instead of duplicating all history at every continuation. Later storage failure is separate
from execution status and appears as persistence_error. It cannot authorize a
continuation with a stale record. Querying an old run never selects a newer run.
The child's revision increases across runs, and waits retain their captured run.

Startup marks unfinished runs interrupted only when their recorded process owner
has disappeared, or when they belong to the newly initialized process ID. Another
live PID or an unverifiable owner is preserved. PID reuse by another live process
can conservatively leave a record unresolved; this process does not take ownership
or claim to provide a distributed lease. No recovery starts model or tool work.
The initializer runs once before admissions in each app process.

send_message saves information. An active child consumes it through the existing
loop steering checkpoint after complete tool batches; idle children remain idle.
followup_task and resume require a task and stable message ID. They reject busy
children and create a new run on the same child, preserving worker history.
Message IDs are namespaced by child; the same receipt/content returns its existing
run on retry. Conflicting reuse fails. Run admission and task receipt binding are
one SQLite transaction. Pending informational inbox limits are 16 items and
32 KiB per message. Admission checks and insertion acquire the SQLite writer lock
in one immediate transaction. Explicit task receipts do not consume informational
slots, so a full idle inbox can still be consumed by a followup.
A new run receives the current parent approval mode and cancellation signal,
while keeping its assigned model, role and workspace.

Delivery, context consumption, execution completion and task acceptance are
separate facts. Interrupted deliveries become ambiguous and are not automatically
redelivered. Explicit continuation restores recorded context. Missing results of
old tool calls become uncertainty records; no stored call is dispatched again.
External operations may already have happened before a crash. The explicit new
task must inspect side effects before deciding another operation; this is not an
exactly-once external-effect protocol. Completion never wakes a stopped parent.

CLI-only models may use the matching live parent's prepared request specification.
The worker replaces parent policy/tool exposure, and credentials stay in that live
channel. After the channel disappears, the saved model reference must resolve
normally; unavailable ephemeral credentials do not trigger a backend substitution.

## Verification and rollback

Cover durable receipts, duplicate/conflicting IDs, active and idle messaging,
busy rejection, repeated continuation, stale-run cancellation, revision waits,
parent policy refresh, missing tool results, SQLite ownership recovery, chat
cascade deletion, read-only snapshots and renderer rehydration. Test actual SQLite
under Electron in addition to Node mocks. All tables are additive; the previous
build can ignore them, while existing chat/message data stays unchanged. New
worker tools must not receive recursive delegation or implicit team privileges.
