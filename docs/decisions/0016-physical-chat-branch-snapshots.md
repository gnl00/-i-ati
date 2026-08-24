# ADR-0016: Physical chat branch snapshots

**Status:** Accepted<br>
**Date:** 2026-08-20<br>
**Related architecture:** [Chat runtime architecture](../architecture/chat-runtime-architecture-current.md), [Renderer architecture](../architecture/renderer-architecture.md)<br>
**Related work:** [Assistant message chat branch fork plan](../work/plans/chat/chat-branch-fork-plan.md)

## Context

Users need to continue a conversation from any persisted terminal assistant
message while keeping the original Chat intact. The new Chat must render the
visible historical prefix and produce the same next-request context as the
source did at that point, including a compatible compressed summary and ready
tool-result compactions.

Messages, compressed summaries, and tool-result compactions use database row
identity as part of their ownership and lookup contracts. A branch therefore
needs branch-local row identities while preserving provider protocol fields
such as `toolCallId` inside message bodies.

## Decision

`ChatBranchRepository` owns one immediate SQLite transaction that creates a
physical snapshot through a selected completed assistant message. The selected
source message ID is the strict inclusive cutoff, so every source row after it
stays in the source Chat. The repository creates a new Chat, copies the strict
prefix with fresh autoincrement IDs, syncs message search, copies skills and
work context, and records immediate lineage on the destination Chat.

When the boundary assistant body contains protocol `toolCalls`, its destination
copy removes that field while retaining content, segments, model metadata,
timestamps, and token information. Tool-call segments remain available for
historical rendering, and the normalized terminal row can safely precede the
next user request. Tool-result rows after the selected message ID stay outside
the snapshot.

The destination model comes from the selected assistant message, with the
source Chat model as fallback. Workspace, user instruction, permission mode,
and loaded skills retain their source values. The destination title uses the
lineage root's current title plus the next flat suffix, for example `abcd (1)`,
`abcd (2)`, and `abcd (3)` for a nested fork. Suffix allocation scans that
lineage and runs inside the immediate transaction. Host bindings and active run
state stay scoped to the source Chat.

Summary inheritance selects the largest source summary whose complete message
set is contained in the fork prefix. The transaction stores one independent
active summary with destination message IDs. A prefix without a compatible
summary uses copied raw history.

Ready tool-result compactions are copied to fresh destination tool-message IDs
for tool rows inside the strict prefix after validating each raw content hash.
Earlier copied assistant tool calls and tool results preserve the same
`toolCallId`, so provider protocol pairing stays intact. Compactions belonging
to tool rows after the boundary and pending or failed work remain source-owned.

The `chat:fork` IPC result returns the destination Chat and copied messages.
Renderer installs that snapshot into the ordinary Chat list and transcript
buffer, selects its model and shell, and scrolls to the fork boundary.

## Consequences

- Each branch is an ordinary self-contained Chat with independent message,
  summary, and compact-result rows.
- Existing history rendering and request preparation paths operate on the
  branch without branch-aware lookup logic.
- Branch creation cost grows with the copied prefix size and stays bounded by
  one transactional write.
- Storage grows with each branch snapshot.
- Immediate lineage supports diagnostics and future branch navigation without
  making source rows part of destination runtime ownership.
- Flat lineage title suffixes keep sibling and nested branches distinguishable
  in the Chat list.
- Transaction rollback removes every partial destination row when validation
  or persistence fails.

## Verification

Acceptance covers physical prefix IDs, lineage and model fallback, summary
selection and destination ID rewriting, raw-history fallback, ready compact
hash validation, skill/work-context copying, search projection, typed boundary
errors, transaction rollback, IPC registration, renderer branch operation,
shell/transcript/model switching, and Main/Renderer architecture checks.
