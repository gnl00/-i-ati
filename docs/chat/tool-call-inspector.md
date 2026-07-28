# Tool Call Inspector

## Purpose

Tool call details live in the Artifacts panel under the Tools tab. Clicking a
tool row opens the panel and selects that call in one state update. The chat
transcript remains the execution history; the panel provides a stable reading
surface while virtualized transcript rows mount and unmount.

## Selection contract

`chatViewStore` stores `ToolCallInspectorSelection` with `chatUuid`,
`segmentId`, and an optional `toolCallId`.

- `chatUuid` constrains resolution to the active conversation.
- `segmentId` is the tool segment identity and resolves the selected segment.
- `toolCallId` addresses live output through the per-chat live-output key.

The inspector searches committed messages followed by `preview.message`, with
the latest exact `segmentId` match winning. Missing selections render a
directed empty state.

## Layout

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
light inset surfaces. Live output and raw payloads use terminal surfaces while
formatted results stay on the panel canvas. Long payloads use 1,500-character
and 24-line preview budgets with Preview and Full views. Specialized web
search, wiki, and subagent results use Formatted and Raw views.

## Artifacts lifecycle

Stats and Tools can open without loading the workspace tree. Preview or Files
mounts the workspace surface on first access. That surface stays mounted across
later tab changes to retain the selected file and preview server state. The
workspace footer appears with Preview and Files.

The floating Artifacts pill includes a Tools action and follows the existing
Artifacts lifecycle. It appears while Artifacts is active and the panel is
closed. Clicking the action opens the Tools tab.

Pressing Escape once closes the Artifacts panel by changing only
`artifactsPanelOpen`. The active tab and tool call selection remain available
when the panel opens again.

## Verification

- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallResult.test.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallInspectorBranches.test.tsx`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/ToolCallInspectorContent.test.ts`
- `src/renderer/src/features/chat/message/assistant-message/__tests__/SupportSegmentGroup.test.tsx`
- `src/renderer/src/features/artifacts/__tests__/ArtifactsPanel.test.tsx`
- `src/renderer/src/features/artifacts/__tests__/FloatingArtifactsToggle.test.tsx`
- `src/renderer/src/features/chat/state/__tests__/chatViewStore.test.ts`
