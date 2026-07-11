# Support Segment Streaming Group Motion

## Status

2026-07-03 implemented baseline. This document is the execution contract for smoothing the toolcall and thought accordion in `SupportSegmentGroup`.

2026-07-03 review follow-up fixed the main accordion height path by keeping one `support-segment-middle-panel` mounted for every collapsible group and toggling its `expanded` state between compact and detailed display.

The current production entry renders `Home` from `src/renderer/src/app/App.tsx`. `src/renderer/src/dev/test-pages/SupportSegmentStreamingMergeTestPage.tsx` remains a dormant visual playground file.

## Scope

Latest streaming assistant messages can render a single groupable support item as a `supportGroup`. This gives the renderer a stable shell before the next tool or thought item arrives.

This plan covers:

- accordion height animation inside `SupportSegmentGroup`
- collapsed, expanded, and auto-settled content continuity
- row append motion for tool and thought items
- expansion state ownership for user choice and force-expanded runtime items
- focused renderer tests and typecheck verification

Chat list scroll anchoring stays at the `ChatWindow` virtualizer boundary. Validate that collapse remains acceptable in the chat window after this change, then open a dedicated scroll-anchor slice if the viewport still jumps.

## Current Code Facts

- `buildSupportRenderUnits(items, { groupSingletons: true })` wraps singleton tool and reasoning items in a `supportGroup`.
- The streaming mapper enables singleton grouping for the latest streaming assistant message.
- Support groups stay bounded by layer, order adjacency, and groupable item type.
- The group key and expansion identity are anchored to the first support item, so appending later support items keeps the same shell.
- `projectSupportSegmentPhases()` groups adjacent tool and thought items. Phase keys use the first item key.
- `SupportSegmentGroup` keeps the outer group as a stable clipped shell and moves height animation into `SizeAnimatedPanel`.
- Accordion state uses a split render plan for collapsible groups: leading phases, one persistent middle `SizeAnimatedPanel`, collapsed-only summary, trailing phases, and expanded-only `Hide`.
- `fullFlowPhases` remains the direct render path for groups with three or fewer support items.
- Tool and thought append motion uses row-level opacity and y movement.
- `tailwind.config.js` defines `accordion-up` and `accordion-down`, so the Radix accordion shim has active keyframes in the current checkout.
- `SettingsCollapsibleArea` already uses the CSS grid-row height pattern, giving this repo a local precedent for `0fr -> 1fr` panel animation.

## Target Motion Contract

The group shell remains stable and owns only frame styling: width, border, background, radius, padding, and clipping.

Height animation moves to a shared primitive:

```tsx
<SizeAnimatedPanel expanded={isExpanded} reducedMotion={shouldReduceMotion}>
  {children}
</SizeAnimatedPanel>
```

The primitive uses CSS grid rows:

- expanded: `grid-rows-[1fr] opacity-100`
- collapsed: `grid-rows-[0fr] opacity-0`
- content wrapper: `min-h-0 overflow-hidden`
- transition: `280ms cubic-bezier(0.32,0.72,0,1)` for panel body movement
- reduced motion: static rows and opacity, with transition disabled

Row append motion stays in Framer Motion:

- transition: `180ms` to `200ms`, ease `[0.22, 1, 0.36, 1]`
- initial: `{ opacity: 0, y: 3 }`
- animate: `{ opacity: 1, y: 0 }`
- exit: `{ opacity: 0, y: -2 }`
- `scale` leaves the row append path

Summary and collapse controls use local opacity and y fades through `AnimatePresence`. These controls carry the state change affordance while the panel carries the height change.

## Target Structure

Use a renderer-local display plan:

```tsx
{
  fullFlowPhases: projectSupportSegmentPhases(items),
  collapsedPreview: {
    leadingPhases,
    hiddenItems,
    hiddenPhases,
    trailingPhases
  }
}
```

Expanded rules:

- render `collapsedPreview.leadingPhases` before the panel
- render `collapsedPreview.hiddenPhases` inside `SizeAnimatedPanel` with `expanded={true}`
- preserve original item order across thought and tool phase boundaries
- render `collapsedPreview.trailingPhases` after the panel
- render `CollapseRow` after the final support row

Collapsed rules:

- render leading preview phases first
- render hidden phases inside the same `SizeAnimatedPanel` with `expanded={false}`
- collapsed hidden panel receives `aria-hidden` and inert behavior from `SizeAnimatedPanel`
- render `SummaryRow` for the hidden item set
- render trailing preview phases last
- Item row keys stay anchored to support item keys.

## Expansion State Contract

Expansion derives from three inputs:

- `groupIdentity`: first support item key
- `expansionPolicy`: default expanded and force-expanded status
- `userExpansionChoice`: `{ identity, expanded }`

Runtime behavior:

- running, pending, and streaming-tail items force expanded display
- errored or failed completed items open by default so attention rows stay visible
- completed groups longer than three items default to compact summary
- a user expand or collapse choice applies only to the current `groupIdentity`
- force-expanded runtime items clear the current user choice before returning to completed policy

Implementation target:

- call `useReducedMotion()` unconditionally
- replace `trackedGroupIdentity`, `hasUserExpansionChoice`, and `isExpanded` sync effects with derived expansion plus one small user-choice state
- keep `forceReducedMotion` as the deterministic test override

## Shared Primitive

Create `src/renderer/src/shared/components/ui/size-animated-panel.tsx`.

Public API:

```tsx
export interface SizeAnimatedPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  expanded: boolean
  reducedMotion?: boolean
  contentClassName?: string
  children: React.ReactNode
}
```

Implementation notes:

- import `cn` from `@renderer/shared/lib/utils`
- render an outer grid container with `data-state`
- render an inner `min-h-0 overflow-hidden` content wrapper
- set `aria-hidden={!expanded}` on the outer panel
- set inert behavior while collapsed so mounted buttons inside hidden content stay out of focus order
- use Tailwind v4 syntax from [Tailwind CSS v4 syntax rules](../guides/development/tailwindcss-v4-syntax-rules.md)

Initial consumers:

- `SupportSegmentGroup` in this slice
- `SettingsCollapsibleArea` can migrate in a later slice after this primitive settles

## Implementation Steps

1. Add `SizeAnimatedPanel`. Completed.
   - File: `src/renderer/src/shared/components/ui/size-animated-panel.tsx`
   - Add focused tests only if TypeScript or DOM behavior needs coverage beyond `SupportSegmentGroup`.

2. Split motion tokens in `SupportSegmentGroup`. Completed.
   - File: `src/renderer/src/features/chat/message/assistant-message/renderers/SupportSegmentGroup.tsx`
   - Add separate names for panel and row append behavior.
   - Remove row append scale.
   - Remove outer `layout="size"` from the group shell.

3. Refactor expansion state. Completed.
   - Call `useReducedMotion()` before combining with `forceReducedMotion`.
   - Store user choice as `{ identity, expanded } | null`.
   - Derive `isExpanded` during render.
   - Clear current user choice when force-expanded runtime state appears.

4. Render split display plans. Completed.
   - Derive `fullFlowPhases` from every support item.
   - Derive collapsed `leadingPhases`, `hiddenItems`, `hiddenPhases`, and `trailingPhases`.
   - Collapsible expanded mode renders leading phases, the persistent expanded middle panel, trailing phases, then `CollapseRow`.
   - Collapsible collapsed mode renders leading phases, the persistent collapsed middle panel, `SummaryRow`, then trailing phases.
   - Keep test ids stable for `support-segment-group`, `support-segment-summary-row`, and `support-segment-collapse-row`.

5. Update tests. Completed.
   - File: `src/renderer/src/features/chat/message/assistant-message/__tests__/SupportSegmentGroup.test.tsx`
   - Update collapsed-state expectations so middle rows stay mounted under a collapsed panel.
   - Assert the same middle panel DOM node switches `data-state` through collapsed, expanded, and collapsed during Expand/Hide.
   - Assert the middle panel data-state, aria-hidden, and inert behavior.
   - Assert the outer group shell no longer receives Framer Motion layout props through the mock.
   - Assert row append initial props omit scale through the Framer Motion mock.
   - Assert expanded mixed sequences keep item DOM order and `Hide` follows the final support row.
   - Assert tail thoughts stay in one expanded thought phase.
   - Keep existing shell identity and user-choice append coverage.

6. Update documentation. Completed.
   - Keep this file aligned with implementation details.
   - Record any motion token changes under `Target Motion Contract`.
   - Record verification command results under `Verification Log`.

## Verification

Run focused tests:

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/renderer/src/features/chat/message/assistant-message/__tests__/SupportSegmentGroup.test.tsx \
  src/renderer/src/features/chat/message/assistant-message/__tests__/AssistantSupportSegmentList.test.tsx \
  src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageRenderModel.test.ts
```

Run renderer typecheck:

```bash
pnpm_config_verify_deps_before_run=false pnpm run typecheck:web
```

Run whitespace check before commit:

```bash
git diff --check
```

Manual visual checks:

- a completed five-item support group starts compact
- expanding reveals middle rows through a height gate
- expanded support rows render in original order
- expanded tail thoughts stay grouped in one thought phase
- expanded collapse control appears after the final support row
- collapsing keeps first and last rows visually stable
- running or pending items force expanded display
- completed runtime items return to compact display
- row append has opacity and y movement without shimmer
- reduced motion renders the same content states with static transitions

## Verification Log

2026-07-03 earlier baseline passed:

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/renderer/src/features/chat/message/assistant-message/__tests__/SupportSegmentGroup.test.tsx \
  src/renderer/src/features/chat/message/assistant-message/__tests__/AssistantSupportSegmentList.test.tsx \
  src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageRenderModel.test.ts
```

Result: 3 test files passed, 30 tests passed.

```bash
pnpm_config_verify_deps_before_run=false pnpm run typecheck:web
```

Result: passed.

2026-07-03 root-cause split passed:

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/renderer/src/features/chat/message/assistant-message/__tests__/SupportSegmentGroup.test.tsx \
  src/renderer/src/features/chat/message/assistant-message/__tests__/AssistantSupportSegmentList.test.tsx \
  src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageRenderModel.test.ts
```

Result: 3 test files passed, 32 tests passed.

Covered evidence:

- expanded mixed sequence rows appear in support item order
- `Hide` follows the final expanded support row
- collapsed preview keeps `SizeAnimatedPanel` `aria-hidden` and inert
- user-expanded append keeps full-flow order and the collapse control at the end
- failed completed tool rows open by default and still collapse through `Hide`
- running and pending tool rows keep force-expanded display after `Hide`

2026-07-03 review middle-panel fix passed:

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/renderer/src/features/chat/message/assistant-message/__tests__/SupportSegmentGroup.test.tsx
```

Result: 1 test file passed, 16 tests passed.

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/renderer/src/features/chat/message/assistant-message/__tests__/SupportSegmentGroup.test.tsx \
  src/renderer/src/features/chat/message/assistant-message/__tests__/AssistantSupportSegmentList.test.tsx \
  src/renderer/src/features/chat/message/assistant-message/__tests__/assistantMessageRenderModel.test.ts
```

Result: 3 test files passed, 32 tests passed.

Covered evidence:

- `support-segment-middle-panel` exists while collapsed and expanded
- the same middle panel DOM node switches `data-state` from `collapsed` to `expanded` to `collapsed` through Expand and Hide
- collapsed middle panel keeps `aria-hidden` and inert
- expanded support rows keep original DOM order and `Hide` follows the final support row
- failed completed tool rows open by default and collapse through `Hide`
- running and pending tool rows keep force-expanded display after `Hide`

```bash
pnpm_config_verify_deps_before_run=false pnpm run typecheck:web
```

Result: passed.

```bash
git diff --check
```

Result: passed.

## Plan Update Rule

Any plan change updates this file before code changes continue. Keep three sections current:

- `Target Motion Contract`
- `Implementation Steps`
- `Verification Log`

This document is the source of truth for the current support-segment accordion motion slice.
