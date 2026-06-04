type CompressionPromptParams = {
  conversationText: string
  previousSummary?: string
}

const COMPACTION_TASK_INSTRUCTIONS = `Your task is to create a detailed, technically accurate summary for a continuing session.
This summary will be placed at the start of a future request, followed by newer messages that build on it.
Write the summary so an assistant reading only this summary plus the newer messages can fully understand what happened and continue the work.

Before writing the final summary, internally analyze the conversation chronologically:
- Identify each user request and intent.
- Identify assistant actions, tool calls, tool results, and state transitions.
- Identify technical decisions, file paths, function names, code sections, and command results.
- Identify errors, wrong assumptions, user corrections, fixes, and remaining risks.
- Identify security-relevant instructions or operational constraints and preserve them verbatim.
- Verify that tool facts and user corrections are represented accurately.`

const COMPACT_INSTRUCTIONS = `Compact Instructions:

Preservation priority:
1. Preserve architecture decisions, user constraints, security constraints, and requirement boundaries in full.
2. Preserve user corrections, wrong assumptions, root causes, and fixes in full.
3. Preserve modified files, key code sections, function signatures, data structures, schemas, and status fields.
4. Preserve verification state, including commands, pass/fail results, failure locations, and error excerpts.
5. Preserve unresolved TODOs, rollback notes, pending tasks, and next steps.
6. Tool outputs may be compressed for noise reduction, but preserve facts, paths, line numbers, ids, statuses, counts, and error excerpts needed for decisions.

Identifier preservation rules:
- Preserve UUIDs, hashes, IPs, ports, URLs, file names, PR numbers, and commit hashes exactly as written.
- Preserve code symbols, commands, paths, and environment variables exactly as written.

State fidelity rules:
- Stateful tools include plan_*, todo_*, schedule_*, work_context_*, task/workflow tools, approval tools, notification tools, and automation run tools.
- Stateful tool results are source-of-truth records. Preserve entity ids, status, step status, currentStepId, activeStepId, failureReason, error, timestamps, owner, assignee, dependencies, and schedule times verbatim.
- For plans and todos, preserve every visible step/item id, title, status, dependsOn, owner/assignee, currentStepId, and failureReason.
- pending, todo, doing, in_progress, pending_review, and blocked indicate open follow-up work. Record them as plan created, waiting to run, in progress, or blocked, and place them in Pending Tasks.
- done, completed, success, failed, and cancelled require an explicit source of truth: tool result, command output, test output, or explicit user confirmation.
- If assistant text conflicts with a stateful tool result, use the tool result as the state source in Tool Facts and Pending Tasks.
- Summarize assistant plans, proposed approaches, intended actions, and confirmation requests as intent or pending work.
- Pair tool calls with their tool results. success=true in a tool result only means that tool call succeeded.`

const SUMMARY_OUTPUT_FORMAT = `Output only the final summary. Use this exact structure:

<summary>
1. Primary Request and Intent:
   - Capture the user's explicit requests and intent in chronological order.

2. Key Technical Concepts:
   - List important concepts, architecture boundaries, tool contracts, data flow, and state semantics.

3. Files and Code Sections:
   - List files examined, created, or modified.
   - Include specific functions, constants, schemas, tests, and important snippets when they are needed to continue.

4. Tool Facts:
   - Preserve tool calls and tool results that are sources of truth.
   - For stateful tools, preserve tool name, source message id, toolCallId, ids, status, step/item status, currentStepId, activeStepId, failureReason, error, timestamps, owner/assignee, dependencies, and schedule times.
   - For plan/todo/schedule/workflow tools, preserve every visible plan/todo/schedule/workflow id and every visible step/item id, title, status, dependsOn, currentStepId, and failureReason.
   - When state is pending/todo/doing/in_progress/pending_review/blocked, record it as open work in Pending Tasks.
   - When state is done/completed/success/failed/cancelled, include the exact source that proves the state.
   - For command/test/build tools, preserve command, cwd, exit code, pass/fail, failed test names, and relevant stderr/stdout excerpts.

5. Errors and Fixes:
   - List mistakes, runtime errors, failed commands, wrong assumptions, user corrections, and the fix or current diagnosis.

6. All User Messages:
   - List all non-tool user messages from this compressed range.
   - Preserve security-relevant instructions, constraints, and user corrections verbatim.

7. Pending Tasks:
   - List open tasks, incomplete plan steps, risks, and follow-up decisions.

8. Work Completed:
   - Describe completed work and verification status.

9. Context for Continuing Work:
   - Provide the exact state needed by the next assistant turn.
</summary>`

export const buildCompressionPrompt = (params: CompressionPromptParams): string => {
  const { conversationText, previousSummary } = params

  if (previousSummary) {
    return `${COMPACTION_TASK_INSTRUCTIONS}

You need to merge the previous summary with the new conversation content into one updated continuing-session summary.

Previous summary:
${previousSummary}

New conversation content:
${conversationText}

${COMPACT_INSTRUCTIONS}

${SUMMARY_OUTPUT_FORMAT}`
  }

  return `${COMPACTION_TASK_INSTRUCTIONS}

Create a continuing-session summary for the following conversation content.

${conversationText}

${COMPACT_INSTRUCTIONS}

${SUMMARY_OUTPUT_FORMAT}`
}
