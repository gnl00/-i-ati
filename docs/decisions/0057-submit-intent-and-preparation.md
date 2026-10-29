# ADR 0057: Submit intent and preparation ownership

Status: Accepted

## Context

Desktop supplied full tool schemas while Main independently added default tools.
The web-search toggle and Chat instruction could be lost during preparation, and
execution was not constrained to the names advertised in the prepared request.

## Decision

Main owns tool schemas, capability filtering and the per-run executable set.
Desktop sends names plus an explicit web-search toggle. Explicit desktop names
must resolve in current Main registries; stale connections fail preparation rather
than silently promising an unavailable capability. Other hosts retain existing
defaults when selection is absent. Approval is a separate, mutable runtime policy.

Chat-level instruction has explicit override/empty semantics and persisted fallback;
per-run instruction is additive. This preserves host-specific additions such as
schedule execution policy without discarding the saved instruction.

## Consequences

The internal desktop IPC schema changes with the application build. Renderer-supplied
tool schema overrides are rejected. Model calls outside the resolved set produce a
failure before approval or side effects. No database migration is required.
