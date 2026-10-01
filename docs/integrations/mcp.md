# MCP runtime

Status: Current<br>
Last verified: 2026-10-01<br>
Implementation: [McpRuntimeService](../../src/main/services/mcpRuntime/McpRuntimeService.ts)<br>
Decision: [ADR-0034](../decisions/0034-modern-mcp-protocol.md)

The main process uses `@modelcontextprotocol/client` 2.2.0. Chat, CLI and TUI
share one runtime. Connections pin MCP revision `2026-07-28`; servers must
advertise that revision through `server/discover`. Older protocol revisions
are rejected, with no `initialize` fallback.

Supported configurations are local stdio (`command`, `args`) and remote
Streamable HTTP (`type: "streamableHttp"`, `url`). HTTP+SSE is unsupported.
Existing configurations are not rewritten or deleted. Update the server itself
and replace SSE endpoints with modern Streamable HTTP endpoints before connecting.
Registry installation chooses a Streamable HTTP remote, or a package command;
SSE-only entries cannot be installed automatically.

The SDK owns request envelopes, protocol discovery, pagination, output-schema
validation and multi-round-trip result processing. The app exposes tool discovery
and calls; it advertises no roots, sampling or elicitation capability. Servers
requiring these optional client features fail explicitly through the SDK instead
of returning an intermediate result as a completed tool call. Upgrading the
protocol does not add OAuth onboarding, MCP Apps or task-extension UI.

Tool names remain namespaced by server. Completed results retain content,
structured content and error markers through the existing tool-result path.
Tool discovery requires the server's tools capability. Failed connection or
initial tool discovery closes the SDK client before reporting the failure.

Modern Streamable HTTP does not resume lost responses. The runtime does not
retry tool calls automatically; callers must consider side effects before
issuing a new call. No database schema migration is required.

Verification includes real SDK HTTP wire fixtures and a spawned stdio fixture,
plus shared tool-executor and CLI profile tests. Production server credentials,
OAuth flows and Windows process behavior require environment-specific acceptance.

Sources: [Protocol changes](https://modelcontextprotocol.io/specification/2026-07-28/changelog),
[SDK migration](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/upgrade-to-v2.md).

## Upgrade verification

On 2026-10-01:

- `pnpm exec vitest run src/main/services/mcpRuntime/__tests__/McpRuntimeService.test.ts src/main/agent/tools/__tests__/ToolExecutor.test.ts src/main/orchestration/cli/__tests__/CliChatProfile.test.ts src/main/hosts/chat/preparation/request/__tests__/ToolListBuilder.test.ts`: 64 tests passed.
- `pnpm run typecheck:web`: passed. Node typecheck is blocked by concurrent Telegram changes in `TelegramRenderResponder` and `TelegramTextDelivery`; no MCP errors remain. An independent HEAD source snapshot with the installed dependencies passed Node typecheck.
- `pnpm exec electron-vite build`: passed (bundle build, separate from typechecking).
- `pnpm run check:main-boundaries`, `pnpm run test:main-architecture`, `pnpm run check:main-doc-paths`, `pnpm run check:renderer-doc-paths`: passed.
- ESLint ran on all changed TypeScript files and the stdio fixture. Implementation and test files have no errors; `src/types/index.d.ts` retains nine existing `no-explicit-any` errors also reproduced on HEAD. Existing formatter warnings remain.
- `pnpm test:coverage`: 2360 passed, 21 skipped, one failed. The `RunService` compression-job mock failure was reproduced in an independent HEAD snapshot using SDK 1.17.0.
- An isolated Electron 44.5.0 harness bundled the runtime with the real SDK and spawned the modern stdio fixture. Discovery, tool call and shutdown passed. The harness substituted a no-op logger; desktop Settings installation, live third-party servers and Windows remain unverified.

CLI and TUI flatten runtime MCP definitions before request preparation, retaining
server routing metadata. Their request factory requires a top-level tool name.
