# Electron Header Drag And Blur

## Context

The chat window uses a frameless Electron window with a custom header. The header needs two behaviors at the same time:

- Native window dragging through `-webkit-app-region: drag`.
- A blurred header background that samples chat content as it scrolls underneath.

## Root Cause

Electron draggable regions are sensitive to Chromium hit testing and layer ordering.

In this app, `-webkit-app-region: drag` was present in computed styles, but native dragging still failed. The failure happened after CSS resolution, when Chromium/Electron tried to hand the region off to native window dragging.

The main triggers were:

- `position: fixed` and `position: absolute` on the header. Minimal test headers showed native dragging could fail once the header became a positioned overlay.
- `backdrop-filter` / `backdrop-blur` creating an additional composited paint layer.
- Background or mask layers intercepting the hit area when they were not isolated from pointer hit testing.
- A content container moved upward with `-mt-12` while carrying `app-undragable`, which allowed a `no-drag` region to overlap the header. In Electron, `no-drag` areas take priority over `drag` areas.
- App-level `app-dragable` on broad containers made drag-region calculation harder to reason about.

## Working Pattern

Keep the responsibilities separated:

- The outer header is the drag region.
- The blur is a separate visual background layer inside the header.
- The blur layer uses `pointer-events-none`.
- Interactive controls explicitly opt out of dragging with `app-undragable`.
- Broad content containers avoid `app-undragable` when they overlap the header.

```tsx
<header className="relative h-12 app-dragable">
  <div className="pointer-events-none absolute inset-0 backdrop-blur-xl" />

  <div className="pointer-events-none relative z-10 grid h-full">
    <button className="app-undragable pointer-events-auto">
      ...
    </button>
  </div>
</header>
```

Use Electron's standard value for non-draggable controls:

```css
.app-dragable {
  -webkit-app-region: drag;
}

.app-undragable {
  -webkit-app-region: no-drag;
}
```

## Layout Notes

For the chat blur effect, content may visually move under the header. The safe version is:

- Header remains in normal document flow.
- Header is not `fixed` or `absolute`.
- The following content can use layout overlap such as `-mt-12`.
- The overlapping content root should not be marked `app-undragable`.
- Actual interactive or scrollable controls can still use targeted `app-undragable` where needed.

This keeps the native drag hit region on the outer header while allowing the blurred background to sample moving content.

## Debugging Checklist

When dragging fails:

1. Verify the target has computed `-webkit-app-region: drag`.
2. Check if a higher or overlapping element has `-webkit-app-region: no-drag`.
3. Remove `position: fixed` / `position: absolute` from the drag element and retest.
4. Move `backdrop-blur` into a child background layer with `pointer-events-none`.
5. Remove broad `app-dragable` / `app-undragable` classes from app-level containers.
6. Test with a minimal header before adding controls and blur back.

## Current Implementation

The current chat header follows this pattern:

- `src/renderer/src/features/chat/shell/ChatHeader.tsx`
- `src/renderer/src/features/chat/shell/ChatWindow.tsx`
- `src/renderer/src/shared/assets/main.css`

Manual window-position dragging was removed after the native drag region was stabilized.
