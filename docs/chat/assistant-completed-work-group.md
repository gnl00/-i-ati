# Assistant whole-turn work group

Updated: 2026-10-08.

## Presentation contract

A single assistant message owns one stable work disclosure from its first visible
support segment. Reasoning, tools and errors remain in transcript order
inside that disclosure. All text segments stay outside in their original text
order, including progress commentary. Later tools or reasoning never move earlier
text into the disclosure. Ordinary text has no reliable commentary/answer marker,
so the renderer preserves its visibility instead of inferring intent from position.
Ordinary text arrivals never close a work window or create another disclosure.

The disclosure is expanded during the run, including answer streaming and tool
execution. It automatically collapses only after normal whole-loop completion.
All text remains outside. Failed, aborted, incomplete and pending-tool
states stay expanded. A user's explicit open/closed choice survives updates;
focusing a control inside the process pins it open so completion cannot hide focus.
A newly failed, aborted or incomplete outcome reopens previously collapsed work.
The same mounted outer panel is retained across status changes.

The header uses quiet secondary text and a small chevron, with elapsed seconds and
a tool count when available. Both values use subtle neutral badges (`9s`,
`3 tool calls`) without dot separators. The two independent Soft badges have a
20px height, 5px corner radius, 6px horizontal padding, 10.5px tabular text and
a 5px gap. Light uses the inset surface at 45% opacity; Dark uses the raised
Chat surface at 55%. Secondary text uses 85% opacity in both themes. The badge
group stays 8px from the label and shares the header's disclosure action.
Labels and disclosure actions use English.
It has no card border. Short reasoning appears inline;
long reasoning has its own expansion control. Tool rows emphasize the action reason
(or tool name when absent); parameters and output remain in the existing detail
panel. All process tool rows remain available during execution, without the old
long-list hiding policy. Standalone tool inspectors retain their existing layout.

## Completion ownership and compatibility

Main's `AgentRenderStateReducer` derives `workStatus` and `workEndedAt` from terminal
loop events. Step completion alone saves `running`. A completed loop whose final
step has unified `finishReason: stop` saves `completed`; other finish reasons save
`incomplete`. Failed and aborted loops retain their own statuses. The host emits a
committed-message update before terminal lifecycle notification. `ChatRenderMapper`
copies these optional fields into the JSON message body, so history preserves the
same distinction without a database schema migration.

The renderer keeps the current message open while its run is active even if the
terminal message update has arrived. A persisted `running` message without a live
run is shown as incomplete. Legacy messages without metadata use visible answer,
error and pending-tool evidence; old histories cannot recover lost finish reasons.
Metadata does not enter provider prompts or change the agent loop's continuation.

Provider normalization uses the existing adapters. Responses checks for client
function calls before completion. Gemini non-success finish reasons and Claude
pause/refusal/context-limit reasons must not become a normal stop. This change
preserves Claude `pause_turn` as a non-success outcome; automatic server-tool
continuation is outside this presentation change.

## Implementation and verification

- `assistantSupportGrouping.ts` only merges adjacent reasoning and groups adjacent
  tools; ordinary text remains an ordering boundary, never a completion signal.
- `AssistantMessageBody.tsx` keeps all text outside one support-only work panel.
- `AssistantCompletedWorkGroup.tsx` owns expansion, focus preservation and timing.
- Existing incremental projection, reasoning playback, tool inspector and scroller
  remain responsible for their original concerns.

Tests cover terminal metadata, provider finish reasons, one stable group, answer
streaming, text followed by tools/reasoning and closing text, pending/error states,
manual expansion and focused controls. Verify the
Electron surface in Light/Dark at normal and compact widths, including completion,
reopen, failure and viewport anchoring. For renderer-only text visibility changes,
run the assistant-message suites, web typecheck and affected ESLint. Run the
applicable architecture and documentation path checks when imports or paths change.
Changes to shared terminal metadata or render lifecycles also require both
typechecks and full coverage.
