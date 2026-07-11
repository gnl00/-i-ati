# Renderer architecture

Status: Current<br>
Owner: Renderer maintainers<br>
Last verified: 2026-07-11<br>
Scope: `src/renderer/src`<br>
Related specs: [Documentation governance](../specs/documentation-governance.md)<br>
Related implementation: [`src/renderer/src`](../../src/renderer/src)<br>

## Directory boundaries

The renderer uses domain-first feature ownership with explicit application,
shared, infrastructure, and development boundaries.

| Directory | Responsibility |
| --- | --- |
| `app/` | Bootstrap composition and the application shell |
| `features/` | Complete user-facing capabilities with colocated UI, state, hooks, services, and tests |
| `shared/` | Stable UI primitives, reusable components, assets, providers, contracts, hooks, libraries, and logging |
| `infrastructure/` | Electron IPC clients, renderer persistence adapters, application configuration orchestration, and renderer tool bridges |
| `dev/` | Dormant test pages and visual experiments excluded from production composition |

`main.tsx` is the renderer entry point. It initializes logging and the shared
application configuration store, injects runtime state accessors into renderer
tool bridges, then mounts `app/App.tsx`. The application shell composes feature
entry points such as chat, settings, and artifacts. Shared providers own stable
cross-feature contexts such as the active color theme.

## Feature ownership

`features/chat/` owns the chat shell, input, message rendering, runtime,
schedule, transcript state, confirmations, and welcome surface. Settings owns
provider, MCP, skill, plugin, memory, and knowledge-base management. Artifacts,
assistants, subagents, task planner, and workspace each own their renderer-side
state and behavior.

Tests remain beside the capability they verify. Every top-level feature owns an
`index.ts` public entry. Feature code imports another feature through that
entry, while imports inside the same feature may address its internal modules.
Reusable primitives move to `shared/` when ownership is broader than one
feature.

## Infrastructure boundaries

`infrastructure/ipc/` exposes a small capability-based module set:

- `system.ts` for window, path, directory, and emotion operations
- `integrations.ts` for MCP, skills, web, Telegram, and knowledge base
- `persistence.ts` for durable entity operations
- `providers.ts` for provider configuration and model discovery
- `run.ts` for chat-run commands and maintenance
- `events.ts` for shared IPC event subscriptions

`infrastructure/ipc/index.ts` is the public aggregation entry. The event module
maintains one Electron listener per channel and fans events out to renderer
subscribers. `infrastructure/persistence/` contains renderer adapters that call
the main-process database through this IPC boundary; renderer code does not own
the database connection.

`infrastructure/config/appConfig.ts` owns configuration hydration, persistence,
provider mutations, and configuration event subscriptions. Shared model
selectors consume the stable `shared/config/modelTypes.ts` contract, keeping
their dependency surface independent from configuration side effects.

Renderer tool bridges read optional chat and configuration context through the
accessor contract in `infrastructure/tools/runtimeContext.ts`. `main.tsx`
provides those accessors from the existing Zustand stores during composition.
This keeps tool transport independent from feature and shared stores while
preserving live state lookup and store singleton identity.

## Dependency rules

The dependency direction is `app -> features -> shared`. App and features may
consume infrastructure adapters at system boundaries. Shared code depends on
shared renderer modules. Infrastructure code depends on shared renderer modules
and external contracts. Application composition injects state accessors when an
infrastructure adapter needs live runtime context.

`pnpm run check:renderer-boundaries` scans all renderer TypeScript modules and
resolves alias, relative, export-from, and dynamic imports. It enforces these
rules:

- Production composition and application layers do not consume `dev/` modules.
- `features/`, `shared/`, and `infrastructure/` stay independent from the root
  `main.tsx` composition entry and `app/` composition modules.
- `shared/` depends on `shared/` renderer modules.
- `infrastructure/` depends on `shared/` renderer modules and external modules.
- `features/` depends on shared and infrastructure modules; each cross-feature
  dependency resolves through the target feature `index.ts`.
- `app/` is the composition root and may compose every renderer layer.

Add a public feature export deliberately when another feature needs a
capability; keep implementation modules behind their owner boundary.

`pnpm run check:renderer-doc-paths` scans active Markdown outside
`docs/archive/` and `docs/reference/`. It verifies every literal
`src/renderer/src` path in prose, Markdown links, inline code, and fenced code
blocks. It also verifies `@renderer/*` aliases in inline and fenced code. Alias
references resolve extensionless modules, index modules, explicit files, and
directories from `src/renderer/src`; trailing sentence punctuation and source
line suffixes remain outside literal filesystem paths. Update documentation
paths in the same change that moves renderer source files.

Production component names describe their stable role. Alternative visual
implementations live in `dev/experiments/`, and dormant manual verification
surfaces live in `dev/test-pages/`.

## Verification

Directory migrations must preserve IPC channel payloads, Zustand singleton
identity, Vitest mock targets, and renderer aliases. Run these gates after a
structural change:

```bash
pnpm run typecheck
pnpm run check:renderer-boundaries
pnpm run check:renderer-doc-paths
pnpm run test:renderer-architecture
pnpm test:run
pnpm build
git diff --check
```
