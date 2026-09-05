# ADR-0022: Unified computer-use tool

- Status: Accepted
- Date: 2026-09-05

## Context

Fifteen public desktop tool definitions repeat session and screenshot fields. The
existing native backend already owns the operation implementations, and embedded
metadata already supports action-specific risk overrides.

## Decision

Expose one flat `computer_use` tool with a required `action`, preserving the fifteen
operation suffixes as action values. Remove the old public names and handlers.
Reuse existing backend methods and native JSON-RPC contracts.

The shared action field table drives enum generation, action field descriptions
and runtime required/allowed field validation. Keep backend argument types and add
a discriminated public argument union. Return the action with successful results
and structured validation/backend failures. Accept the executor-injected
`chat_uuid` field while forwarding only operation fields to the backend.

Use a dangerous base risk with explicit overrides for all actions, preserving
existing risk levels and the subagent denial. Keep the existing confirmation
policy and snapshot/screenshot requirements.

## Consequences and acceptance

New model calls use the unified name. Persisted historical tool records retain
their recorded names; manually configured old names must be changed to
`computer_use`. This change introduces no storage or native protocol migration.

Verify all fifteen dispatch paths, required/invalid/unexpected arguments, backend
failure propagation, canonical registration, metadata, and ToolExecutor context
and confirmation behavior. Existing native bridge tests cover the unchanged
transport. Desktop acceptance remains a manual state → interaction → finish run.

Rollback restores the previous public definitions and registrations together;
stored data and the native helper remain compatible.

See [the tool contract](../specs/tools/kwwk-computer-use-bridge.md).
