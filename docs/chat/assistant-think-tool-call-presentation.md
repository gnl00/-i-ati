# Assistant Think and Tool Call Presentation

## Status

Current as of 2026-07-30.

This document defines the renderer presentation contract for assistant
reasoning and visible tool calls. Provider and transcript contracts continue
to use the `reasoning` segment type; the user-facing label is `Think`.

## Goals

The transcript presents two distinct kinds of supporting work:

- Think is a lightweight inline disclosure for model reasoning.
- Consecutive tool calls form a compact execution list with one inline detail
  region.

Text, errors, reasoning segments, committed/preview layer changes, and order
gaps establish tool-list boundaries. This keeps transcript structure aligned
with the execution sequence.

## Think disclosure

Each reasoning segment renders as an independent disclosure:

```text
Think · 4s ----------------------------------------- chevron
  expanded reasoning content
```

The header contains the stable `Think` label, optional duration, a flexible
hairline, and a chevron. The control exposes `aria-expanded` and
`aria-controls`. Its horizontal inset matches the assistant text `px-2`
baseline.

The body stays mounted inside `SizeAnimatedPanel` while its expanded state
changes. It preserves Markdown rendering and malformed code-block repair.
Historical reasoning starts collapsed. The latest streaming reasoning starts
expanded. A user expansion choice applies for the lifetime of that rendered
segment.

Think uses the quietest transcript treatment:

- the label uses slate-400 with medium weight and gains one contrast step while
  expanded;
- duration, hairline, and chevron use lower-contrast neutral values;
- hover raises neutral contrast without adding a filled surface;
- the expanded body keeps a fine left rule and uses the full content width.

Reduced-motion mode removes the panel transition and chevron rotation
transition.

## Tool call list

Adjacent tool calls in the same render layer and consecutive transcript order
form one tool list. A streaming singleton uses the same list shell so later
tool calls can append without replacing the outer surface.

The list uses one faint rounded neutral frame. Rows use internal separators and
show:

1. semantic status icon;
2. original tool name and model-supplied `tool_call_reason`;
3. duration and disclosure chevron.

Status color stays on the compact icon. The row and list surfaces remain
neutral. Tool names and reasons share one line when space permits and use a
stacked layout at narrow widths.

The list frame uses a low-alpha border and translucent surface without a
shadow. Row separators stay visible at a lower contrast. The expanded detail
region uses a slightly stronger gray inset surface as the primary hierarchy
cue.

One row per list can be expanded. Its persistent `SizeAnimatedPanel` renders a
slightly tinted inset detail region directly below the row. The row control
owns inline expansion through `aria-expanded` and `aria-controls`.

Lists up to eight calls show every row. Longer lists keep active and failed
calls visible and expose a count-based control for the remaining completed
calls.

## Shared tool details

Inline details and the Artifacts Tools inspector compose the same tool-detail
body:

- Parameters, with `tool_call_reason` filtered from executable arguments;
- retained execution output;
- terminal result;
- formatted Web search, Wiki, and subagent results;
- raw/preview/full controls for large payloads.

Expanding a transcript tool row stores that call as the current inspector
selection while preserving the current Artifacts tab and panel state. The
Floating Artifacts **Tools** action opens the Tools tab with the most recently
expanded call.

The Tools inspector remains the stable reading surface for long output and for
tool calls whose virtualized transcript row has unmounted.

## Motion

`SizeAnimatedPanel` owns disclosure height and opacity. Row insertion uses the
existing restrained horizontal `x + scale` motion. These responsibilities stay
separate so appended tool rows and expanded detail regions do not compete for
layout animation.

The chat-window virtualizer owns viewport anchoring. Visual verification must
cover expansion near the viewport bottom and streaming append while the user
is following the tail.

## Implementation map

- `model/assistantSupportGrouping.ts` builds standalone reasoning units and
  tool-only groups.
- `segments/ReasoningSegment.tsx` owns the Think disclosure.
- `toolcall/ToolCallGroup.tsx` owns the tool-list shell, row expansion, and
  long-list visibility policy.
- `toolcall/ToolCallResult.tsx` owns shared tool status, row content, timing,
  and detail-body renderers.
- `toolcall/ToolCallInspectorContent.tsx` composes the stable Tools inspector.
- `renderers/AssistantSupportSegmentList.tsx` renders the projected units.

## Verification

Focused verification covers:

- grouping boundaries and streaming singleton shell stability;
- Think default state, duration, horizontal inset, accessibility, and reduced
  motion;
- single-row expansion within a tool list;
- inline detail rendering and passive inspector selection;
- reason extraction and parameter filtering;
- persistent panel DOM identity;
- long-list visibility of active and failed calls;
- renderer typecheck, renderer architecture checks, and documentation paths.
