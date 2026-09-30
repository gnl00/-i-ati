# Documentation

Project documentation is organized by purpose and lifecycle. Start with the
current contract or architecture, then use active work and archives for delivery
context. The [governance spec](specs/documentation-governance.md) defines lifecycle,
metadata and link rules; the [maintenance guide](guides/development/documentation-maintenance.md)
describes the review and verification procedure.

## Lifecycle directories

| Directory | Contents |
| --- | --- |
| [specs](specs/README.md) | Active behavior, protocol, security and tool contracts |
| [architecture](architecture/README.md) | Current structure, ownership and data flow |
| [decisions](decisions/README.md) | Durable architecture decisions |
| [guides](guides/README.md) | Development, testing and troubleshooting procedures |
| [work](work/README.md) | Open plans, investigations and remaining acceptance |
| [reference](reference/README.md) | Bounded external source cards and project research |
| [archive](archive/README.md) | Completed, retired, cancelled and superseded records |

## Current topic collections

Useful topic documents remain here until their owning capability is reviewed.
Each collection has an index. Current rules should have one authoritative entry;
retired implementation records belong in archive.

- [Chat](chat/README.md): rendering, compression, streaming and presentation
- [Data](data/README.md): Memory and durable data capabilities
- [Features](features/README.md): feature behavior
- [Integrations](integrations/README.md): skills, MCP and tool integrations
- [Internal operations](internal/README.md): logging and diagnostics
- [Plugins](plugins/README.md): request payload extensions
- [UI](ui/README.md): component and interaction behavior

## Recommended entry points

- [Renderer architecture](architecture/renderer-architecture.md)
- [Main-process architecture](architecture/main-process-architecture.md)
- [Agent runtime](architecture/agent-runtime/README.md)
- [Chat runtime](architecture/chat-runtime-architecture-current.md)
- [Chat transcript scrolling](architecture/chat-transcript-scrolling.md)
- [CLI Host implementation](guides/development/cli-host-implementation.md)
- [ati TUI 使用与实现](guides/development/ati-tui.md)
- [CLI thinking configuration](guides/development/cli-thinking-implementation.md)
- [Workspace paths and tool failures](guides/development/workspace-path-tool-failure-implementation.md)
- [Skills and installation recovery](integrations/skills.md)
- [Web Search and Fetch](guides/development/web-search-and-fetch.md)
- [Memory current implementation](data/memory-implementation.md)
- [Typewriter verification](guides/testing/typewriter.md)
- [Native run notifications](architecture/native-notifications.md)
- [Tool definition workflow](guides/development/tool-definition-workflow.md)
- [Tailwind CSS v4 rules](guides/development/tailwindcss-v4-syntax-rules.md)
- [Active work and acceptance](work/README.md)
- [Migration inventory](archive/migration-inventory.md)

## Maintenance flow

1. Update the current spec when behavior or a contract changes.
2. Synchronize architecture and executable guides with implementation.
3. Record lasting tradeoffs as ADRs with a unique identifier.
4. Keep open work and acceptance gaps explicit; implementation alone does not close exit criteria.
5. Archive completed or superseded records and update inbound links and indexes.

The 2026-09-29 cleanup and classification decisions are recorded in the
[migration inventory](archive/migration-inventory.md#2026-09-29-content-review).
