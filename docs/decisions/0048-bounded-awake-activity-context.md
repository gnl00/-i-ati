# ADR-0048: Bounded awake activity context

- Status: Accepted
- Date: 2026-10-18

## Context

A context-free greeting carried a 6,310-character awake snapshot. Five activity
cards occupied 2,922 characters, with 320-character summaries even when the
request had no topic. Activity selection preferred source and recency over
semantic relevance; the same chat metadata appeared twice.

## Decision

Keep awake as ephemeral request context in its existing materialization position.
Snapshot version 2 keeps one `chat_meta`, omits absent/empty `work_context`, and
uses compact JSON. Persistent memories, journal records, compression summaries,
emotion behavior, and existing retrieval tools retain their current ownership.

Expose at most three activity clues. Read the latest journal entries across
dates and bounded recent compression candidates. With no reliable topic, skip
activity semantic search and emit only source, id, title and local date. Generic
greetings/continuations and generated chat paths alone do not establish a topic;
real chat titles, work context and compression context still support short
continuations. This is a deterministic heuristic, with no classifier model call.

For task context, current-chat candidates take priority, followed by topic hits
and then recent fallback clues. Journal semantic hits require similarity >= 0.6;
retain similarity through deduplication and ranking. Existing recent candidates
may match topic identifiers lexically; Chinese prose uses adjacent bigram overlap.
Ties resolve by recency and stable id, without a blanket source preference.

Only relevant candidates may carry summaries. Keep complete sentences up to 120
characters; if the first sentence exceeds the budget, emit a title clue instead
of an incomplete assertion. Source records remain available through existing
activity/history tools. Each source fails independently to an empty candidate set.

## Consequences

- Routine bootstrap stays small while preserving cross-chat clues and active
  task continuity. Exact history may require an existing retrieval tool call.
- Candidate pools are bounded to three per source; relevance is heuristic and
  not a guarantee of exhaustive historical recall.
- The activity service/repository accepts listing without a date for internal
  recent lookup. The model-facing list tool still defaults to today.
- Version 2 is a fresh ephemeral projection, without a database migration or
  rewriting stored transcripts. Rolling back code restores the old projection.
- Long-term memory selection and the 8 KiB nonempty work-context budget are
  unchanged and can be assessed separately.

## References

- [Awake state design](../architecture/awake/awake-state-design.md)
- [System prompt runtime context](../architecture/system-prompt-runtime-context.md)
- [First-turn context optimization](../work/investigations/2026-10-18-first-turn-context-optimization.md)
