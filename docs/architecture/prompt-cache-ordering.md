# Prompt Cache Ordering

## Goal

Improve prefix-cache reuse while keeping conversation semantics clear:

- Stable system policy should stay at the request prefix.
- Conversation history and the current user request should remain adjacent in the final model request.
- Dynamic runtime context should apply to the current request without becoming persisted chat history.

## Current problem

The request pipeline has two layers:

1. `RequestMessageBuilder` builds canonical runtime seed messages.
2. `RequestMaterializer` turns runtime transcript records into provider protocol messages.

Ephemeral context such as `<system-environment>` and `<awake_state>` is useful for the current turn, but it changes often. When it is sent as standalone user messages between history and the current user message, it has two costs:

- It separates the current request from the prior conversation.
- It makes stable content after the first dynamic block miss prefix cache.

## Target provider request shape

The provider-facing request should be materialized as:

```text
systemPrompt:
  static identity / behavior / state policy / tools policy / output policy
  stable soul / skills / user_info / emotion policy

messages:
  userInstruction?                 // if present
  compressed summary and history
  current user message + request_context
```

`request_context` is appended only at materialization time:

```xml
<request_context>
  <loaded_skills_context>...</loaded_skills_context>
  <user_info_context>...</user_info_context>
  <knowledgebase_context>...</knowledgebase_context>
  <system-environment>...</system-environment>
  <awake_state>...</awake_state>
</request_context>
```

The transcript still keeps these context records as hidden runtime records so they remain auditable and can be hidden from UI/history persistence.

## Implementation order

1. Keep static system prompt content stable:
   - `emotion_system` contains policy only.
   - Current emotion state is carried by `awake_state.emotion`.
   - `SystemPromptComposer` orders stable blocks before runtime context.

2. Preserve context source metadata:
   - `ChatInitialTranscriptSeed` carries `source` for user seeds.
   - `AgentTranscriptUserRecord` carries `source`.
   - `InitialTranscriptSeedBuilder` and `ChatInitialTranscriptRecordFactory` copy the source through.

3. Merge request context at materialization:
   - `DefaultRequestMaterializer` consumes hidden request-context records.
   - It appends them as one `<request_context>` text part to the following user protocol message.
   - It does not mutate transcript records.

4. Keep request context sources explicit:
   - `system_environment_context`
   - `skills_context`
   - `user_info_context`
   - `knowledgebase_context`
   - `awake_context`

5. Keep runtime emotion in `awake_state`:
   - `emotion_system` remains a stable rule layer.
   - `awake_state.emotion` carries the current baseline, background, accumulated residue, recent history, and compact summary.
   - New requests should not generate a standalone `<emotion_context>` message.

## Non-goals

- Do not persist request context into chat history.
- Do not change context records to system role in this pass.
- Do not remove `awake_state`; it is the single runtime snapshot for chat state and emotion state.
