# ADR-0025: Remember the approval mode for new desktop chats

**Status:** Accepted<br>
**Date:** 2026-09-29<br>
**Related architecture:** [Chat runtime architecture](../architecture/chat-runtime-architecture-current.md)

## Context

The desktop approval selector persisted only the current chat's mode. Ordinary
New Chat reset it to manual, requiring users to repeat their choice.

## Decision

Persist `defaultPermissionApprovalMode` in application configuration, with an
initial value of `manual`. An explicit selection updates this default and, when
a persisted chat is selected, that chat's mode and active run. Selecting the
already checked mode still updates the default and sends the runtime update.

Initialize blank desktop chats from the loaded default, including bootstrap,
New Chat, `/clear`, and blank shell hydration. The first run sends the selected
mode to Main, which persists it on the new chat. Existing chats retain their
own mode. History hydration, ready events, and navigation never write the
application default. Forks and scheduled execution chats inherit their source
chat; CLI/TUI retain their host-specific permission semantics.

Explicit selections are saved sequentially in click order. Read the latest
application configuration and captured chat identity for each queued save.
Display committed values after persistence succeeds. A late save updates its
original chat and run without changing a different selected chat's mode. A
still-blank shell receives the latest saved default. A failed save reports the
failed stage: default, chat, or active-run update. Earlier successful writes
remain committed; reselecting the mode retries the remaining work.

No chat data migration, legacy field mapping, new database column, service, or
IPC channel is introduced. The existing configuration JSON owns the default;
chat records continue to own execution mode snapshots.

## Consequences

- The latest explicit choice survives application restart and seeds new chats.
- Browsing an older chat cannot silently change the new-chat default.
- Configuration and chat persistence are separate writes. An error can leave a
  saved default alongside the chat's previous mode; the error states this and
  the selector continues to show the chat's committed mode.
- Active-run updates retain existing confirmation and event-stream semantics.
- Removing the default read/write behavior restores fixed manual defaults
  without changing existing chat records.

## Verification

Colocated chat-state tests cover blank initialization, explicit re-selection,
history navigation, rapid choices, delayed saves, persistence failures, and
runtime retry. Configuration repository tests cover JSON persistence across
repository instances. Existing chat preparation, branch, scheduler, and run
tests cover the unchanged snapshot and runtime contracts. Electron acceptance
checks cover selector copy, New Chat, `/clear`, history navigation, restart,
Light/Dark, and compact windows.
