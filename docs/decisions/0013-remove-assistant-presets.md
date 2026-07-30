# Remove Assistant Presets

**Status:** Accepted<br>
**Date:** 2026-07-30<br>
**Related architecture:** [Renderer architecture](../architecture/renderer-architecture.md), [Main process architecture](../architecture/main-process-architecture.md)<br>
**Related history:** [Welcome Assistant Selector](../archive/2026/features/2026-07-30-welcome-assistant-selector.md)<br>
**Partially supersedes:** [ADR 0003: Provider database split](0003-provider-database-split.md)

## Context

The Assistant preset feature exposed named chat configurations through the
welcome surface and toolbar. Each preset stored a name, description, model
reference, and system prompt. Selection copied the system prompt into a
request-level `userInstruction`; the active chat model continued to come from
the chat store. This produced two model authorities and two instruction
lifecycles inside one chat submission.

The product already has focused contracts for the behaviors users continue to
need:

- the chat model selector owns the active model;
- chat-level User Instruction owns persisted per-chat guidance;
- the `assistant` message role owns model responses in transcript data;
- Scheduled runs carry their execution instructions through the host runtime;
- Subagents carry role prompts and task context through the Subagent runtime.

## Decision

Remove the complete Assistant preset capability in one coordinated change:

- remove production and legacy welcome selectors, toolbar presentation, create
  and edit drawers, Assistant cards, and renderer preset state;
- remove request queue and desktop chat submission fields that existed to carry
  the selected preset prompt;
- remove Assistant renderer repositories, IPC clients, shared IPC constants,
  and the preset entity type;
- remove main-process IPC handlers, bootstrap logic, database facade, service,
  repository, DAO, mapper, and runtime assembly;
- remove schema creation for `assistants`;
- run `DROP TABLE IF EXISTS assistants` during database initialization.

The table drop is an idempotent destructive migration. It permanently deletes
all saved Assistant presets. Rollback restores code behavior and starts with an
empty preset table when an older build recreates the schema.

The following contracts remain active:

- transcript messages with `role: 'assistant'` and their renderer components;
- persisted chat-level User Instruction and request materialization;
- host-level run instructions used by Scheduled runs and internal workflows;
- Subagent tools, runtime, roles, prompts, state, and events;
- chat model selection and per-chat model persistence.

## Consequences

- Chat model selection has one authority.
- Chat guidance has one user-visible, persisted session-level authority.
- Database initialization removes Assistant preset data and schema.
- Renderer and main-process startup shed the preset loading and bootstrap work.
- IPC and shared contracts lose the Assistant preset CRUD surface.
- Historical implementation details remain available in the documentation
  archive.

## Verification

The implementation is accepted when:

1. Repository searches find no Assistant preset UI, store, repository, service,
   IPC, schema creation, bootstrap, or preset-only request fields.
2. Database tests verify that initialization drops a legacy `assistants` table.
3. Chat tests verify model selection and chat-level User Instruction behavior.
4. Scheduled run and Subagent tests preserve their instruction contracts.
5. Renderer and main-process architecture, documentation path, type, and
   focused unit-test gates pass.
