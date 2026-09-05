# Repository Guidelines

## Project Structure & Module Organization
This is an Electron + Vite + TypeScript desktop app.
- Core process code lives in `src/main`,
- preload bridges in `src/preload`,
- and the React UI in `src/renderer/src`.
- Shared contracts, prompts, and tool definitions live in `src/shared` and `src/types`. Keep static assets in `assets` or `resources`,
- build inputs in `build`, and treat `dist`, `out`, and `node_modules` as generated output.

Tests are colocated with features under `__tests__`, for example `src/main/services/skills/__tests__/SkillService.test.ts` and `src/renderer/src/infrastructure/ipc/__tests__/ipcInvoker.events.test.ts`.

## Design

The application design language and unified Light/Dark Mode direction live in [`DESIGN.md`](./DESIGN.md).

Read it before changing the app shell, Chat, Welcome, sheets, Settings, Artifacts, selectors, overlays, typography, motion, or theme tokens. Keep it synchronized when a shared visual rule or semantic token changes.

## Before Making Changes

- Read the affected exports, immediate callers, shared utilities, and relevant tests before editing. Resolve unfamiliar structure through code and related documentation first.
- Make routine implementation choices within the authorized scope independently. Ask a focused question when evidence leaves a product decision, compatibility tradeoff, or high-risk action unresolved; continue independent work while awaiting the answer.
- Inspect `git status` and relevant diffs before editing. Preserve unrelated staged, unstaged, and untracked work throughout implementation, verification, and commits.
- For any renderer UI change using Tailwind, read `docs/guides/development/tailwindcss-v4-syntax-rules.md`. Visual and motion rules live in `DESIGN.md`.
- Before adding a tool, read `docs/guides/development/tool-definition-workflow.md`.

## Documentation Organization

The `docs/` directory organizes project documentation by type and topic:

- `docs/archive/` - historical documents and completed stage summaries
- `docs/decisions/` - ADR-format architectural decision records
- `docs/guides/` - development, testing, and troubleshooting guides
- `docs/architecture/` - current architecture explanations
- `docs/chat/`, `docs/ui/`, `docs/integrations/` - topic-specific documentation

See `docs/README.md` for the full index and recommended entry points.

Read the architecture and guides for the affected area before changing cross-process contracts, database schemas, module dependency directions, public APIs, or key lifecycles. Update the corresponding documentation in the same change.

Record architectural decisions with lasting tradeoffs, such as ownership, persistence, or compatibility strategy, as ADRs in `docs/decisions/`. Routine implementation choices belong in the change description. Archive only stage summaries directly superseded by the current change, using timestamped names in `docs/archive/`.

## Build, Test, and Development Commands
Use `pnpm` for local work.

- `pnpm dev`: start the Electron/Vite development app.
- `pnpm start`: preview the built app locally.
- `pnpm build`: run both TypeScript checks, then create production bundles.
- `pnpm build:mac`, `pnpm build:linux`, `pnpm build:win`: package per platform.
- `pnpm run typecheck:node`, `pnpm run typecheck:web`: check main/preload/shared or renderer TypeScript. Run `pnpm run typecheck` for both. Run it explicitly for macOS/Linux packaging; those packaging scripts invoke `electron-vite build` directly.
- `pnpm exec eslint <changed-files>`: check explicitly selected source files; add `--fix` for task-scoped fixes.
- `pnpm exec eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts`: check the full repository without modifying files.
- `pnpm lint`: run full-repository ESLint with autofix. Use it when repository-wide cleanup is part of the requested task.
- `pnpm test`: run Vitest interactively. Use `pnpm exec vitest run <test-paths>` for task-scoped verification, `pnpm test:run` for the full suite, and `pnpm test:coverage` for full-suite coverage.

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF, spaces, 2-space indentation, and final newlines. ESLint extends the Electron Toolkit TypeScript rules; prefer single quotes and resolve lint issues in the changed files before opening a PR.

Use `PascalCase` for React components and service classes, `camelCase` for functions and variables, and keep test file names as `*.test.ts`. Match existing folder boundaries: UI code stays in `src/renderer/src`, IPC and system integrations stay in `src/main`.

### Renderer dependency boundaries

Renderer code follows the architecture documented in `docs/architecture/renderer-architecture.md`:

- `app/` is the composition root.
- `features/` owns domain UI, state, hooks, and services. Cross-feature imports resolve through the target feature `index.ts`.
- `shared/` owns side-effect-light reusable modules. Its dependencies within the renderer stay inside `shared/`; external packages and contracts follow the architecture checker.
- `infrastructure/` owns IPC, persistence, configuration orchestration, and renderer tool bridges. It depends on shared renderer modules and external contracts.
- `dev/` owns experiments and dormant manual test pages.

After changing renderer directory structure, cross-module imports, or public exports, run `pnpm run check:renderer-boundaries` and `pnpm run test:renderer-architecture`. After moving renderer source files or editing their paths in active documentation, also run `pnpm run check:renderer-doc-paths`. Update affected documentation paths in the same change.

### Main-process dependency boundaries

Main-process code follows `docs/architecture/main-process-architecture.md`:

- `index.ts` is the Electron entry and delegates lifecycle work to `app/`.
- `main-ipc.ts` and `tools/index.ts` are explicit central registries.
- `hosts/` consumes stable contracts from `agent/contracts/`.
- `tools/` may call reusable services; production `services/` do not import tool processors.
- Production database callers use the domain facades in `db/`.

After changing main-process directory structure, cross-module imports, or public exports, run `pnpm run check:main-boundaries` and `pnpm run test:main-architecture`. After moving main-process source files or editing their paths in active documentation, also run `pnpm run check:main-doc-paths`. Update affected documentation paths in the same change.

### Transformation Naming

Follow the surrounding code's naming conventions: `*Mapper` or `*Transformer` for entity/DTO mapping, `*Adapter`, `*Serializer`, or `*Codec` for type and format conversion, and `toSummary()` or `toBrief()` for field selection. Keep UI-specific shaping inline or in a named function.

Use named `project*()` functions for unidirectional read-only views derived from the same source. Keep these as standalone exports. Reserve `*Projector.ts` filenames for modules whose exports all perform that projection.

## Verification

Choose checks by the affected behavior and dependency surface:

| Change | Required verification |
|---|---|
| Documentation only | Review the diff and validate affected links, paths, and command names. Run the documentation path check when its scope applies. |
| TypeScript implementation | Lint changed files and run the affected Node/web typecheck. Run both when shared contracts affect both processes. |
| Behavior, bug fix, IPC, tool, or streaming change | Add or update colocated tests under `__tests__` for the changed behavior, including relevant failure cases, and run the affected tests. |
| Directory, import, or public export change | Run the architecture checks specified for the affected process above. |
| Refactor spanning multiple features or shared runtime, persistence, or streaming lifecycles | Run affected suites during development and `pnpm test:coverage` before delivery. Vitest uses V8 coverage in text, JSON, and HTML. |
| Visible UI or Electron interaction change | Check the affected flow in Electron. For visual changes, check Light/Dark and relevant window sizes, and capture screenshots or recordings. |

Use existing checks for copy and spacing changes; add tests when there is a behavioral contract to protect. Report the exact checks run, results, and remaining acceptance gaps. Distinguish automated checks from Electron runtime observations. For failures, establish whether the task introduced them and report baseline or environment blockers separately. Expand verification when a failure, further change, or unresolved concern warrants it.

## Commit & Pull Request Guidelines
Use Conventional Commit style for every git commit:

- Format: `<type>(optional-scope): <imperative summary>`.
- Common types: `fix`, `feat`, `refactor`, `docs`, `test`, `chore`, `style`, `build`, `ci`.
- Stage/checkpoint commits should include the intended task files only, with unrelated dirty worktree files left untouched.

When creating git commits, use a detailed message:

- Subject: keep the first line concise and use a Conventional Commit prefix.
- Body: describe the reason for the change, the main implementation points, data/schema/UI impacts, and any operational notes.
- Testing: include the exact verification commands that passed, or state any verification that remains.
- Scope: mention intentionally excluded dirty worktree files when leaving unrelated edits uncommitted.

PRs should include a short summary, testing notes, and linked issues when relevant. Attach screenshots or recordings for user-visible UI changes, following the verification rules above. Call out platform-specific impact if a change affects packaging or Electron behavior.

## Security & Configuration Tips
Do not commit secrets, API keys, or local machine paths. Review preload and IPC changes carefully; anything exposed there becomes part of the app’s trust boundary. When adding new tools or external integrations, keep shared types in sync across `src/main`, `src/preload`, and `src/shared`.

## Talk Normal

Accuracy, evidence, and necessary risk or acceptance details take priority over brevity and wording preferences. Apply these style rules to assistant-authored explanations; preserve the exact meaning and content of quotations, logs, code, and protocols.

- Lead with the answer. Use direct positive claims; avoid negation-based contrastive phrasing in either order. Express necessary comparisons as parallel factual statements. Formal logic and mathematical proofs retain their required conditions.
- Use plain, precise language. Remove filler, repeated questions, repeated explanations, and summary-stamp closings.
- Match depth to complexity. Keep simple answers short and give complex decisions enough evidence and tradeoffs to assess them.
- Give a recommendation with reasons when comparing options. Use lists or tables for naturally parallel or sequential information.
- For code explanations, focus on the change, its purpose, verification, and material limitations. Include a usage example when it helps.
- Finish with a concrete result or required next action. Avoid hypothetical follow-up offers and menus that require another prompt to continue already authorized work.
