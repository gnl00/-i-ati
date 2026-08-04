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
The Plan and Schedule phase reduces the public embedded-tool count from
81 → 72. The cumulative consolidation count changes from 84 → 72 while
keeping the existing data models and operation behavior stable.

## Decision

Expose one public `todo` function definition with a required `action` enum:
`add`, `list`, `update`, and `delete`.

Expose one public `plan` function definition with a required `action` enum:
`create`, `update`, `update_status`, `get_by_id`, `get_current_chat`,
`delete`, and `step_upsert`.

Expose one public `schedule` function definition with a required `action` enum:
`create`, `list`, `cancel`, and `update`.

The schema stays flat and uses the existing operation parameter names. A flat
object schema is compatible with the provider schema subset already used by the
application. Each processor dispatches by `action`, validates its presence, and
returns `Missing required parameter: action` for omitted values. Unknown values
return a clear expected-action error. Processors validate each action's former
required fields before invoking the retained operation implementation.

The cutover exposes only `plan` and `schedule` in public definitions, metadata,
and main-process handler registration. `plan` with `action=create` retains the
special plan review and its automatic-approval policy. The remaining plan
actions use the ordinary execution path.

Future consolidation phases use this shape when resource operations share a
bounded action set. Action-level policy metadata can extend the base metadata
model when a future resource needs distinct confirmation or subagent rules.

## Consequences

- The TODO public schema count changes from four definitions to one.
- The Plan public schema count changes from seven definitions to one.
- The Schedule public schema count changes from four definitions to one.
- The Plan and Schedule phase changes the public embedded-tool total from
  81 → 72. The cumulative consolidation count changes from 84 → 72.
- Existing operation processors remain the behavior authority behind the
  dispatcher.
- The unified metadata uses the existing warning-level resource policy for all
  canonical actions.
- Runtime context continues to inject `chat_uuid` for the canonical Plan and
  Schedule handlers.

## Verification

The consolidation is accepted when focused tests verify the required `action`
schemas, missing and unknown action results, action-specific required-field
validation, routing, public definition visibility, metadata, handler
registration, Plan confirmation behavior, and the node TypeScript check.
