# react-resizable-panels reference

Source: [Upstream repository](https://github.com/bvaughn/react-resizable-panels)<br>
Upstream revision: Not pinned; the old README mirror did not record a version<br>
Source checked: 2026-09-29<br>
Project dependency declaration: `react-resizable-panels: ^2.1.7`<br>
Project use: Shared resizable layout wrappers

The app's [resizable wrapper](../../src/renderer/src/shared/components/ui/resizable.tsx)
uses the v2 `PanelGroup`, `Panel` and `PanelResizeHandle` API. Current upstream
main documents a different API; use the lockfile and installed v2 types when
maintaining this wrapper. Evaluate an API migration separately from copy cleanup.

The copied upstream README was removed. Shared interaction and visual rules remain
in [DESIGN.md](../../DESIGN.md).
