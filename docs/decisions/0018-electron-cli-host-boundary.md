# ADR-0018: Electron CLI Host boundary

**Status:** Accepted<br>
**Date:** 2026-09-03<br>
**Related guide:** [CLI Host implementation](../guides/development/cli-host-implementation.md)<br>
**Related architecture:** [Main process architecture](../architecture/main-process-architecture.md#cli-host)

## Context

Terminal and evaluator tasks need one deterministic AgentRuntime run with
workspace tools, structured progress, and durable artifacts. The desktop entry
starts windows and long-lived services, reads the user's normal profile, and
uses interactive renderer protocols. A task process needs an explicit profile
boundary and a transport that preserves complete runtime facts.

## Decision

Add a dedicated Electron main entry at `src/main/cli.ts` and launch it through
`scripts/run-cli.mjs`. The CLI uses the desktop application's profile by default;
`--profile-dir` selects an explicit profile for tests and containers. Session
storage and run artifacts remain under the output directory. CLI chat rows stay
in the selected profile so tool-created associations remain valid.

CLI request preparation reuses Chat's RunRequestFactory, including the central
tool registry, configured MCP tools, prompts, auxiliary model configuration and
context providers. Explicit CLI model parameters override the current request.
ToolExecutor keeps the shared approval policy, with `deny` and `auto` modes,
one AbortSignal, whole-run timeout, and signal-specific exit codes. The event sink writes versioned JSONL to stdout and
`events.jsonl`; `result.json` and `transcript.json` are written with temporary
files followed by rename. Credentials are read from the configured environment
variable, removed from child-process inheritance, and redacted from events,
errors, logs, and artifacts.

The CLI profile records its final prompt, tool-name/config fingerprints,
effective timeout and request overrides, and the profile differences from the
desktop Chat runtime. The toolset fingerprint covers the effective tool definitions, including schemas
and sources.

## Consequences

- Evaluators get a single process contract with JSONL progress and stable
  terminal artifacts.
- CLI and Chat share application configuration and tool availability. CLI starts
  a fresh task history and owns its MCP connections. Renderer interaction and
  background desktop gateways retain their desktop lifecycle.
- Existing AgentRuntime, provider adapters, workspace resolver, and
  ToolExecutor remain the execution sources of truth.
- The CLI process itself supplies lifecycle isolation; OS sandboxing and task
  image/verifier integration remain external evaluation responsibilities.

## Verification

- Focused parser, redaction, event sink, shell environment, logging, tool
  definition, and command cleanup tests pass (66 tests).
- `pnpm exec electron-vite build` passes, and the bundle keeps main chunks
  beside `out/main/index.js` so the existing preload/renderer relative paths
  remain valid.
- `pnpm verify:cli` passes against a loopback deterministic HTTP provider. It
  checks tool/runtime output, transcript and usage preservation, terminal event
  uniqueness, invalid input, output collision, `auto`/`deny` file tool policy,
  step exhaustion, timeout, SIGINT, and credential redaction.
- Main boundary, documentation path, and architecture checks pass. Node
  typecheck retains the pre-existing diagnostic at
  `src/main/tools/webTools/__tests__/webToolsUnits.test.ts:352`.
