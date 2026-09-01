# KWWK Computer Use Cursor Trail Implementation

## Status

Implemented on 2026-09-01. Focused Swift tests and the release helper build pass;
live macOS overlay acceptance remains pending.

## Goal

Make the native AI cursor route easier to read by drawing a restrained, short-lived
trail behind the existing overlay cursor. The trail follows the real quartic
Bezier samples produced by `kwwk-computer-use-core`, stays in the native AppKit
overlay layer, and fades after each action.

This extends the action-driven visual hook committed in `78a22fa7`. It keeps the
JSON-RPC protocol, TypeScript backend, renderer, settings, and core dependency
revision unchanged.

## Evidence and Extension Point

`DaemonCursor` already builds and samples the native route. Its public
`onPoseApplied` callback emits every applied cursor position in AppKit screen
coordinates during Bezier approach and drag animation. The bridge can consume
that callback without copying the route planner or editing the generated SwiftPM
checkout under `.build/checkouts`.

The current `ActionOverlayCursorView` draws only the cursor image. The bridge adds
a dedicated transparent AppKit overlay that uses the emitted positions.

## Architecture

```text
ComputerUseSession visual event
  -> BridgeComputerUseVisualEffects
       -> begin native trail for eligible window action
       -> AppKitComputerUseVisualEffects
            -> DaemonCursor Bezier animation
                 -> onPoseApplied(AppKit screen point)
                      -> CursorTrailOverlay
       -> end trail capture and fade
  -> finish clears trail and core overlays
```

`BridgeComputerUseVisualEffects` is the single session hook. It delegates the
existing cursor, border, click, scroll, drag, and hold behavior to
`AppKitComputerUseVisualEffects` and owns only the trail lifecycle.

## Implementation Files

1. Add
   `native/kwwk-computer-use-bridge/Sources/KwwkComputerUseBridgeCore/BridgeComputerUseVisualEffects.swift`.
2. Update
   `native/kwwk-computer-use-bridge/Sources/KwwkComputerUseBridgeCore/BridgeServer.swift`.
3. Add
   `native/kwwk-computer-use-bridge/Tests/KwwkComputerUseBridgeTests/BridgeComputerUseVisualEffectsTests.swift`.
4. Update `docs/specs/tools/kwwk-computer-use-bridge.md`.
5. Keep this implementation guide with the slice.

## Bridge Visual-Effect Wrapper

Create an internal final `BridgeComputerUseVisualEffects` that conforms to
`ComputerUseVisualEffectHook`.

- Retain one `AppKitComputerUseVisualEffects` delegate.
- Retain one `CursorTrailOverlay` for the bridge session.
- Start trail capture before delegating an eligible event.
- Stop capture in `defer` so thrown actions still fade and release the callback.
- Call trail cleanup and delegate cleanup from `finish()`.
- Run every AppKit trail operation synchronously on the main actor. Follow the
  core hook's proven main-thread bridging pattern so trail setup completes before
  the delegated Bezier animation starts.

Eligible events are `.targetWindow`, `.click`, `.scroll`, `.drag`, and
`.accessibilityAction` when `surfaceKind == .window`. Keyboard delivery continues
to show the core target-window border. Status and menu surfaces continue with the
core cursor behavior and skip the desktop-spanning trail panel.

## Cursor Trail Overlay

Implement the overlay in the same Swift file as the wrapper to keep ownership and
cleanup local.

### Window behavior

- Use one borderless, nonactivating, transparent `NSPanel` covering the union of
  `NSScreen.screens` frames.
- Set `ignoresMouseEvents = true`, disable shadow and window animation, and join
  all spaces with full-screen auxiliary support.
- Order the panel immediately above the target CG window. Foreground windows that
  sit above the target remain visually above the trail, preserving background
  computer-use behavior.
- Recalculate the desktop union at the start of every eligible event so monitor
  attachment and negative screen origins are handled.
- Keep the panel from becoming key or main.

### Path behavior

- Convert each AppKit screen point to panel-local coordinates by subtracting the
  desktop union origin. Preserve AppKit's y-up orientation.
- Clear the previous path when a new event begins.
- Skip consecutive samples less than 1 point apart.
- Retain at most 96 points per route.
- Draw a single `CAShapeLayer` path with round caps and joins, a 2-point stroke,
  and a restrained system teal color. Keep maximum visible opacity at or below
  `0.42`.
- Disable implicit Core Animation actions while updating the path.
- During movement, keep the current path visible. When capture ends, fade opacity
  to zero over `0.24` seconds, then order out the panel and clear the path.
- Cancel a pending hide operation when the next route begins.
- When macOS Reduce Motion is enabled, keep trail capture inactive and preserve
  the core action behavior.

Keep the deterministic state in an internal `CursorTrailRoute` value with a
96-point cap, near-duplicate filtering, and reset behavior. Keep event eligibility
and AppKit-to-panel coordinate conversion in internal functions used by both the
overlay and focused tests. These helpers remain inside the bridge module and add
no public API.

The trail is visual evidence of the sampled cursor route. It is purely visual,
leaves the real system pointer untouched, and stays outside hit testing.

## Bridge Wiring

Replace the direct session hook in `BridgeServer.init`:

```swift
self.client.session.visualEffectHook = BridgeComputerUseVisualEffects()
```

Keep the initializer signature and all bridge methods unchanged. The session
continues to own hook lifetime and invokes `finish()` through the existing
`ComputerUseClient.finish()` path.

## Tests

Add small deterministic tests for the bridge-owned logic:

1. Event eligibility: window click, scroll, drag, accessibility action, and target
   window events enable the trail; keyboard, status, and menu events skip it.
2. Coordinate conversion: a global AppKit point maps correctly into a desktop
   union with a negative x or y origin.
3. Sample reduction: near-duplicate points are skipped and the route is capped at
   96 points.

Keep AppKit window creation out of the deterministic assertions. The live overlay
appearance and z-order remain part of manual macOS acceptance.

## Automated Verification

Run:

```bash
pnpm run native:kwwk:test
pnpm run native:kwwk:build
git diff --check
```

The tests must exercise the new deterministic route helpers. The release build
must compile the wrapper against the resolved core revision and regenerate
`resources/native/kwwk-computer-use-bridge`.

## Manual macOS Acceptance

With Accessibility and Screen Recording permissions granted to the running helper:

1. Click a near target and a far target in Finder. The trail follows the overlay
   cursor, stays thin, and disappears within roughly 300ms after landing.
2. Click and scroll in a background Chrome window. The trail remains in the target
   window's visual stack while the user's foreground window and real pointer stay
   stable.
3. Drag between two distant points. The trail covers both the approach and drag
   movement without gaps or stale paths from the previous action.
4. Move the target window between monitors, including a monitor with a negative
   desktop origin. The trail remains aligned with the cursor.
5. Run type text and key press. The existing border behavior remains unchanged and
   no route line appears.
6. Enable Reduce Motion and repeat a click. The computer-use action and core visual
   behavior continue while the added trail stays inactive.
7. Call `computer_use_finish`. The trail panel, cursor, and target border disappear.

Record overlay appearance, target-window z-order, multi-monitor alignment, and
focus stability separately from automated evidence.

## Scope Boundaries

- Keep `native/kwwk-computer-use-bridge/.build/checkouts` unchanged.
- Keep the current `kwwk-computer-use-core` dependency and resolved revision.
- Keep JSON-RPC payloads and renderer behavior unchanged.
- Reserve replay, screenshot annotation, settings control, and visual toggles for
  separately approved product work.
- Keep dependencies, schemas, environment variables, and persistent state unchanged.
- Keep the core cursor animation timing unchanged.
- Preserve every unrelated worktree and index change.

## Risks and Rollback

- A full-desktop transparent panel can produce incorrect layering when ordered at
  a global topmost level. Ordering it relative to the target window is required.
- `DaemonCursor.onPoseApplied` is a single callback. The bridge helper owns its
  process and must clear the callback at the end of every event and during
  `finish()`.
- AppKit and Core Animation lifecycle mistakes can leave an invisible panel alive.
  The delayed hide work item must be cancellable and cleanup must close the panel.

Rollback removes `BridgeComputerUseVisualEffects.swift`, restores the direct
`AppKitComputerUseVisualEffects()` assignment, and reverts the trail documentation
and tests. Data and public contracts remain unchanged.

## Completion Criteria

- Eligible native window actions show a route aligned with the core cursor samples.
- The route is subtle, capped, click-through, target-window-relative, and short-lived.
- Keyboard, status, menu, and Reduce Motion paths preserve their intended behavior.
- `finish()` removes every bridge-owned visual resource.
- Focused Swift tests, release helper build, and diff checks pass.
- The final diff contains only the five approved implementation and documentation
  surfaces listed above.
