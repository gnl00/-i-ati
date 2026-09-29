# Speed Highlight reference

Source: [Upstream repository](https://github.com/speed-highlight/core)<br>
Upstream revision: Not pinned; the old API mirror did not record a revision<br>
Source checked: 2026-09-29<br>
Project dependency declaration: `@speed-highlight/core: ^1.2.12`<br>
Project use: Chat code highlighting and lazy theme loading

[SpeedCodeHighlight](../../src/renderer/src/features/chat/common/SpeedCodeHighlight.tsx)
uses `highlightElement`; [styleLoaders](../../src/renderer/src/shared/lib/styleLoaders.ts)
loads theme CSS. The copied language matrix, CDN setup and terminal examples were
removed because they were external library documentation rather than this app's
integration contract. Use local call sites and installed package types for changes.
