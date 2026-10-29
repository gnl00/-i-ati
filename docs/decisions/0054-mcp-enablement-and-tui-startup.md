# 0054: Persist MCP enablement and keep TUI startup independent of discovery

Status: Accepted
Date: 2026-10-29

## Context

Desktop switches represented only current process connection state. Server
configuration had no enablement preference. Desktop painted before manual MCP
connection, while TUI sequentially connected every configured server before
creating the view and threw on any failed connection. This made desktop-disconnected
servers start in TUI and made one optional dependency fatal to terminal startup.
A captured startup spent 18.61 seconds on Context7 and 18.84 seconds on browsermcp;
the latter rejected the pinned protocol revision 2026-07-28.

## Decision

Persist `enabled?: boolean` in existing MCP config JSON. Explicit true opts in;
absent/false is disabled. No schema migration or inference from ephemeral runtime
state is performed. The desktop switch shows desired enablement; the existing
runtime badge separately shows connected/connecting/error state. Switch changes
save immediately, preserve staged transport edits, and serialize preference
writes. Configuration hydration starts enabled services in the background.

TUI loads the same profile preference at launch, renders before MCP discovery,
and connects enabled servers concurrently. Each failure reports unavailability
without exiting. Successful tools enter subsequent submissions; active runs keep
their original tool-list snapshot. CLI also filters by enablement, retaining its
batch fail-fast contract for an explicitly enabled service that fails setup.
Process connection state remains independent; this change does not add live
cross-process runtime control or a background polling service.

TUI shutdown aborts pending discovery and awaits connection cleanup. SDK 2.2's
negotiation probe ignores request-level signals until the request machinery is
attached; closing its transport cancels the disposable probe process. TUI captures
stdio stderr in application logs so package-manager/server output cannot corrupt
the terminal screen. The protocol pin and no-legacy-fallback decision remain intact.

## Verification

Regression tests reproduce the old render-before-discovery failure, cover failed
and rejected connections, concurrent healthy/slow services, disabled/legacy config,
transport cancellation, preference persistence without losing staged edits, and
concurrent preference writes. Real Electron PTY acceptance uses a silent MCP child,
a working modern server, and a missing executable; it measures first render and
exercises ordinary multi-turn/approval/cancellation flows while discovery remains
pending. Real third-party compatibility and cross-platform child cleanup remain
separate acceptance boundaries.

Local macOS verification on 2026-10-29:

- The two TuiApplication startup regression tests failed before the application
  change and passed afterward. Focused startup/MCP/profile/renderer tests: 21 passed.
- `pnpm run typecheck`, `pnpm exec electron-vite build`, `pnpm test:coverage`:
  passed; full coverage run had 3029 passed and 37 skipped.
- Main and Renderer boundary/architecture checks and documentation path checks:
  passed.
- `pnpm verify:tui`: passed with pending, healthy and failed MCP fixtures; first
  configured terminal render was 672 ms. `pnpm verify:cli`: passed.
- An isolated Electron desktop profile verified immediate enable/disable
  persistence, a failed enabled connection retaining its preference, and a
  subsequent explicit disable. Light/Dark wide/compact screenshots were inspected.
- Scoped ESLint retains 10 baseline errors; a HEAD comparison with the formatting
  rule disabled found no added errors. Existing formatting warnings remain.

The startup measurement uses deterministic local fixtures, not a claim about
third-party server discovery latency. Browsermcp's observed protocol mismatch is
unchanged. Real Windows/Linux process cleanup remains unverified.
