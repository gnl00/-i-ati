# ADR 0023: Persist assistant work completion for presentation

Date: 2026-09-22
Status: Accepted

## Context

A non-empty text delta can be a progress update or a final answer. Grouping process
segments at every text boundary creates multiple disclosures and hides work early.
Transient renderer run state alone cannot distinguish incomplete historical runs.

## Decision

Main derives optional `workStatus` and `workEndedAt` message-body metadata from the
agent loop's terminal event and normalized final-step finish reason. The renderer
uses this metadata for one whole-message process disclosure, and holds it open
while the current run is active. No provider-specific finish parsing belongs in UI.

## Consequences

Existing JSON message persistence carries the fields without a schema migration.
Legacy histories retain a conservative content/error/pending-tool fallback because
prior termination reasons cannot be reconstructed. The metadata is presentation
only; it does not change provider replay or agent continuation. Removing the UI
change can leave the optional fields harmlessly in stored messages.

Normal completion collapses by default; failure, interruption and incomplete
responses remain inspectable. User disclosure choices take precedence over the
automatic default. The detailed contract is in
[assistant work presentation](../chat/assistant-completed-work-group.md).
