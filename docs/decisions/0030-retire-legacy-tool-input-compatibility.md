# ADR-0030: Retire legacy tool input compatibility

**Status:** Accepted<br>
**Date:** 2026-09-30<br>
**Related architecture:** [Sandbox system design](../architecture/sandbox-design.md#workspace-file-operation-confinement)<br>
**Supersedes in part:** [ADR-0008](0008-workspace-path-confinement.md) historical IPC input alias

## Context

Renderer file operations currently use workspace-relative and native
workspace-contained absolute paths. The old IPC resolver also interpreted
`workspaces/<chatUuid>/...` relative to Electron user data, creating a second
meaning for the same relative input. No current Renderer producer emits that
form. The file boundary already has a `workspace-contained` mode with lexical
and canonical containment checks.

The `ask_user_question` tool definition declares a 60–300 second timeout.
Its runtime also accepted 5–59 and silently raised those values to 60, so
the declared and actual input contracts differed.

## Decision

Use the workspace-contained resolver for both embedded file operations and
Renderer IPC. Keep native absolute paths inside the active workspace; treat
all relative paths as relative to that workspace. A literal
`workspaces/<chatUuid>/...` is no longer redirected to Electron user data.
Remove the old resolver mode and `legacyInput` representation. Keep the
separate normalization of **stored workspace root paths** because that is
durable chat configuration, not a tool input alias.

Validate question timeouts against the declared 60–300 second range. Inputs
below 60 seconds now receive the normal model-visible validation error.
Omitted timeouts still default to 60 seconds.

## Consequences and verification

The Renderer continues to read and write through workspace-contained absolute
paths. External paths, parent segments, non-native absolute forms and symlink
escapes remain rejected. Callers sending the retired user-data-relative file
form must pass a workspace-relative or contained absolute path. Callers sending
short question timeouts must use at least 60 seconds.

Focused resolver, file processor, question and tool-definition tests cover
the input boundary. Full Node/Web typechecks, architecture checks and the
repository coverage suite gate delivery. Existing stored workspace paths
remain readable.
