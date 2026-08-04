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
cumulative consolidation count changes from 84 → 68 while keeping existing
data models and operation behavior stable.

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

The schema stays flat and uses the existing operation parameter names. A flat
object schema is compatible with the provider schema subset already used by the
application. Each processor dispatches by `action`, validates its presence, and
returns `Missing required parameter: action` for omitted values. Unknown values
return a clear expected-action error. Processors validate each action's former
required fields before invoking the retained operation implementation.

The cutover publishes `todo`, `plan`, `schedule`, and `wiki` as canonical
public definitions, metadata entries, and main-process handlers. `plan` with
`action=create` retains the special plan review and its automatic-approval
policy. Wiki metadata resolves from `args.action` to preserve the established
read, write, delete, and search capability, risk, mutation, confirmation, and
subagent behavior.

Future consolidation phases use this shape when resource operations share a
bounded action set. Wiki establishes the action-level metadata pattern for
resource operations with distinct confirmation behavior.

## Consequences

- The TODO public schema count changes from four definitions to one.
- The Plan public schema count changes from seven definitions to one.
- The Schedule public schema count changes from four definitions to one.
- The Wiki phase changes the public embedded-tool total from 72 → 68. The
  cumulative consolidation count changes from 84 → 68.
- Existing operation processors remain the behavior authority behind the
  dispatcher.
- TODO, Plan, and Schedule retain resource-level metadata policies. Wiki
  resolves action-aware metadata: list/read are filesystem reads, write is a
  warning-level filesystem mutation, delete is a dangerous filesystem
  mutation, and search is a warning-level knowledgebase read.
- Runtime context continues to inject `chat_uuid` for the canonical Plan and
  Schedule handlers.

## Verification

The consolidation is accepted when focused tests verify the required `action`
schemas, missing and unknown action results, action-specific required-field
validation, routing, public definition visibility, metadata, handler
registration, action-specific Wiki confirmation behavior, renderer summaries,
and node TypeScript checks.
