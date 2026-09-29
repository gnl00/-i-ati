# ADR-0026: Main-owned tool confirmation lifecycle

- Status: Accepted
- Date: 2026-09-29

## Context

Desktop IPC, Telegram and TUI constructed independent default RunService runtimes. Each owned a different pending-confirmation map and active-run registry. Even when a decision reached its owner, confirmation settlement only resumed a Promise; Chat inferred dismissal from execution events while Telegram changed its own buttons in the callback. Lost events, remote decisions and obsolete buttons produced inconsistent states.

## Decision

Default RunService instances share one lazily constructed runtime per Main process. Explicit dependency injection remains isolated. ToolConfirmationManager owns versioned approval records with independent confirmationId values and run/chat/tool identity. All decision paths transition that record once, publish required/resolved facts and return the actual authoritative result. Execution remains a separate lifecycle.

Chat subscribes before reading a versioned snapshot and reconciles newer events. Telegram subscribes directly to the Main approval manager through RunService, independently of which host starts the run, retains message associations, retries failed edits and reconciles after gateway restart. TUI consumes the same result and event contract. Plan review and subagent waiting presentation derive from the Chat approval projection.

## Persistence and compatibility

Active approval is in-memory only. Required and resolved facts use existing persistent run-event traces; no database migration is introduced. Retain up to 500 terminal records, preserving all pending entries. Process restart invalidates old authorizations. Old toolCallId-only IPC payloads are rejected; old Telegram buttons return not_found and are cleared. Both IPC channel aliases remain registered, but neither accepts an unscoped decision.

Telegram approval rights follow existing gateway chat policy plus the frozen active chat binding endpoints and trusted originating peer/topic. Each endpoint has its own message projection; a winner settles every projection. The actor identity is attached by the trusted adapter. Group participation policy is unchanged.

## Consequences

Cross-host approvals, cancellations and automatic approval now reach the same runtime. Approval receipt no longer depends on execution starting. Snapshot watermarks, chat generations and per-record versions prevent stale presentation from reviving resolved prompts.

Telegram network failures affect presentation only. Retries require the gateway to be available, and the oldest terminal message associations are dropped beyond the bounded retention window. Delivery is eventually consistent; Main decisions are atomic and never retried as new executions.

No event-sourcing service, durable execution resumption, new configuration or external dependency is added. Runtime ownership is process-local; CLI/TUI started in another process retains its own runtime.

Implementation and verification details are in [the tool confirmation flow](../architecture/command-confirmation-flow.md).

## Delivery records

Telegram send tools persist explicit telegram_delivery display records. A shared predicate excludes these and recognizable legacy copies from request history and compression inputs while keeping normal Telegram conversation turns. This preserves tool-call/result adjacency without deleting audit records or changing database schema.
