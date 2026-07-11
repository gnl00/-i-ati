# Repository Guidelines

## Project Structure & Module Organization
This is an Electron + Vite + TypeScript desktop app.
- Core process code lives in `src/main`,
- preload bridges in `src/preload`,
- and the React UI in `src/renderer/src`.
- Shared contracts, prompts, and tool definitions live in `src/shared` and `src/types`. Keep static assets in `assets` or `resources`,
- build inputs in `build`, and treat `dist`, `out`, and `node_modules` as generated output.

Tests are colocated with features under `__tests__`, for example `src/main/services/skills/__tests__/SkillService.test.ts` and `src/renderer/src/invoker/__tests__/ipcInvoker.events.test.ts`.

## When to Code

Remember to check code specs if match with these belows:

- Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.
- Add or Design ChatUI, check `docs/guides/development/tailwindcss-v4-syntax-rules.md`, since now we upgrade from Tailwind CSS V3 to V4, you need to follow the V4 syntax and rules
- For interaction design, keep hover motion subtle and intentional. Prefer opacity, color, shadow, border, and small scale changes for most hover states; use `hover:translate-x-*` and `hover:translate-y-*` only when the movement supports the layout and feels physically grounded.
- For decorative dots, keep `rounded-full` accents rare and purposeful. One dot motif per section works well; for repeated decoration, use chips, lines, icons, or larger structural shapes.
- Add a new tool: `docs/guides/development/tool-definition-workflow.md`

## Documentation Organization

The `docs/` directory organizes project documentation by type and topic:

- `docs/archive/` - historical documents and completed stage summaries
- `docs/decisions/` - ADR-format architectural decision records
- `docs/guides/` - development, testing, and troubleshooting guides
- `docs/architecture/` - current architecture explanations
- `docs/chat/`, `docs/ui/`, `docs/integrations/` - topic-specific documentation

See `docs/README.md` for the full index and recommended entry points.

When making substantial changes:

- Check relevant documentation in `docs/architecture/` and `docs/guides/` first
- Record important technical decisions as ADRs in `docs/decisions/`
- Move outdated stage summaries to `docs/archive/` with timestamps
- Keep architecture docs synchronized with code changes

## Build, Test, and Development Commands
Use `pnpm` for local work.

- `pnpm dev`: start the Electron/Vite development app.
- `pnpm start`: preview the built app locally.
- `pnpm build`: run both TypeScript checks, then create production bundles.
- `pnpm build:mac`, `pnpm build:linux`, `pnpm build:win`: package per platform.
- `pnpm lint`: run ESLint with autofix.
- `pnpm test`, `pnpm test:run`, `pnpm test:coverage`: run Vitest interactively, once, or with coverage.

## Coding Style & Naming Conventions
Follow `.editorconfig`: UTF-8, LF, spaces, 2-space indentation, and final newlines. ESLint extends the Electron Toolkit TypeScript rules; prefer single quotes and fix lint issues with `pnpm lint` before opening a PR.

Use `PascalCase` for React components and service classes, `camelCase` for functions and variables, and keep test file names as `*.test.ts`. Match existing folder boundaries: UI code stays in `src/renderer/src`, IPC and system integrations stay in `src/main`.

### Naming: Prefer Convention Over "Projector"
Do not generate `*Projector` classes or modules unless the transformation is genuinely a unidirectional read-only view projection (same source → multiple derived views). Prefer existing conventions instead:

| What you're doing | Use this | Instead of |
|---|---|---|
| Entity ↔ DTO mapping | `*Mapper`, `*Converter`, `*Transformer` | `*Projector` |
| Picking a subset of fields | `toSummary()`, `toBrief()`, `*Transformer` | `*Projector` |
| Type conversion (A → B) | `*Adapter`, `*Serializer`, `*Codec` | `*Projector` |
| UI-specific data shaping | inline in component, or a named function | `*Projector` |
| Unidirectional view projection | verb-form `project*()` functions, not a `Projector` class | `*Projector` class |

When a `project*` function is the right tool, export named functions (verb) in a module file, not a class. A `*Projector.ts` module with standalone `project*()` exports is acceptable only when every export is a genuine read-only projection of the same input source.

## Testing Guidelines
Vitest is the test runner, with V8 coverage output in text, JSON, and HTML. Add tests beside the code you change, using the nearest `__tests__` directory. Cover both happy paths and failure cases for IPC, tools, and streaming flows. Run `pnpm test:coverage` for larger refactors.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit prefixes such as `refactor:` and `fix:`. Keep commits focused and descriptive, for example `fix: guard null provider account in model list`.

Use Conventional Commit style for every git commit:
- Format: `<type>(optional-scope): <imperative summary>`.
- Common types: `fix`, `feat`, `refactor`, `docs`, `test`, `chore`, `style`, `build`, `ci`.
- Stage/checkpoint commits should include the intended task files only, with unrelated dirty worktree files left untouched.

When creating git commits, use a detailed message:
- Subject: keep the first line concise and use a Conventional Commit prefix.
- Body: describe the reason for the change, the main implementation points, data/schema/UI impacts, and any operational notes.
- Testing: include the exact verification commands that passed, or state any verification that remains.
- Scope: mention intentionally excluded dirty worktree files when leaving unrelated edits uncommitted.

PRs should include a short summary, testing notes, and linked issues when relevant. For renderer changes, attach screenshots or recordings from `screenshot/`-style captures. Call out platform-specific impact if a change affects packaging or Electron behavior.

## Security & Configuration Tips
Do not commit secrets, API keys, or local machine paths. Review preload and IPC changes carefully; anything exposed there becomes part of the app’s trust boundary. When adding new tools or external integrations, keep shared types in sync across `src/main`, `src/preload`, and `src/shared`.

## Talk Normal
Be direct and informative. No filler, no fluff, but give enough to be useful.

Your single hardest constraint: prefer direct positive claims. Do not use negation-based contrastive phrasing in any language or position — neither "reject then correct" (不是X，而是Y) nor "correct then reject" (X，而不是Y). If you catch yourself writing a sentence where a negative adverb sets up or follows a positive claim, restructure and state only the positive.

Examples:
BAD:  真正的创新者不是"有创意的人"，而是五种特质同时拉满的人
GOOD: 真正的创新者是五种特质同时拉满的人

BAD:  真正的创新者是五种特质同时拉满的人，而不是单纯"聪明"的人
GOOD: 真正的创新者是五种特质同时拉满的人

BAD:  这更像创始人筛选框架，不是交易信号
GOOD: 这是一个创始人筛选框架

BAD:  It's not about intelligence, it's about taste
GOOD: Taste is what matters

Rules:
- Lead with the answer, then add context only if it genuinely helps
- Do not use negation-based contrastive phrasing in any position. This covers any sentence structure where a negative adverb rejects an alternative to set up or append to a positive claim: in any order ("reject then correct" or "correct then reject"), chained ("不是A，不是B，而是C"), symmetric ("适合X，不适合Y"), or with or without an explicit "but / 而 / but rather" conjunction. Just state the positive claim directly. If a genuine distinction needs both sides, name them as parallel positive clauses. Narrow exception: technical statements about necessary or sufficient conditions in logic, math, or formal proofs.
- End with a concrete recommendation or next step when relevant. Do not use summary-stamp closings — any closing phrase or label that announces "here comes my one-line summary" before delivering it. This covers "In conclusion", "In summary", "Hope this helps", "Feel free to ask", "一句话总结", "一句话落地", "一句话讲", "一句话概括", "一句话说", "一句话收尾", "总结一下", "简而言之", "概括来说", "总而言之", and any structural variant like "一句话X：" or "X一下：" that labels a summary before delivering it. If you have a final punchy claim, just state it as the last sentence without a summary label.
- Kill all filler: "I'd be happy to", "Great question", "It's worth noting", "Certainly", "Of course", "Let me break this down", "首先我们需要", "值得注意的是", "综上所述", "让我们一起来看看"
- Never restate the question
- Yes/no questions: answer first, one sentence of reasoning
- Comparisons: give your recommendation with brief reasoning, not a balanced essay
- Code: give the code + usage example if non-trivial. No "Certainly! Here is..."
- Explanations: 3-5 sentences max for conceptual questions. Cover the essence, not every subtopic. If the user wants more, they will ask.
- Use structure (numbered steps, bullets) only when the content has natural sequential or parallel structure. Do not use bullets as decoration.
- Match depth to complexity. Simple question = short answer. Complex question = structured but still tight.
- Do not end with hypothetical follow-up offers or conditional next-step menus. This includes "If you want, I can also...", "如果你愿意，我还可以...", "If you tell me...", "如果你告诉我...", "如果你说X，我就Y", "我下一步可以...", "If you'd like, my next step could be...". Do not stage menus where the user has to say a magic phrase to unlock the next action. Answer what was asked, give the recommendation, stop. If a real next action is needed, just take it or name it directly without the conditional wrapper.
- Do not restate the same point in "plain language" or "in human terms" after already explaining it. Say it once clearly. No "翻成人话", "in other words", "简单来说" rewording blocks.
- When listing pros/cons or comparing options: max 3-4 points per side, pick the most important ones
