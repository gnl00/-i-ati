# Documentation

Project documentation is organized by purpose and lifecycle. Start with the
current contract or architecture document, then use work records and archives
for implementation context and history.

## Lifecycle directories

| Directory | Contents |
| --- | --- |
| [`specs/`](specs/README.md) | Active behavior, protocol, security, and tool contracts |
| [`architecture/`](architecture/README.md) | Current structure, boundaries, and data flow |
| [`decisions/`](decisions/README.md) | Architecture decision records |
| [`guides/`](guides/README.md) | Development, testing, and troubleshooting procedures |
| [`work/`](work/README.md) | Active plans, investigations, and tasks |
| [`reference/`](reference/README.md) | External source indexes and retained reference material |
| [`archive/`](archive/README.md) | Completed, retired, cancelled, and superseded records |

The [documentation governance spec](specs/documentation-governance.md) defines
classification, metadata, lifecycle, archive, and link rules.

## Current topic collections

The following content remains grouped by topic while it receives content-aware
classification. Each file should move to a lifecycle directory when its owning
capability is reviewed.

- `chat/`: chat runtime, rendering, scrolling, compression, and typewriter
- `data/`: durable data capabilities
- `features/`: user-facing feature contracts and implementation notes
- `integrations/`: external systems, MCP, web access, and skills
- `internal/`: logging and internal operations
- `ui/`: renderer interaction and visual implementation

## Recommended entry points

- [Renderer architecture](architecture/renderer-architecture.md)
- [Chat runtime architecture](architecture/chat-runtime-architecture-current.md)
- [Plugin system architecture](architecture/plugin-system-design.md)
- [Tool definition workflow](guides/development/tool-definition-workflow.md)
- [Tailwind CSS v4 syntax rules](guides/development/tailwindcss-v4-syntax-rules.md)
- [Documentation decisions](decisions/README.md)
- [Active work](work/README.md)
- [Migration inventory](archive/migration-inventory.md)

## Maintenance flow

1. Update an Active spec when behavior or a contract changes.
2. Synchronize current architecture and executable guides with implementation.
3. Record durable choices as ADRs.
4. Track bounded delivery under `work/` with explicit exit criteria.
5. Preserve completed or superseded records under `archive/YYYY/`.
