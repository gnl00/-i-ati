# KWWK Computer Use Visual Effects Hook Implementation

## Status

Approved for implementation on 2026-09-01.

## Goal

Enable the visual effects already provided by `kwwk-computer-use-core` for every
computer-use action handled by the native bridge session. The resulting system
shows the core-owned overlay cursor and target-window border while preserving the
existing JSON-RPC protocol, TypeScript backend contract, tool definitions, and
renderer behavior.

## Current Architecture

```text
Computer-use tool
  -> KwwkComputerUseBridgeClient
  -> stdio JSON-RPC
  -> BridgeServer
  -> ComputerUseClient
  -> ComputerUseSession
  -> KWWKComputerUseCore action
```

`ComputerUseClient` owns one long-lived `ComputerUseSession`. Core action methods
already create `ComputerUseVisualEffectEvent` values and route them through
`ComputerUseSession.performWithBackgroundActivation`. The session invokes a
visual effect when `visualEffectHook` is populated and calls the hook's `finish()`
during session cleanup.

## Implementation

Edit
`native/kwwk-computer-use-bridge/Sources/KwwkComputerUseBridgeCore/BridgeServer.swift`.

In `BridgeServer.init`, after assigning the injected or default
`ComputerUseClient`, attach the core implementation to that client's session:

```swift
self.client.session.visualEffectHook = AppKitComputerUseVisualEffects()
```

Use the existing `KWWKComputerUseCore` import. Keep the injected-client initializer
shape so existing tests and callers retain the same construction path.

## Expected Behavior

| Action | Core visual behavior |
| --- | --- |
| Element or coordinate click | Target-window border, cursor approach, click effect, post-action hold |
| Scroll | Target-window border, cursor approach, scroll effect, post-action hold |
| Drag | Target-window border, cursor approach, visual drag path |
| Accessibility action, including supported value changes | Target-window border, cursor approach, action effect, post-action hold |
| Type text and key press | Target-window border while the keyboard action runs |
| Finish | Border detaches and daemon cursor tears down |

## Scope

- Enable `AppKitComputerUseVisualEffects` on the bridge-owned session.
- Update `docs/specs/tools/kwwk-computer-use-bridge.md` to record the active visual
  effect lifecycle and action behavior.
- Run the focused Swift package tests and release build.
- Inspect the final diff for unrelated worktree changes.

## Preserved Interfaces

- JSON-RPC methods and payloads
- `ComputerUseBackend` and `KwwkComputerUseBridgeClient`
- embedded computer-use tool definitions
- preload and renderer contracts
- current permission and signing strategy
- core-owned animation timing, cursor sprite, border appearance, and cleanup

## Excluded Work

- `cursor/show`, `cursor/move`, or `cursor/hide` bridge commands
- TypeScript or renderer controls for visual effects
- settings, feature flags, and environment variables
- screenshot-layer cursor animation
- custom animation timing, styling, or duplicated overlay code

## Automated Verification

Run:

```bash
pnpm run native:kwwk:test
pnpm run native:kwwk:build
git diff --check
```

The Swift test and release build must compile against the resolved core revision.
`git diff --check` must report no whitespace errors. Automated checks establish
source and package compatibility. macOS overlay appearance and background-focus
behavior require live acceptance.

## Manual macOS Acceptance

Use the existing computer-use probe flow or an equivalent live tool sequence with
Accessibility and Screen Recording permissions granted to the running helper.

Check Finder, Chrome, and an Electron window where available:

1. Capture a screenshot-backed state and run an element click. The overlay cursor
   reaches the selected element, the target border is attached to the correct
   window, and the real pointer remains available to the user.
2. Run a coordinate click. The overlay reaches the screenshot-derived point.
3. Run scroll and drag actions. Direction, start point, and end point match the
   requested action.
4. Run type-text and press-key actions. The target-window border is visible during
   delivery.
5. Act on a background window. The action completes while the user's foreground
   workflow and pointer remain stable.
6. Call `computer_use_finish`. The border and daemon cursor disappear.

Record platform or app-specific gaps explicitly. This live acceptance pass remains
required after source builds and fake-backend tests.

## Risks and Failure Handling

- Visual approach and hold animations add action latency determined by core.
- Overlay visibility depends on macOS window-server behavior, Accessibility
  permission, helper identity, and packaged signing.
- Core is resolved from a branch dependency to the revision recorded in
  `Package.resolved`; future dependency updates require repeating the build and GUI
  acceptance checks.

Action execution remains core-owned. If overlay behavior fails acceptance, remove
the single hook assignment and rebuild the helper. Schema, configuration, and
persistent data remain unchanged.

## Completion Criteria

- The bridge-owned session contains `AppKitComputerUseVisualEffects` from
  initialization until `finish()`.
- The focused Swift tests and release helper build pass.
- The documentation describes the active lifecycle and action behavior.
- The implementation diff contains only the approved bridge and documentation
  paths.
- Manual GUI acceptance results are reported separately from automated evidence.
