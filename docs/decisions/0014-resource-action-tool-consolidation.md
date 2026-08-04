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

This pilot reduces the public embedded-tool count from 84 to 81 while keeping
the existing TODO data model and operation behavior stable.

## Decision

Expose one public `todo` function definition with a required `action` enum:
`add`, `list`, `update`, and `delete`.

The schema stays flat and uses the existing operation parameter names. A flat
object schema is compatible with the provider schema subset already used by the
application. The processor dispatches by `action`, validates its presence, and
returns `Missing required parameter: action` for omitted values. Unknown values
return a clear expected-action error.

Future consolidation phases use this shape when resource operations share a
bounded action set. Action-level policy metadata can extend the base metadata
model when a future resource needs distinct confirmation or subagent rules.

## Consequences

- The TODO public schema count changes from four definitions to one.
- The public embedded-tool total changes from 84 to 81 for this pilot.
- Existing operation processors remain the behavior authority behind the
  dispatcher.
- The unified metadata uses the existing warning-level TODO policy for all
  canonical actions.

## Verification

The pilot is accepted when focused tests verify the required `action` schema,
missing and unknown action results, routing for all four actions, public
definition visibility, handler registration, and the node TypeScript check.
