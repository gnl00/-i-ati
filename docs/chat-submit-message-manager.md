# ChatSubmit Message Manager Updates

Date: 2026-01-08

## Goals
- Ensure command tools run under the selected workspace.
- Keep tool-call request/response chains consistent during streaming.
- Make cancellation and UI state handling deterministic.
- Consolidate message persistence via MessageManager.

## Key Changes
1) Workspace-aware command execution
- `execute_command` now accepts `chat_uuid`.
- Main process resolves the workspace path from the DB using `chat_uuid`.
- Tool executor injects `chat_uuid` automatically for embedded `execute_command`.

2) Tool-call chain consistency
- Tool calls are merged into the last assistant message, not the last message.
- Tool results are saved to SQLite immediately to avoid loss on cancel/error.
- Requests are rebuilt from `session.messageEntities` each cycle.
- Tool failure now produces a `tool` message as well, keeping the chain intact.

3) Unified cancel path
- `useChatSubmit` returns `cancel()` and Stop uses it.
- Cancel triggers machine cancel and resets UI states.
- Input is disabled during streaming; placeholder shows "Processing...".

4) Prepare/finalize message persistence
- `prepare.ts` uses MessageManager for user + initial assistant messages.
- `finalize.ts` updates assistant content from segments and persists tool messages.
- `session.messageEntities` remains the single in-memory source for request rebuild.

5) Stream orchestration alignment
- Non-stream response updates the last assistant message without losing ID/meta.
- Tool-call placeholder content is rebuilt from the last assistant segments.

## Behavior Summary
- Commands execute in the selected workspace for the chat.
- Tool-call request/response pairs always stay aligned.
- Cancel is safe and leaves no dangling state.
- Concurrent submit attempts are ignored while a machine is active.

## Suggested Manual Checks
1) Custom workspace: run `pwd` via tool and verify it matches the selected workspace.
2) Tool call flow: trigger a tool twice in one conversation and ensure tool results appear in the next request.
3) Cancel: click Stop during streaming and confirm UI resets and no extra tool messages appear.
4) Non-stream: use a non-stream provider and confirm assistant message ID is preserved.
