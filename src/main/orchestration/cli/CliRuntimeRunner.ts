import { RunService, type RunOutcome } from '@main/orchestration/chat/run'
import type { RunPreparationResult } from '@main/hosts/chat/preparation/types'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import type { CliChatProfile } from './CliChatProfile'
import type { CliApprovalMode } from '@main/hosts/cli/CliInputAdapter'
import { SUBAGENT_EVENTS } from '@shared/subagent/events'

export interface CliRuntimeRunInput {
  runId: string
  instruction: string
  workspace: string
  chatUuid: string
  approval: CliApprovalMode
  maxSteps: number
  profile: CliChatProfile
  onPrepared: (prepared: RunPreparationResult) => Promise<void>
  eventSink: AgentEventSink & {
    emit(type: string, payload: Record<string, unknown>): Promise<void>
  }
  signal: AbortSignal
}

/** CLI adapts input/output policy; RunService owns the entire run lifecycle. */
export const runCliRuntime = async (input: CliRuntimeRunInput): Promise<RunOutcome> => {
  const service = new RunService()
  // Run envelopes are fire-and-forget transports. Keep child status writes ordered
  // and surface their failures before publishing the CLI terminal artifact.
  let pendingStatus = Promise.resolve()
  let outputError: unknown
  const handle = service.submit(
    {
      submissionId: input.runId,
      chatUuid: input.chatUuid,
      modelRef: input.profile.modelRef,
      input: {
        source: 'cli',
        textCtx: input.instruction,
        mediaCtx: [],
        tools: input.profile.tools,
        options: input.profile.options,
        stream: true,
        permissionApprovalMode: input.approval === 'auto' ? 'auto' : 'manual'
      }
    },
    {
      preparation: {
        modelContext: input.profile.modelContext,
        systemPrompt: input.profile.systemPrompt,
        options: input.profile.options
      },
      execution: { maxSteps: input.maxSteps },
      signal: input.signal,
      agentEventSinks: [
        {
          handle: async (event): Promise<void> => {
            if (outputError) return
            try {
              await input.eventSink.handle(event)
            } catch (error) {
              outputError = error
              service.cancel(input.runId)
            }
          }
        }
      ],
      onPrepared: input.onPrepared,
      postRunJobs: false,
      toolConfirmationRequester: {
        request: async () =>
          input.approval === 'auto'
            ? { approved: true }
            : {
                approved: false,
                reason: 'CLI approval mode deny rejected this operation'
              }
      },
      eventSinks: [
        {
          handleEvent: (event): Promise<void> | undefined => {
            if (event.type !== SUBAGENT_EVENTS.SUBAGENT_UPDATED) return
            pendingStatus = pendingStatus
              .then(() => input.eventSink.emit(event.type, { ...event.payload }))
              .catch(error => {
                outputError ??= error
                service.cancel(input.runId)
              })
            return pendingStatus
          }
        }
      ]
    }
  )
  const outcome = await handle.outcome
  await pendingStatus
  await service.waitForPostRunJobs()
  if (outputError) {
    return {
      ...outcome,
      result: {
        state: 'failed',
        error: {
          name: 'CliOutputError',
          message: outputError instanceof Error ? outputError.message : String(outputError)
        }
      }
    }
  }
  return outcome
}
