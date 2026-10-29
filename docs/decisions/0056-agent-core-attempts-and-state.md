# ADR 0056: Agent core attempts and state

Status: Accepted

## Context

Empty-response recovery used a new step ID without closing the previous step,
accounting for its usage, or consuming the step limit. The draft retained all
stream deltas even though stable results only consumed its accumulated snapshot.

## Decision

A model response attempt consumes one maxSteps slot, including empty-response
recovery. Transport setup retries retain their separate bounded policy. Empty
responses emit a failed step with INCOMPLETE_MODEL_RESPONSE; hosts discard that
preview rather than commit an answer. Known usage from incomplete, failed and
cancelled streams contributes to the run total. Recovery is allowed once, only
when another step fits the budget.

The run-local draft folds incoming deltas into its snapshot. Only tool timing
indexes need to survive alongside it; raw delta history is delivered through
events rather than duplicated in the draft. Stable snapshots remain independent
of subsequent updates. No persisted format or provider protocol changes.

## Consequences

A small maxSteps can now stop an empty-response retry earlier. Completed attempts
retain their original transcript semantics. These bounds do not account for
provider usage that was never returned. Required event consumers remain ordered;
optional transport delivery policy is owned by the host output boundary.
