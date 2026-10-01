# ADR-0034: Require the modern MCP protocol

**Status:** Accepted
**Date:** 2026-10-01
**Related integration:** [MCP runtime](../integrations/mcp.md)

## Context

The application used SDK 1.17.0 and supported protocol revisions through
2025-06-18. MCP 2026-07-28 replaces initialization and protocol sessions with
request envelopes and discovery. The requested upgrade explicitly accepts a
compatibility break.

## Decision

Use `@modelcontextprotocol/client` 2.2.0 and pin protocol revision 2026-07-28.
Keep stdio and Streamable HTTP. Remove HTTP+SSE and legacy protocol fallback.
Use SDK primitives for discovery, pagination and result processing instead of
introducing an application-level compatibility implementation.

## Consequences

Existing old-protocol servers must be upgraded. Persisted configurations remain
available but unsupported transports fail to connect. No automatic conversion
of SSE URLs or data migration runs. The shared runtime applies this contract
consistently to desktop, CLI and TUI.

Rollback restores the prior dependency, lockfile and source changes; it requires
no database changes. Optional client capabilities remain scoped to actual app
handlers and are not advertised merely because the SDK supports them.
