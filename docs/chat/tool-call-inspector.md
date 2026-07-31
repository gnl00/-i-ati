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

Stats and Tools can open without loading the workspace tree. Preview or Files
mounts the workspace surface on first access. That surface stays mounted across
later tab changes to retain the selected file and preview server state. The
workspace footer appears with Preview and Files.

The chat header toggle opens and closes the Artifacts panel from both the
welcome and conversation surfaces. It preserves the active tab and current
tool selection across close and reopen.

Pressing Escape once closes the Artifacts panel by changing only
`artifactsPanelOpen`. The active tab and tool call selection remain available
when the panel opens again.

## Verification

- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallResult.test.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallInspectorBranches.test.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallInspectorContent.test.ts`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallGroup.test.tsx`
- `src/renderer/src/features/artifacts/__tests__/ArtifactsPanel.test.tsx`
- `src/renderer/src/features/chat/shell/__tests__/ChatHeader.test.tsx`
- `src/renderer/src/features/chat/state/__tests__/chatViewStore.test.ts`
