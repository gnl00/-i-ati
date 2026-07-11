# KWWK Computer Use Bridge

This document defines the macOS native computer-use backend for the Electron runtime.

## Context

`kwwk-computer-use-core` is a Swift macOS package for native computer use. It provides Accessibility snapshots, app/window discovery, screenshot capture, session management, and background mouse/keyboard delivery.

The package is a native runtime. The Electron app needs a bridge process between TypeScript tools and Swift APIs.

## Goal

Provide a stable `ComputerUseBackend` contract in the main process and a kwwk-backed implementation that can replace or sit beside `cua-driver`.

The first target flow is:

```text
state(app, includeScreenshot)
  -> clickElement(snapshotId, elementIndex)
  -> state(app, includeScreenshot)
```

This directly addresses unreliable clicks by favoring snapshot-backed element actions and using coordinate clicks only when the snapshot was captured with screenshot geometry.

## Architecture

```text
Agent tool call
  -> ToolExecutor
  -> ComputerUse tools
  -> ComputerUseBackend
  -> KwwkComputerUseBridgeClient
  -> Swift helper process
  -> KWWKComputerUseCore
```

The Swift helper owns the native session. The Electron main process owns tool policy, result normalization, request replay, and artifact handling.

## Backend Contract

`src/main/services/computerUse/ComputerUseBackend.ts` defines the product-facing boundary:

- `listApps()`
- `runningApps()`
- `openApp(input)`
- `listWindows(input)`
- `state(input)`
- `clickElement(input)`
- `clickCoordinate(input)`
- `typeText(input)`
- `setValue(input)`
- `pressKey(input)`
- `scroll(input)`
- `drag(input)`
- `finish()`

All methods return structured JSON-compatible values. Tool processors should avoid parsing agent-facing formatted text from the Swift layer.

## Bridge Protocol

Transport: newline-delimited JSON-RPC 2.0 over stdio.

Request:

```json
{"jsonrpc":"2.0","id":"1","method":"state","params":{"app":"Google Chrome","includeScreenshot":true}}
```

Response:

```json
{"jsonrpc":"2.0","id":"1","result":{"metadata":{"id":"snapshot-1"},"nodes":[]}}
```

Error:

```json
{"jsonrpc":"2.0","id":"1","error":{"code":"AX_PERMISSION_MISSING","message":"Accessibility permission is required"}}
```

The TypeScript client rejects timed-out requests and rejects pending requests if the helper exits.

## Method Mapping

| Backend method | Bridge method | Notes |
| --- | --- | --- |
| `diagnostics` | `diagnostics` | Reports helper path, process id, permission state, and code-signing metadata. |
| `requestPermissions` | `requestPermissions` | Requests macOS Accessibility and Screen Recording prompts, then reports permission state. |
| `listApps` | `apps` | Structured installed and running app descriptors. |
| `runningApps` | `runningApps` | Structured running GUI apps. |
| `openApp` | `openApp` | Accepts bundle id, exact name, partial name, or `.app` path. |
| `listWindows` | `windows` | Returns readable windows for the app. |
| `state` | `state` | Captures snapshot and updates helper session. |
| `clickElement` | `click` | Uses `snapshotId` and `elementIndex`. |
| `clickCoordinate` | `click` | Uses `snapshotId`, `x`, and `y`; requires screenshot-backed snapshot. |
| `typeText` | `typeText` | Can target an explicit editable element. |
| `setValue` | `setValue` | Uses AXValue where supported. |
| `pressKey` | `pressKey` | Sends key or key combination. |
| `scroll` | `scroll` | Uses AX scroll with event fallback in native layer. |
| `drag` | `drag` | Uses screenshot-backed coordinate path. |
| `finish` | `finish` | Releases native session state. |

## Artifact Policy

Screenshots should be returned as file paths or artifact descriptors. Inline base64 remains covered by `tool-result-normalization`, but the bridge should prefer path-based output.

Tool result normalization remains the shared context-budget layer:

- Current action result can include structured state and artifact paths.
- Historical image-heavy results replay as compact model content.
- Future VLM summaries can be attached by image hash.

## Permission Strategy

The helper process needs macOS Accessibility permission. In packaged builds, the helper should be signed with the app and launched from the app bundle so users approve the application identity. In development, the helper can run through `swift run`, and permission prompts may attach to the terminal or built helper binary.

The bridge should expose a clear permission error code:

- `AX_PERMISSION_MISSING`
- `SCREEN_CAPTURE_PERMISSION_MISSING`
- `APP_NOT_FOUND`
- `WINDOW_NOT_FOUND`
- `SNAPSHOT_EXPIRED`
- `ACTION_FAILED`

Runtime diagnostics are exposed through `computer_use_status`. This method does not trigger system permission prompts. Permission prompting is exposed through `computer_use_request_permissions`.

## Phased Implementation

1. Phase 1: TypeScript backend contract, stdio JSON-RPC client, timeout/error handling, and unit tests.
2. Phase 2: Swift helper executable using `KWWKComputerUseCore`.
3. Phase 3: Embedded tool definitions and processor wiring behind a backend selector.
4. Phase 4: Packaged helper signing, permission UX, and artifact lifecycle integration.
5. Phase 5: GUI probe tests for click reliability across Chrome, Finder, and Electron windows.

## Current Status

Phase 1 is implemented:

- `src/main/services/computerUse/ComputerUseBackend.ts`
- `src/main/services/computerUse/KwwkComputerUseBridgeClient.ts`
- `src/main/services/computerUse/index.ts`
- `src/main/services/computerUse/__tests__/KwwkComputerUseBridgeClient.test.ts`

Phase 2 is implemented:

- `native/kwwk-computer-use-bridge/Package.swift`
- `native/kwwk-computer-use-bridge/Sources/KwwkComputerUseBridgeCore/`
- `native/kwwk-computer-use-bridge/Sources/KwwkComputerUseBridge/main.swift`
- `native/kwwk-computer-use-bridge/Tests/KwwkComputerUseBridgeTests/`
- `resources/native/`

Build and test commands:

```bash
pnpm run native:kwwk:test
pnpm run native:kwwk:build
```

`native:kwwk:build` copies the release helper to `resources/native/kwwk-computer-use-bridge`, and `electron-builder.yml` packages `resources/native` as an extra resource.

The helper accepts `snapshotId` in action requests for protocol stability. `KWWKComputerUseCore.ComputerUseClient` executes actions against its latest session snapshot, so callers should keep one helper process alive for a related action sequence.

Phase 3 is implemented:

- `src/shared/tools/computerUse/definitions.ts`
- `src/shared/tools/computerUse/metadata.ts`
- `src/shared/tools/computerUse/index.d.ts`
- `src/main/tools/computerUse/ComputerUseBackendFactory.ts`
- `src/main/tools/computerUse/ComputerUseToolsProcessor.ts`
- `src/main/tools/computerUse/__tests__/ComputerUseToolsProcessor.test.ts`
- `src/main/tools/__tests__/embeddedToolsRegistration.test.ts`

Embedded tool names:

- `computer_use_apps`
- `computer_use_request_permissions`
- `computer_use_running_apps`
- `computer_use_status`
- `computer_use_open_app`
- `computer_use_windows`
- `computer_use_state`
- `computer_use_click_element`
- `computer_use_click_coordinate`
- `computer_use_type_text`
- `computer_use_set_value`
- `computer_use_press_key`
- `computer_use_scroll`
- `computer_use_drag`
- `computer_use_finish`

Backend selector:

- Default backend: `kwwk`
- `ATI_COMPUTER_USE_BACKEND=kwwk`
- `ATI_KWWK_BRIDGE_COMMAND=/absolute/path/to/kwwk-computer-use-bridge`

The processor returns `{ success, backend, result }` for successful calls and `{ success: false, backend, error }` for backend failures. The main agent has unrestricted access to these tools; subagents are denied by metadata because the tools operate on the user desktop.

Phase 4 is implemented:

- Swift helper `diagnostics` method reports:
  - `helperPath`
  - `processIdentifier`
  - Accessibility permission state
  - Screen Recording permission state
  - code-signing identifier and team id when available
- Swift helper `requestPermissions` method asks macOS for Accessibility and Screen Recording permission prompts.
- TS backend exposes `diagnostics()` and `requestPermissions()`.
- Embedded tools expose:
  - `computer_use_status`
  - `computer_use_request_permissions`
- `native:kwwk:build` produces the local helper binary in `resources/native/kwwk-computer-use-bridge`.
- `electron-builder.yml` packages `resources/native` as app extra resources.

Signing strategy:

- `resources/native/kwwk-computer-use-bridge` is generated locally and ignored by git.
- Packaged builds should run `pnpm run native:kwwk:build` before `electron-builder`.
- In signed macOS builds, the helper should be signed as part of the app bundle under `Contents/Resources/native/`.
- `computer_use_status` is the acceptance check for packaged builds: `codeSigning.signed` should be true, and permission prompts should target the packaged app/helper identity.

Phase 5 is implemented:

- `src/main/services/computerUse/probe/ComputerUseProbeRunner.ts`
- `src/main/services/computerUse/probe/__tests__/ComputerUseProbeRunner.test.ts`
- `scripts/computer-use-probe.mjs`
- `docs/specs/tools/computer-use-probe-scenarios.example.json`

Probe flow:

```text
diagnostics
  -> openApp
  -> state(includeScreenshot=true)
  -> resolve target element
  -> click(snapshotId, elementIndex)
  -> state(includeScreenshot=true)
  -> compare snapshot fingerprint
```

The unit tests use a fake backend. The real macOS GUI probe is explicit:

```bash
pnpm run native:kwwk:build
pnpm run computer-use:probe -- --scenarios docs/specs/tools/computer-use-probe-scenarios.example.json
```

When permissions need to be requested from the terminal/helper identity:

```bash
pnpm run computer-use:probe -- --request-permissions --scenarios docs/specs/tools/computer-use-probe-scenarios.example.json
```

Exit codes:

- `0`: all scenarios passed
- `1`: at least one scenario failed
- `2`: permissions are incomplete and `--allow-skip` was omitted

Real probe scenarios should be adapted to the machine state. The example file is a starting point for Finder and Chrome, and target selectors can use `elementIndex`, `role`, `titleIncludes`, `descriptionIncludes`, `valueIncludes`, and `identifierIncludes`. Text selectors accept either a string or a string array for locale-aware matching. When a target cannot be resolved, the probe prints a short candidate list for the requested role, falling back to a compact node sample when that role is absent.

Use `action: "state"` for smoke checks that should only verify app resolution and snapshot capture. Use `expectChange: false` for click checks where the action may succeed while the post-click AX fingerprint stays stable.

Scenarios can also provide `appCandidates`. The runner tries `app` first, then each candidate in order. This is useful for system apps where bundle id is more stable than display name:

```json
{
  "name": "finder-state",
  "app": "com.apple.finder",
  "appCandidates": [
    "Finder"
  ],
  "action": "state",
  "includeScreenshot": true
}
```

Troubleshooting `appNotFound Finder`:

- Run `computer_use_status` or the probe with `--request-permissions`.
- Check `permissions.accessibilityTrusted` and `permissions.screenCaptureTrusted`.
- If `apps` and `runningApps` are empty, app discovery has no visible candidates for the helper identity.
- Prefer bundle ids for system apps, for example `com.apple.finder`.
- The bridge treats already-running apps as a valid `openApp` result, which covers Finder and other resident system apps.
- LaunchServices warning lines such as `scheduleApplicationNotification` can appear on stderr during helper startup. Treat the JSON-RPC response as the authoritative probe output.

The next implementation step is production hardening: add a renderer diagnostics panel and persist probe reports under app data for support workflows.
