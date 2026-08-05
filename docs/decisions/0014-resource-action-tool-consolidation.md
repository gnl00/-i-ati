# Resource-action tool consolidation

**Status:** Accepted<br>
**Date:** 2026-08-04<br>
**Related architecture:** [Main process architecture](../architecture/main-process-architecture.md)<br>
**Related guide:** [Tool definition workflow](../guides/development/tool-definition-workflow.md)

## Context

The public embedded-tool schema contained four separate operation-specific TODO
definitions. Each definition described one operation on the same durable TODO
resource. The broader tool consolidation direction applies the same
resource-action model to Plan, Schedule, Wiki, Memory, Activity, and Work
Context.

The initial TODO pilot reduced the public embedded-tool count from 84 to 81.
The Plan and Schedule phase reduced the public embedded-tool count from
81 → 72. The Wiki phase consolidates five Wiki operations into one `wiki`
resource tool, reducing the public embedded-tool count from 72 → 68. The
user_info phase consolidates the two user profile operations into one
`user_info` resource tool, reducing the public embedded-tool count from
68 → 67. The soul phase consolidates the three soul operations into one
`soul` resource tool, reducing the public embedded-tool count from
67 → 65. The subagent phase consolidates the two subagent operations into
one `subagent` resource tool, reducing the public embedded-tool count from
65 → 64. The session_context phase consolidates the two work context
operations into one `session_context` resource tool, reducing the public
embedded-tool count from 64 → 63. The cumulative consolidation count changes
from 84 → 63 while keeping existing data models and operation behavior stable.

## Decision

Expose one public `todo` function definition with a required `action` enum:
`add`, `list`, `update`, and `delete`.

Expose one public `plan` function definition with a required `action` enum:
`create`, `update`, `update_status`, `get_by_id`, `get_current_chat`,
`delete`, and `step_upsert`.

Expose one public `schedule` function definition with a required `action` enum:
`create`, `list`, `cancel`, and `update`.

Expose one public `wiki` function definition with a required `action` enum:
`list`, `read`, `write`, `delete`, and `search`. The schema remains flat and
retains the existing Wiki parameter names. Each action retains its established
metadata policy: list/read are non-mutating filesystem reads; write is a
warning-level filesystem mutation; delete is a dangerous filesystem mutation;
and search is a warning-level knowledgebase read. Wiki remains denied to
subagents. The executor resolves this metadata from `args.action`, so write
and delete continue to request confirmation while list, read, and search run
without one. Session auto approval continues to approve mutation confirmations.

Expose one public `user_info` function definition with a required `action`
enum: `get` and `set`. The schema remains flat and retains the existing user
profile parameter names (`name`, `preferredAddress`, `basicInfo`,
`preferences`), which are only meaningful for `action=set`. The action-aware
metadata preserves the established risk policy: get is a non-mutating read at
`none` risk, and set is a non-mutating profile write at `warning` risk. Both
actions remain denied to subagents. The executor resolves this metadata from
`args.action`, preserving the existing behavior where neither action requests
a workspace mutation confirmation.

Expose one public `soul` function definition with a required `action`
enum: `get`, `edit`, and `reset`. The schema remains flat and retains the
existing soul parameter names (`content`, `reason`, `confirm`), which are
only meaningful for their respective actions. The action-aware metadata
preserves the established risk policy: get is a non-mutating read at `none`
risk, and edit and reset are non-mutating profile writes at `warning` risk.
All actions remain denied to subagents. The executor resolves this metadata
from `args.action`, preserving the existing behavior where no soul action
requests a workspace mutation confirmation.

Expose one public `subagent` function definition with a required `action`
enum: `spawn` and `wait`. The schema remains flat and retains the existing
subagent parameter names (`task`, `role`, `context_mode`, `files`,
`background`, `subagent_id`, `timeout_seconds`), which are only meaningful
for their respective actions. The action-aware metadata preserves the
established risk policy: spawn is a warning-level background task launch,
and wait is a non-mutating status read at `none` risk. Both actions remain
denied to subagents. The executor resolves this metadata from `args.action`
and injects `model_ref`, `parent_submission_id`, and
`permission_approval_mode` into subagent calls from runtime context,
preserving the established behavior where no subagent action requests a
workspace mutation confirmation.

Expose one public `session_context` function definition with a required
`action` enum: `get` and `set`. The schema remains flat and retains the
existing work context parameter names (`content`), which is only meaningful
for `action=set`. The action-aware metadata preserves the established risk
policy: get is a non-mutating read at `none` risk, and set is a non-mutating
in-memory/database write at `none` risk. Both actions remain denied to
subagents. The executor resolves this metadata from `args.action`, preserving
the existing behavior where neither action requests a workspace mutation
confirmation.

The schema stays flat and uses the existing operation parameter names. A flat
object schema is compatible with the provider schema subset already used by the
application. Each processor dispatches by `action`, validates its presence, and
returns `Missing required parameter: action` for omitted values. Unknown values
return a clear expected-action error. Processors validate each action's former
required fields before invoking the retained operation implementation.

The cutover publishes `todo`, `plan`, `schedule`, `wiki`, `user_info`,
`soul`, `subagent`, and `session_context` as canonical public definitions,
metadata entries, and main-process handlers. `plan` with `action=create` retains the special plan review and its
automatic-approval policy. Wiki metadata resolves from `args.action` to
preserve the established read, write, delete, and search capability, risk,
mutation, confirmation, and subagent behavior. user_info metadata resolves
from `args.action` to preserve the established get and set risk policy. soul
metadata resolves from `args.action` to preserve the established get, edit,
and reset risk policy.

Future consolidation phases use this shape when resource operations share a
bounded action set. Wiki establishes the action-level metadata pattern for
resource operations with distinct confirmation behavior.

## Consequences

- The TODO public schema count changes from four definitions to one.
- The Plan public schema count changes from seven definitions to one.
- The Schedule public schema count changes from four definitions to one.
- The Wiki phase changes the public embedded-tool total from 72 → 68. The
  user_info phase changes the public embedded-tool total from 68 → 67. The
  soul phase changes the public embedded-tool total from 67 → 65. The
  subagent phase changes the public embedded-tool total from 65 → 64. The
  session_context phase changes the public embedded-tool total from 64 → 63.
  The cumulative consolidation count changes from 84 → 63.
- Existing operation processors remain the behavior authority behind the
  dispatcher.
- TODO, Plan, and Schedule retain resource-level metadata policies. Wiki
  resolves action-aware metadata: list/read are filesystem reads, write is a
  warning-level filesystem mutation, delete is a dangerous filesystem
  mutation, and search is a warning-level knowledgebase read. user_info
  resolves action-aware metadata: get is a `none`-risk read, and set is a
  `warning`-risk profile write; neither mutates the workspace. soul resolves
  action-aware metadata: get is a `none`-risk read, and edit and reset are
  `warning`-risk profile writes; no soul action mutates the workspace.
  subagent resolves action-aware metadata: spawn is a `warning`-risk
  background task launch, and wait is a `none`-risk status read; neither
  action mutates the workspace. session_context resolves action-aware
  metadata: get and set are both `none`-risk memory reads/writes; neither
  action mutates the workspace.
- Runtime context continues to inject `chat_uuid` for the canonical Plan and
  Schedule handlers and additionally injects `model_ref`,
  `parent_submission_id`, and `permission_approval_mode` for subagent calls.

## Verification

The consolidation is accepted when focused tests verify the required `action`
schemas, missing and unknown action results, action-specific required-field
validation, routing, public definition visibility, metadata, handler
registration, action-specific Wiki confirmation behavior, renderer summaries,
and node TypeScript checks.
