# Assistant Completed Work Group

## Status

Implemented as of 2026-07-31.

This document extends the current
[Assistant Think and Tool Call Presentation](./assistant-think-tool-call-presentation.md)
contract with a message-level disclosure for supporting work that precedes the
next visible answer text.

## Observed stream contract

The conversation started at 2026-07-31 10:20 provides a representative trace.
The model completed nine tool-call rounds before the final answer round. Each
tool-call round used these OpenAI-compatible stream fields:

- `choices[0].delta.reasoning_content` for reasoning;
- `choices[0].delta.tool_calls` for tool-call assembly;
- `choices[0].finish_reason = "tool_calls"` for the transition into tool
  execution.

The final model round emitted more reasoning, then produced the first non-empty
`choices[0].delta.content` value at 10:21:07.874:

```json
{
  "delta": {
    "content": "好文章",
    "role": "assistant"
  }
}
```

The same round completed with `choices[0].finish_reason = "stop"` at
10:21:18.409.

The request adapter and model response parser already preserve the field
distinction:

| Provider field | Adapter field | Runtime delta | Presentation role |
| --- | --- | --- | --- |
| `delta.reasoning_content` | `delta.reasoning` | `reasoning_delta` | Supporting work |
| `delta.tool_calls` | `delta.toolCalls` | `tool_call_started` and `tool_call_ready` | Supporting work |
| non-empty `delta.content` | `delta.content` | `content_delta` | Visible answer text |
| `finish_reason = "tool_calls"` | `finishReason` | `finish_reason` | Tool-round completion |
| `finish_reason = "stop"` | `finishReason` | `finish_reason` | Run completion |

The first non-empty `content_delta` is the earliest useful presentation signal.
The final `stop` signal arrives after the answer body has streamed.

## Goal

Each non-empty answer text segment closes the supporting-work window since the
previous non-empty answer text. A window containing at least four reasoning and
tool-call segments collapses into one full-width disclosure. This applies to
the initial answer boundary and to later answer text that follows another
reasoning/tool execution run.

Before answer text appears, reasoning and tool calls retain their current live
presentation. Supporting work after the latest answer text also stays live
until another non-empty text segment arrives. Historical messages derive the
same grouping from their stored segments.

## User-facing contract

The collapsed trigger follows the current Think trigger language:

```text
[list-check icon] WORK COMPLETED                              chevron
```

- The trigger occupies 100% of the assistant content width.
- The icon uses a neutral `ListChecks`-style treatment.
- The primary label is `Work completed`.
- The description and duration columns remain empty.
- The trailing chevron communicates expansion state.
- The trigger exposes `aria-expanded`, `aria-controls`, and a state-specific
  accessible label: `Expand completed work` or `Collapse completed work`.
- The wrapper keeps the assistant text `px-2` horizontal alignment.
- The surface uses the same quiet border, hover, focus, open-state, dark-mode,
  and reduced-motion treatment as Think.

The expanded panel presents the original reasoning and tool-call units in
transcript order. Existing Think disclosures, tool-call lists, tool details,
tool status, and inspector selection behavior remain available inside the
group. The outer disclosure owns the message-level collapse. Inner disclosures
continue to own reasoning content and individual tool details. Their containers
use 100% of the disclosure content width, adding ten percentage points to the
standalone 90% width.

The outer chevron is the primary disclosure indicator and retains the standard
14px size and contrast. Inner Think and Tool Call chevrons form a secondary
indicator layer:

- nested chevrons use a 12px size;
- their resting opacity is 45%;
- row hover and keyboard focus raise opacity to 80%;
- expanded rows hold 80% opacity and retain the 180-degree rotation;
- reduced-motion mode removes both opacity and rotation transitions.

The duration or time-cost value immediately before each nested chevron follows
the same 45% resting and 80% hover, keyboard-focus, and expanded-state opacity.
Its font size, tabular-number treatment, and grid position remain unchanged.

Standalone Think and Tool Call chevrons retain their standard 14px size and
contrast. The nested presentation context is explicit and independent from the
full-width layout context.

## Group boundary

The renderer derives each completed-work window from ordered message segments:

1. Visit every text segment whose `content.length` is greater than zero.
   Whitespace and a leading newline count as answer-channel output.
2. For each visible text boundary, collect support segments since the previous
   visible text boundary.
3. Count the reasoning and tool-call segments in that window.
4. A count of four or more creates one completed-work group containing the
   existing standalone Think and consecutive Tool Call units.
5. A count from one through three keeps those units in their existing top-level
   presentation.
6. Support segments after the final visible text stay top-level and live until
   another visible text boundary arrives.

An error segment keeps its complete window in the current top-level
presentation. Other windows in the same assistant message are evaluated
independently. Tool-call failures remain tool-call rows, count toward the
four-segment threshold, and can appear inside the completed-work group when the
agent recovers and produces answer text.

A window with a single reasoning segment keeps its existing Think disclosure.
A window with a single tool call keeps its existing Tool Call presentation.
Two and three segment windows also retain their existing top-level units. The
four-segment threshold focuses the message-level disclosure on execution traces
that materially displace answer text in the viewport.

## State model

| Message state | Presentation |
| --- | --- |
| Supporting work is streaming and answer text is absent | Current live Think and Tool Call presentation |
| A non-empty text segment arrives | Its eligible preceding window becomes one collapsed completed-work group |
| Answer text continues streaming | Existing groups stay collapsed and answer remains primary |
| Supporting work starts after answer text | Current Think and Tool Call presentation stays live |
| A later non-empty text segment arrives | The intervening eligible window becomes its own completed-work group |
| User expands the group | Original support units appear in a persistent animated panel |
| User collapses the group | Panel animates closed and retains its mounted content |
| Run completes and preview becomes committed | Stable group identity preserves the outer disclosure choice |
| Historical message loads | Group is derived and starts collapsed |

Each group key uses its closing text boundary identity. Runtime
`preview:`/`committed:` prefixes are normalized out of that identity so a
preview-to-committed transition preserves the component instance and the outer
disclosure choice.

Automatic grouping is an atomic layout transition. User-triggered expansion
and collapse use `SizeAnimatedPanel`. This keeps the first answer token visible
promptly and avoids a transient expanded group that would add height before
collapsing.

## Implementation

Keep this feature inside the assistant renderer projection:

- `model/assistantMessageMapper.ts` passes all ordered text and support items
  across committed and preview segments into the grouping projection.
- `model/assistantSupportGrouping.ts` performs one linear scan across visible
  text boundaries and support items, builds leaf support units, applies the
  per-window threshold, and returns zero or more message-level groups.
- `renderers/AssistantSupportSegmentList.tsx` renders top-level leaf units and
  the completed-work group.
- `renderers/AssistantCompletedWorkGroup.tsx` owns the full-width
  trigger, accessible disclosure state, and `SizeAnimatedPanel`.
- `SupportSegmentHeader` supplies the existing four-area trigger skeleton.
- Existing Think and Tool Call renderers supply the expanded group contents.

Message segments, runtime events, IPC payloads, persistence schema, and provider
adapters retain their current contracts. Group membership remains a derived
presentation fact.

The renderer interleaves text and support elements with shared CSS `order`
values inside one flex column. Each completed-work group keeps the first
grouped support order, while every answer text segment retains its existing
order. This preserves transcript sequencing across multiple disclosures.

## Scroll and motion

The chat-window virtualizer remains the owner of viewport anchoring. Group
creation changes the measured assistant-message height, and the existing
follow-tail behavior should keep the first answer text visible. The component
does not issue its own `scrollIntoView` call.

`SizeAnimatedPanel` handles user-driven panel height and opacity. The chevron
uses the current restrained rotation. Inner chevrons transition only transform
and opacity. Reduced-motion mode removes panel and chevron transitions. Group
creation itself avoids decorative entrance motion.

## Scope boundaries

This implementation changes assistant-message rendering and its active presentation
documentation. These contracts retain their current behavior:

- provider stream parsing;
- agent-loop sequencing and tool execution;
- message persistence;
- tool-result compaction;
- individual Think content rendering;
- individual tool detail rendering and the Tools inspector;
- support-segment status and timing calculations.

The agent loop awaits terminal tool-batch dispatch before starting the next
model step. This sequencing supports the `Work completed` label when final answer text
begins.

## Verification

### Projection tests

- reasoning and tool calls remain top-level while answer text is absent;
- each non-empty text closes its preceding support window;
- an eligible window between two content segments creates a group;
- multiple eligible windows create independent groups;
- empty text segments leave the current support window open;
- a leading newline establishes the boundary;
- one through three reasoning/tool-call segments keep their existing
  top-level presentation;
- four or more reasoning/tool-call segments create the group;
- trailing support units remain top-level and live;
- errors preserve top-level visibility for their own window;
- later eligible windows still group after an earlier error window;
- failed tool calls remain inside a recovered completed-work group;
- committed and preview segments participate in one ordered boundary;
- real `preview:`/`committed:` boundary ids produce a stable group key.

### Component tests

- the trigger label is `Work completed`;
- description and duration content are absent;
- wrapper and trigger use full available width;
- nested Think and Tool Call containers use full available width;
- nested Think and Tool Call chevrons use the secondary 12px, 45% resting
  treatment;
- nested duration and time-cost values use the same 45% resting and 80%
  interactive opacity treatment;
- nested row hover, keyboard focus, and expanded state raise chevron opacity to
  80%;
- standalone Think and Tool Call chevrons retain their standard treatment;
- `aria-expanded`, `aria-controls`, and accessible labels follow disclosure
  state;
- historical and newly created groups start collapsed;
- user expansion reveals the original ordered support units;
- user collapse keeps the panel DOM mounted;
- reduced-motion mode removes transitions;
- tool-row expansion and Tools inspector selection continue to work inside the
  group.

### Manual acceptance

Replay a conversation with several reasoning/tool-call rounds before and
between answer text segments, then confirm:

1. Every active reasoning and tool-call unit remains visible before answer
   text.
2. Each answer boundary converts an eligible preceding window into one
   collapsed full-width `Work completed` row.
3. One through three support segments retain their existing presentation.
4. The answer stays within the followed viewport.
5. Expanding each row restores its complete ordered process.
6. Tool details, failed states, long-list controls, and dark mode retain their
   current behavior.
7. Reloading the conversation produces the same collapsed grouping.
8. Inner chevrons remain faint at rest, strengthen on hover and keyboard focus,
   and stay strengthened while their row is expanded.

### Commands

```bash
pnpm_config_verify_deps_before_run=false pnpm exec vitest run \
  src/renderer/src/features/chat/message/assistant-message/__tests__
pnpm run typecheck:web
pnpm run check:renderer-boundaries
pnpm run check:renderer-doc-paths
pnpm run test:renderer-architecture
git diff --check
```

The focused assistant-message suite passed with 21 files and 107 tests on
2026-07-31. `pnpm run typecheck:web` also passed.

## Premise check

This implementation treats every non-empty `content_delta` segment as an
answer-channel boundary. A provider may emit user-visible commentary before a
later tool run. The next text segment closes that later support window and
groups it when the four-segment threshold is met. The transcript retains every
segment and each grouped window remains independently expandable.
