# ADR-0035: Telegram rich output and native drafts

- Status: Accepted
- Date: 2026-10-01

## Context

Assistant replies and proactive delivery bypassed the existing regex HTML
formatter. Telegram Bot API 10.3 supports structured Rich Messages, native private
drafts and generation-stopped updates. Temporary drafts need explicit persistent
delivery; a Stop click must cancel the intended Main-owned run.

## Decision

Use grammY 1.46 with Bot API 10.3 types. Its existing AbortController polyfill
is declared directly; native cancellation also aborts the SDK signal, and the
existing Electron fetch adapter converts it back to a native networking signal. Promote the already installed unified,
remark-parse and Markdown AST types to direct dependencies and reuse remark-gfm
and remark-math. Render a supported HTML subset rather than interpreting raw
model HTML as active Telegram operations. Short messages use classic HTML;
headings, tables, formulas and long messages use Rich Messages. Split source
before parsing, preserving Unicode and closing every emitted tag.

Private streaming uses native rich drafts with a Thinking placeholder, Stop and
15-second keepalive. Completion, failure and cancellation persist the available
text. Groups keep persistent message editing. The gateway validates Stop updates
against the active private peer/topic/draft and calls the existing submission
cancellation API. No agent, IPC or database schema change is required.

Retry only explicit 429 rejections, bounded to two retries. Downgrade only after
explicit formatting or unsupported-method rejections. Network timeouts have an
uncertain delivery outcome and must not trigger automatic resend. Track each
successful overflow send immediately. Partial proactive delivery keeps source
receipts and reports incomplete delivery without inviting duplicate messages.

## Consequences and acceptance

HTML formatting is shared by ordinary replies and proactive sends. Advanced
layouts use Telegram's native Rich Messages; tool approval buttons remain under
the existing authoritative confirmation stream, with execution arguments in a
collapsed quotation. Raw HTML/media in generated Markdown remain literal text
or alt text. Proactive inputs are bounded to 30000 source characters.

Tests cover format safety, overflow receipts, explicit error fallback, throttled
drafts, terminal persistence and scoped cancellation. Real Telegram client
rendering and Stop interaction require separate live acceptance. This decision
does not migrate existing message history or change outbound target ownership.

Official references: [Bot API](https://core.telegram.org/bots/api#rich-messages),
[draft streaming](https://core.telegram.org/bots/api#sendrichmessagedraft),
[generation stopped](https://core.telegram.org/bots/api#messagegenerationstopped).


## Verification recorded for this change

- `pnpm --config.verify-deps-before-run=false exec vitest run src/main/services/telegram/__tests__ src/main/hosts/telegram/runtime/__tests__ src/main/tools/telegram/__tests__ src/main/hosts/telegram/__tests__ src/main/db/dao/__tests__/ChatHostBindingDao.telegram.test.ts`: 135 passed.
- `pnpm --config.verify-deps-before-run=false run typecheck:node` and
  `pnpm --config.verify-deps-before-run=false run typecheck:web`: passed.
- `pnpm --config.verify-deps-before-run=false run check:main-boundaries`,
  `pnpm --config.verify-deps-before-run=false run test:main-architecture` and
  `pnpm --config.verify-deps-before-run=false run check:main-doc-paths`: passed
  (8 architecture tests).
- Scoped ESLint on changed TypeScript files retains baseline errors; comparison
  with clean HEAD found no new errors. The old regex formatter's useless-escape
  error was removed by replacing that parser.
- `pnpm --config.verify-deps-before-run=false test:coverage` retained the
  existing RunService test failure: its mock lacks analyzeCompressionStrategy.
  A clean HEAD snapshot reproduced that exact failure.
- `pnpm --config.verify-deps-before-run=false test:coverage --exclude src/main/orchestration/chat/run/__tests__/RunService.test.ts`:
  2362 passed, 21 skipped. This exclusion is a verification command, not a saved
  suite configuration change.
- Isolated Electron Main smoke with the real SDK and locally intercepted Bot API
  calls passed draft serialization, Stop-to-SDK signal cancellation, terminal
  delivery and stale-stop rejection. No live Telegram messages were sent.

Real Telegram client rendering and Stop interaction remain unverified. Other
concurrent worktree changes were preserved, including the separate MCP dependency
migration; no unrelated source changes are part of this Telegram implementation.
