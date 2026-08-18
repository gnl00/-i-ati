# Paused user-question tool protocol

**Status:** Accepted<br>
**Date:** 2026-08-09<br>
**Related architecture:** [Chat runtime architecture](../architecture/chat-runtime-architecture-current.md), [Renderer architecture](../architecture/renderer-architecture.md)<br>
**Related guide:** [Tool definition workflow](../guides/development/tool-definition-workflow.md)

## Context

The model needs a structured way to pause an active desktop chat run, ask one
to three questions, receive selections or text, and continue from a paired tool
result. The interaction also needs a bounded wait so an unattended run can use
model-provided recommendations and continue automatically.

Permission confirmation already provides a useful Promise and run-event
transport shape. User answers have distinct identity, validation, timeout, and
transcript semantics, so they require a dedicated protocol.

## Decision

Expose `ask_user_question` as a desktop main-chat embedded tool. Each question
has a stable ID and supports `single_select`, `multi_select`, or `text` input.
Selection options can be marked as recommended, and text questions can provide
`recommended_text`. Required questions must carry enough recommended data to
satisfy their cardinality and content constraints.

`ToolQuestionManager` owns pending interactions using `submissionId`,
`chatUuid`, `toolCallId`, and `interactionId`. It emits
`tool.user_question.required`, resolves submissions received through
`run:tool-user-question:submit`, and emits `tool.user_question.resolved` when
the interaction settles. Main validates submissions against the saved original
question set, including question IDs, option IDs, required answers,
cardinality, duplicates, and text length.

The default wait is 60 seconds and the supported range is 60 to 300 seconds.
Legacy calls requesting a shorter wait are normalized to 60 seconds.
At expiry, Main resolves the tool with `auto_submitted` and the validated
recommended answers. Manual answers resolve with `submitted`; user and run
cancellation resolve with `cancelled`; missing interactive runtime support
resolves with `unavailable`. Every status remains visible to the model as the
paired tool result.

`ask_user_question` is an interaction barrier inside a tool batch. Calls after
it receive `deferred_due_to_user_question`, allowing the next model step to
incorporate the answer before issuing follow-up tools.

Renderer state hydrates pending interactions through
`run:tool-user-question:list-pending`, subscribes to required and resolved run
events, and mounts `UserQuestionCard` above the chat input. The ordinary draft
remains editable while send and queue insertion are held until the question
settles.

The tool is denied to subagents and excluded from runs with an external source,
including Telegram and schedules. An unavailable result covers exceptional
execution contexts without an interactive requester.

## Consequences

- User feedback enters the transcript as a paired tool result with stable
  interaction identity.
- Unattended runs can continue deterministically from model-provided
  recommendations after a bounded delay.
- Chat switching can reconstruct the pending form while the Main process and
  active run remain alive.
- Process restart recovery remains outside this decision and requires durable
  interaction and assistant-checkpoint persistence.
- Permission auto approval and user-question auto submission retain independent
  managers and policies.

## Verification

Acceptance requires tool schema and metadata tests, processor validation,
manager timeout and identity tests, batch barrier coverage, IPC registration,
renderer form and store tests, Node and Web type checks, and Main/Renderer
architecture boundary checks.
