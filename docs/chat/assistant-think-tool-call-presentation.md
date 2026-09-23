# Assistant Think and Tool Call Presentation

## Current message-level presentation

The [whole-turn work group](./assistant-completed-work-group.md) owns the current
Chat presentation. Work remains expanded through answer streaming and collapses
only on normal whole-run completion. Short reasoning is inline without repeated
Thought headers. Tool rows use an action description, and the existing detail
panel retains arguments, output and inspector selection. All process rows remain
visible while running. Standalone reasoning/tool components keep their disclosure
behavior for independent consumers.

The previous per-text-window aggregation and four-segment threshold are removed.
See the linked contract for terminal metadata, historical compatibility, failure
states and verification. Existing reasoning playback uses the renderer token queue;
raw provider reasoning and tool results remain unchanged.
