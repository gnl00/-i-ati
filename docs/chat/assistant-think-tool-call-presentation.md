# Assistant Think and Tool Call Presentation

## Status

Current as of 2026-07-31.

This document defines the renderer presentation contract for assistant
reasoning and visible tool calls. Provider and transcript contracts continue
to use the `reasoning` segment type; the user-facing label is `Think`.

Related contract:
[Assistant Completed Work Group](./assistant-completed-work-group.md) defines a
message-level disclosure that groups substantial supporting work when visible
answer text begins.

## Goals

The transcript presents two distinct kinds of supporting work:

- Think is a lightweight inline disclosure for model reasoning.
- Consecutive tool calls form a compact execution list with one inline detail
  region.

Each visible answer text segment closes the preceding support window. A window
with at least four reasoning/tool-call segments becomes a full-width `Work
completed` disclosure. Windows with one through three segments keep their
existing Think and Tool Call presentation.

Text, errors, reasoning segments, committed/preview layer changes, and order
gaps establish tool-list boundaries. This keeps transcript structure aligned
with the execution sequence.

## Think disclosure

Each reasoning segment renders as an independent disclosure:

```text
[lightbulb] THINK                              4s chevron
  expanded reasoning content
```

The header uses the shared four-area support-row skeleton: a 20px icon well,
primary and secondary text, optional duration, and a trailing action. The
primary label is `THINK`. Historical reasoning keeps the primary label compact;
active streaming reasoning adds `Reasoning in progress`. The trailing chevron
follows the duration. Explicit duration and trailing columns keep the right
controls aligned when the description or duration is absent. The control
exposes `aria-expanded` and `aria-controls`. Its wrapper uses 90% of the
assistant content width, and its horizontal inset matches the assistant text
`px-2` baseline.

The body stays mounted inside `SizeAnimatedPanel` while its expanded state
changes. It preserves Markdown rendering and malformed code-block repair.
Historical reasoning starts collapsed. The latest streaming reasoning starts
expanded. A user expansion choice applies for the lifetime of that rendered
segment.

Think uses the quietest transcript treatment:

- the Lightbulb icon well and all text use neutral slate values;
- the secondary status and duration use lower contrast than the primary label;
- a low-alpha bottom border remains visible in the resting state; hover and
  expansion raise its contrast and add a low-alpha neutral surface;
- the trigger keeps straight edges and flat elevation;
- the expanded body keeps a fine left rule and uses the full content width.

Reduced-motion mode removes the panel, chevron, and icon scale transitions.

Inside a `Work completed` disclosure, the Think chevron becomes a secondary
indicator. It uses a 12px size and 45% resting opacity, rises to 80% on row
hover or keyboard focus, and stays at 80% while expanded. The standalone Think
chevron retains its standard 14px size and contrast. Both presentations retain
the 180-degree open-state rotation and reduced-motion behavior. The nested
duration immediately before the chevron follows the same 45% resting and 80%
interactive opacity while keeping its existing typography and grid position.

## Tool call list

Adjacent tool calls in the same render layer and consecutive transcript order
form one tool list. A streaming singleton uses the same list shell so later
tool calls can append without replacing the outer surface.

The list uses one faint rounded neutral frame. Rows use internal separators and
use the same four-area support-row skeleton as Think:

1. semantic status icon;
2. original tool name and model-supplied `tool_call_reason`;
3. duration;
4. disclosure chevron.

Think and Tool Call share the same compact 20px icon well, 12px glyph, rounded
shape, and open-state scale. Think uses a neutral slate well. Tool calls retain
semantic well colors for completed, running, and failed states. The row and
list surfaces remain neutral. Tool names and reasons share a single truncating
text lane so the primary name, duration, and trailing control remain visible at
narrow widths.

The list frame occupies 90% of the available assistant content width. It uses
a very low-alpha border, translucent surface, and flat elevation. Row
separators stay visible at a lower contrast. Standalone tool triggers use the
same subdued border treatment, including selected and semantic states. The
expanded detail region uses a slightly stronger gray inset surface as the
primary hierarchy cue.

One row per list can be expanded. Its persistent `SizeAnimatedPanel` renders a
slightly tinted inset detail region directly below the row. The row control
owns inline expansion through `aria-expanded` and `aria-controls`.

Inside a `Work completed` disclosure, each Tool Call chevron uses the same
secondary-indicator treatment as Think: 12px, 45% resting opacity, 80% on row
hover or keyboard focus, and 80% while expanded. Standalone Tool Call
chevrons retain their standard 14px size and contrast. The adjacent nested
time-cost value follows the same opacity states while retaining its tabular
number styling and duration column.

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

A standalone tool-call result uses the same row skeleton and ends with a
`PanelRightOpen` icon. Its button preserves `aria-pressed` while selecting and
opening that tool call in the Tools inspector.

## Motion

`SizeAnimatedPanel` owns disclosure height and opacity. Row insertion uses the
existing restrained horizontal `x + scale` motion. These responsibilities stay
separate so appended tool rows and expanded detail regions do not compete for
layout animation.

The chat-window virtualizer owns viewport anchoring. Visual verification must
cover expansion near the viewport bottom and streaming append while the user
is following the tail.

## Implementation map

- `model/assistantMessageMapper.ts` provides all ordered answer text segments
  across committed and preview layers.
- `model/assistantSupportGrouping.ts` builds standalone reasoning units and
  tool-only groups, then derives a completed-work group for each qualifying
  support window closed by visible answer text.
- `renderers/AssistantCompletedWorkGroup.tsx` owns the full-width
  message-level disclosure. Nested Think and Tool Call containers expand from
  their standalone 90% width to the full disclosure width. The renderer passes
  an explicit nested-disclosure presentation context to each child unit.
- `segments/ReasoningSegment.tsx` owns the Think disclosure.
- `renderers/SupportSegmentHeader.tsx` owns the shared four-area display
  skeleton and visual tokens.
- `toolcall/ToolCallGroup.tsx` owns the tool-list shell, row expansion, and
  long-list visibility policy.
- `toolcall/ToolCallResult.tsx` owns shared tool status, row content, timing,
  and detail-body renderers.
- `toolcall/toolCallLayout.ts` owns the shared transcript width token.
- `toolcall/ToolCallInspectorContent.tsx` composes the stable Tools inspector.
- `renderers/AssistantSupportSegmentList.tsx` renders the projected units.

## Verification

Focused verification covers:

- grouping boundaries and streaming singleton shell stability;
- multiple content-window disclosures, the four-segment threshold, trailing
  live support, per-window errors, and preview-to-committed key stability;
- Think default state, semantic icon and status copy, duration order, 90%
  content width, horizontal inset, accessibility, and reduced motion;
- 90% width for grouped and standalone tool-call results;
- 12px secondary chevrons with 45% resting opacity and 80% hover, focus, and
  expanded opacity inside completed-work disclosures;
- nested duration and time-cost values with the same 45% resting and 80%
  interactive opacity states;
- standard 14px chevrons and contrast for standalone Think and Tool Call rows;
- shared four-area row order, icon sizing, hover/open feedback, and trailing
  action semantics;
- single-row expansion within a tool list;
- inline detail rendering and passive inspector selection;
- reason extraction and parameter filtering;
- persistent panel DOM identity;
- long-list visibility of active and failed calls;
- renderer typecheck, renderer architecture checks, and documentation paths.
