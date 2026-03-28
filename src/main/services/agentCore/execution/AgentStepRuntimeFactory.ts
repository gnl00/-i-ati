import type { AgentStepEventListener, ToolConfirmationRequester } from '../ports'
import type { IToolExecutor } from '../tools'
import { AgentStepLoop, type AgentStepMessageManager } from './AgentStepLoop'
import type { RunSpec } from '../types'
import type { ChunkParser } from './parser'

export type AgentStepRuntimeFactoryInput = {
  runSpec: RunSpec
  signal: AbortSignal
  parser: ChunkParser
  messageManager: AgentStepMessageManager
  eventListener: AgentStepEventListener
  toolExecutor: IToolExecutor
  toolConfirmationRequester: ToolConfirmationRequester
}

export class AgentStepRuntimeFactory {
  create(input: AgentStepRuntimeFactoryInput): AgentStepLoop {
    const {
      runSpec,
      signal,
      parser,
      messageManager,
      eventListener,
      toolExecutor,
      toolConfirmationRequester
    } = input

    return new AgentStepLoop(
      {
        request: runSpec.request,
        modelName: runSpec.modelContext.model.label,
        chatUuid: runSpec.runtimeContext.chatUuid,
        signal
      },
      {
        parser,
        messageManager,
        beforeFetch: () => {},
        afterFetch: () => {},
        toolConfirmationHandler: (requestConfirmation) =>
          toolConfirmationRequester.request(requestConfirmation),
        onPhaseChange: (phase) => {
          eventListener.handlePhaseChange(phase)
        },
        onToolCallsDetected: (toolCalls) => {
          eventListener.handleToolCallsDetected(toolCalls)
        },
        toolService: {
          execute: async (toolCalls) => {
            const calls = toolCalls.map(tool => ({
              id: tool.id,
              index: tool.index,
              function: tool.name,
              args: tool.args
            }))
            return toolExecutor.execute(calls)
          }
        }
      }
    )
  }
}
