# ADR 0049: Persist request context snapshots for Chat replay

Date: 2026-10-19

Status: Accepted

## Context

Chat materializes ephemeral runtime records into a suffix on the current user
protocol message. Previously that suffix existed only within a run. Reloading
persisted history for the next turn removed the suffix from the earlier user
message, breaking the otherwise reusable provider prefix at that point.

## Decision

Store the formatted suffix in the existing user message JSON as the optional
`requestContextSnapshot` string before starting the run. Preparation and runtime
share `formatRequestContext`; runtime prefers the stored string over reformatting
pending context. The final user record owns the suffix, including when a persisted
vision observation follows the original question. Snapshot metadata travels through
ChatContextMapper into ContextUserRecord and is appended only in protocol projection.

The snapshot is captured once per new turn; its visible content and segments are
unchanged. Failure to persist stops preparation before a model request is sent.
The value records prepared model context, not proof that a provider accepted a
request. Chat, Telegram and scheduled inputs using Chat preparation share this
behavior; CLI and subagents keep their existing context ownership.

Each new suffix explains that historical snapshots describe their accompanying
turn, the latest snapshot supplies current state, and snapshots do not renew past
instructions or authorizations. Replaying does not replace old state with current
profile, environment, memory, or skill content.

## Consequences

- Existing JSON serialization and chat deletion/fork behavior carry snapshots;
  no SQL schema migration or legacy backfill is needed.
- Additional runtime context is retained locally with the message. It follows the
  existing chat history lifetime; deleting a chat removes its snapshots as well.
- Message UI and search continue to use original content, not snapshot metadata.
- History grows by the saved suffix per turn. Existing request token budgeting,
  compression and whole-history omission continue to apply.
- This fixes user-suffix stability. Provider routing/eviction, tool or system
  changes, and assistant-step reconstruction can still limit cache reuse.

## Verification

Regression tests cover a database JSON round trip and a subsequent turn with new
runtime state, exact suffix persistence through preparation, no duplicated suffix,
and unchanged visible question. Existing context and Chat suites cover legacy
history, tool continuation, image observations and budgeting.
