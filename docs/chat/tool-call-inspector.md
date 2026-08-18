# Tool Call Inspector

## Purpose

Tool call details have two coordinated reading surfaces:

- the chat transcript exposes one inline detail region inside each tool list;
- the Artifacts panel Tools tab provides a stable, full-height inspector.

Clicking a tool row controls its inline disclosure. Expanding the row also
stores that call as the current inspector selection while preserving the
Artifacts panel and tab state. The chat header provides the general panel
toggle, while the tool-call inspect action opens the Tools tab with the
selected call. The panel preserves a stable reading surface while virtualized
transcript rows mount and unmount.

## Selection contract

`chatViewStore` stores `ToolCallInspectorSelection` with `chatUuid`,
`segmentId`, and an optional `toolCallId`.

- `chatUuid` constrains resolution to the active conversation.
- `segmentId` is the tool segment identity and resolves the selected segment.
- `toolCallId` addresses live output through the per-chat live-output key.

The inspector searches committed messages followed by `preview.message`, with
the latest exact `segmentId` match winning. Missing selections render a
directed empty state.

`selectToolCall` updates only the selection. `inspectToolCall` remains the
explicit action that selects a call, activates the Tools tab, and opens the
Artifacts panel.

## Layout

Inline details use a lightly tinted inset surface below the selected tool row.
One row per contiguous tool list can be expanded. The disclosure composes the
same detail body as the Tools inspector.

The inspector header uses one semantic status chip beside the original tool
name and duration. The reason sits on a second line. The segment ID stays
internal to selection resolution. The tool call ID appears as low-priority
read-only metadata and connects live output.

A fine execution spine connects three flat, edge-to-edge sections:

1. Parameters shows complete executable arguments and filters
   `tool_call_reason`.
2. Execution output shows retained stdout and stderr with pinned-tail behavior.
3. Result shows the terminal payload.

Each section has an independent copy action. Complex parameter values use
light inset surfaces. The Parameters content grows naturally up to the smaller
of 280px and 35% of the viewport height, then scrolls within its content area.
Its title and copy action stay above that viewport, and reaching a scroll
boundary continues the surrounding scroll chain. Live output and raw payloads
use terminal surfaces while formatted results stay on the panel canvas. Long
payloads use 1,500-character and 24-line preview budgets with Preview and Full
views. Specialized web search, wiki, and subagent results use Formatted and Raw
views.

See [Assistant Think and Tool Call Presentation](./assistant-think-tool-call-presentation.md)
for transcript grouping, inline disclosure, accessibility, and motion rules.

## Artifacts lifecycle

Overview and Tools can open without loading the workspace tree. Preview or Files
mounts the workspace surface on first access. That surface stays mounted across
later tab changes to retain the selected file and preview server state. The
workspace footer appears with Preview and Files.

The chat header toggle opens and closes the Artifacts panel from both the
welcome and conversation surfaces. It preserves the active tab and current
tool selection across close and reopen. The shared side-panel layout also
preserves the last committed width while the panel is closed and while the
welcome surface transitions into a conversation.

The vertical separator supports pointer dragging plus Arrow Left, Arrow Right,
Home, and End keyboard controls. The right panel targets 40% of the available
width, keeps a 320px minimum at regular window sizes, and clamps safely when
the window is too narrow for two 320px panes.

## Side-panel motion

The wide-screen shell is a flex row: the primary workspace is `flex-1` and the
panel region is an in-flow `shrink-0` column. The panel's structural width is a
derived motion value, `clamp(progress, 0, 1) * (panel width + gutter)`, so the
primary workspace shrinks continuously as the remainder of the row. Layout is
never deferred to the end of the animation, and the transcript never absorbs a
single-frame jump.

One Framer Motion progress value drives the structural width, panel opacity, and
the complete `translate3d(...)` transform. It uses a `{ type: 'spring',
duration: 0.42, bounce: 0.1 }` transition, so rapid reversals continue from the
current visual progress rather than restarting.

The panel content is an absolutely positioned fixed-width surface inside the
`overflow-hidden` region. Its width tracks `previewWidth` alone, so the shrinking
region clips it rather than reflowing it, and panel content never re-wraps during
the animation. No `clipPath` is involved: the animated region width is the clip.

Pointer movement updates `previewWidth` through one animation frame, and the
structural width follows it, so the primary workspace resizes live during a drag.
Pointer release commits the width and stores the preference. Keyboard steps commit
directly; their resize-mode feedback remains visible for 120ms. Committed widths
remain available across close, reopen, and layout remounts.

At container widths from 648px upward, the panel pushes the primary workspace.
Below 648px it becomes a right-aligned overlay, keeping the primary workspace
width stable while opacity and an 8px horizontal offset communicate open and
close. The 8px offset applies only in overlay mode, where layout cannot express
the motion; in push mode the width itself carries it. Overlay width is capped at
480px with a 24px viewport inset. The fixed-width inner surface uses layout and
paint containment in both modes.

The transcript is constrained to a centered `max-w-4xl` column, and the scroll
container reserves a stable scrollbar gutter. Most of the animation's travel
therefore only changes the auto margins, so message text does not re-wrap and the
virtualizer does not re-measure until the pane narrows below the cap.

`ChatWindow` enables react-virtual direct DOM updates in `transform` mode. The
virtualizer owns the inner list height through `containerRef` and each row
transform through the measured item ref. A row resize writes geometry and scroll
compensation in the same virtualizer call stack. This covers `start` anchoring
through `shouldAdjustScrollPositionOnItemSizeChange` and `end` anchoring through
the `wasAtEnd` branch.

The Artifacts root DOM and its Preview/dev-server lifecycle stay mounted across
visual close and reopen. Closing immediately applies `inert` and `aria-hidden`;
the spring progress continues toward zero and then applies `visibility: hidden`.
Opening restores visibility before the progress animation starts. Reduced-motion
mode keeps a 100ms opacity response and holds the complete transform at
`translate3d(0px, 0px, 0px)`. Escape restores focus to the element that opened
the persistent panel.

The header toggle is the visible close control. The generic side-panel layout
owns the capture-phase Escape listener while open and delegates close through
`onClose`; the closed panel has no Escape listener. The active tab and tool call
selection remain available when the panel opens again.

## Verification

- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallResult.test.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallInspectorBranches.test.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallInspectorContent.test.ts`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallGroup.test.tsx`
- `src/renderer/src/features/artifacts/__tests__/ArtifactsPanel.test.tsx`
- `src/renderer/src/features/chat/shell/__tests__/ChatHeader.test.tsx`
- `src/renderer/src/features/chat/shell/__tests__/ChatSidePanelLayout.test.tsx`
- `src/renderer/src/features/chat/shell/__tests__/ChatWindow.virtual-list.test.tsx`
- `src/renderer/src/features/chat/state/__tests__/chatViewStore.test.ts`

Manual acceptance covers open, close, rapid open-close-open reversal, pointer
dragging under live transcript load, keyboard resizing, welcome-to-conversation
width retention, and reduced-motion behavior at 500px, 640px, and 1000px
window widths.
