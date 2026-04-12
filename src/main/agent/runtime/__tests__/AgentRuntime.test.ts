import { describe, expect, it, vi } from 'vitest'
import { DefaultLoopInputBootstrapper } from '../host/bootstrap/LoopInputBootstrapper'
import { DefaultAgentLoop } from '../loop/AgentLoop'
import { DefaultAgentLoopDependenciesFactory } from '../AgentLoopDependenciesFactory'
import { DefaultAgentRuntime } from '../AgentRuntime'
import { createDefaultRuntimeInfrastructure } from '../RuntimeInfrastructure'
import { DefaultInitialTranscriptMaterializer } from '../transcript/InitialTranscriptMaterializer'
import { DefaultUserRecordMaterializer } from '../transcript/UserRecordMaterializer'
import type { AgentRequestSpecSource, LoopRunDescriptorSource } from '../AgentRuntimeContext'
import type { ModelResponseChunk } from '../model/ModelResponseChunk'
import type { ModelStreamExecutor } from '../model/ModelStreamExecutor'
import type { ToolExecutorDispatcher } from '../tools/ToolExecutorDispatcher'
import type { AgentEventEmitter } from '../events/AgentEventEmitter'

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

const createAsyncStream = async function *(
  chunks: ModelResponseChunk[]
): AsyncGenerator<ModelResponseChunk, void, unknown> {
  for (const chunk of chunks) {
    yield chunk
  }
}

const requestSpecSource: AgentRequestSpecSource = {
  resolve: async () => ({
    adapterPluginId: 'test-adapter',
    baseUrl: 'https://example.invalid',
    apiKey: 'test-key',
    model: 'test-model',
    stream: true
  })
}

const runDescriptorSource: LoopRunDescriptorSource = {
  create: async () => ({
    runId: 'run-1'
  })
}

describe('DefaultAgentRuntime', () => {
  it('completes a single-step text response', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async () => createAsyncStream([
        {
          kind: 'delta',
          responseId: 'resp-1',
          model: 'test-model',
          content: 'Hello from runtime',
          finishReason: 'stop',
          usage: {
            promptTokens: 1,
            completionTokens: 2,
            totalTokens: 3
          }
        },
        {
          kind: 'final',
          responseId: 'resp-1',
          model: 'test-model'
        }
      ]))
    }

    const runtime = new DefaultAgentRuntime({
      requestSpecSource,
      runDescriptorSource,
      loopInputBootstrapper: new DefaultLoopInputBootstrapper(),
      userRecordMaterializer: new DefaultUserRecordMaterializer(),
      initialTranscriptMaterializer: new DefaultInitialTranscriptMaterializer(),
      runtimeInfrastructure: createDefaultRuntimeInfrastructure(),
      agentLoop: new DefaultAgentLoop(),
      agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
        modelStreamExecutor
      })
    })

    const result = await runtime.run({
      hostRequest: {
        hostType: 'test',
        hostRequestId: 'req-1',
        submittedAt: Date.now(),
        userContent: [
          {
            type: 'input_text',
            text: 'hello'
          }
        ]
      }
    })

    expect(result.status).toBe('completed')
    if (result.status !== 'completed') {
      throw new Error('Expected completed result')
    }
    expect(result.finalStep.content).toBe('Hello from runtime')
    expect(result.transcript.records.map(record => record.kind)).toEqual([
      'user',
      'assistant_step'
    ])
    expect(modelStreamExecutor.execute).toHaveBeenCalledTimes(1)
  })

  it('continues after a tool round-trip and writes tool_result back to transcript', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        if (request.messages.some(message => message.role === 'tool')) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'test-model',
              content: 'Final answer after tool',
              finishReason: 'stop'
            },
            {
              kind: 'final',
              responseId: 'resp-2',
              model: 'test-model'
            }
          ])
        }

        return createAsyncStream([
          {
            kind: 'delta',
            responseId: 'resp-1',
            model: 'test-model',
            toolCalls: [
              {
                argumentsMode: 'snapshot',
                toolCall: {
                  id: 'tool-1',
                  index: 0,
                  type: 'function',
                  function: {
                    name: 'sum',
                    arguments: '{"a":1,"b":1}'
                  }
                }
              }
            ],
            finishReason: 'tool_calls'
          },
          {
            kind: 'final',
            responseId: 'resp-1',
            model: 'test-model'
          }
        ])
      })
    }

    const toolExecutorDispatcher: ToolExecutorDispatcher = {
      dispatch: vi.fn(async (batch) => ({
        status: 'completed' as const,
        batchId: batch.batchId,
        stepId: batch.stepId,
        results: [
          {
            stepId: batch.stepId,
            toolCallId: 'tool-1',
            toolCallIndex: 0,
            toolName: 'sum',
            status: 'success' as const,
            content: {
              result: 2
            }
          }
        ]
      }))
    }

    const runtime = new DefaultAgentRuntime({
      requestSpecSource,
      runDescriptorSource,
      loopInputBootstrapper: new DefaultLoopInputBootstrapper(),
      userRecordMaterializer: new DefaultUserRecordMaterializer(),
      initialTranscriptMaterializer: new DefaultInitialTranscriptMaterializer(),
      runtimeInfrastructure: createDefaultRuntimeInfrastructure(),
      agentLoop: new DefaultAgentLoop(),
      agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
        modelStreamExecutor,
        toolExecutorDispatcher
      })
    })

    const result = await runtime.run({
      hostRequest: {
        hostType: 'test',
        hostRequestId: 'req-2',
        submittedAt: Date.now(),
        userContent: [
          {
            type: 'input_text',
            text: 'use a tool'
          }
        ]
      }
    })

    expect(result.status).toBe('completed')
    if (result.status !== 'completed') {
      throw new Error('Expected completed result')
    }
    expect(result.finalStep.content).toBe('Final answer after tool')
    expect(result.transcript.records.map(record => record.kind)).toEqual([
      'user',
      'assistant_step',
      'tool_result',
      'assistant_step'
    ])
    expect(modelStreamExecutor.execute).toHaveBeenCalledTimes(2)
    expect(toolExecutorDispatcher.dispatch).toHaveBeenCalledTimes(1)
  })

  it('executes tool batch with the final step tool-call snapshot when a later snapshot corrects earlier ready args', async () => {
    const toolExecutorDispatcher: ToolExecutorDispatcher = {
      dispatch: vi.fn(async (batch) => {
        expect(batch.calls).toEqual([
          expect.objectContaining({
            toolCallId: 'tool-1',
            name: 'memory_retrieval',
            arguments: '{"query":"new"}'
          })
        ])

        return {
          status: 'completed' as const,
          batchId: batch.batchId,
          stepId: batch.stepId,
          results: [
            {
              stepId: batch.stepId,
              toolCallId: 'tool-1',
              toolCallIndex: 0,
              toolName: 'memory_retrieval',
              status: 'success' as const,
              content: {
                memories: []
              }
            }
          ]
        }
      })
    }

    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        if (request.messages.some(message => message.role === 'tool')) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'test-model',
              content: 'done',
              finishReason: 'stop'
            },
            {
              kind: 'final',
              responseId: 'resp-2',
              model: 'test-model'
            }
          ])
        }

        return createAsyncStream([
          {
            kind: 'delta',
            responseId: 'resp-1',
            model: 'test-model',
            toolCalls: [
              {
                argumentsMode: 'delta',
                toolCall: {
                  id: 'tool-1',
                  index: 0,
                  type: 'function',
                  function: {
                    name: 'memory_retrieval',
                    arguments: '{"query":"old"}'
                  }
                }
              }
            ]
          },
          {
            kind: 'delta',
            responseId: 'resp-1',
            model: 'test-model',
            toolCalls: [
              {
                argumentsMode: 'snapshot',
                toolCall: {
                  id: 'tool-1',
                  index: 0,
                  type: 'function',
                  function: {
                    name: 'memory_retrieval',
                    arguments: '{"query":"new"}'
                  }
                }
              }
            ],
            finishReason: 'tool_calls'
          },
          {
            kind: 'final',
            responseId: 'resp-1',
            model: 'test-model'
          }
        ])
      })
    }

    const runtime = new DefaultAgentRuntime({
      requestSpecSource,
      runDescriptorSource,
      loopInputBootstrapper: new DefaultLoopInputBootstrapper(),
      userRecordMaterializer: new DefaultUserRecordMaterializer(),
      initialTranscriptMaterializer: new DefaultInitialTranscriptMaterializer(),
      runtimeInfrastructure: createDefaultRuntimeInfrastructure(),
      agentLoop: new DefaultAgentLoop(),
      agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
        modelStreamExecutor,
        toolExecutorDispatcher
      })
    })

    const result = await runtime.run({
      hostRequest: {
        hostType: 'test',
        hostRequestId: 'req-2b',
        submittedAt: Date.now(),
        userContent: [
          {
            type: 'input_text',
            text: 'use corrected tool args'
          }
        ]
      }
    })

    expect(result.status).toBe('completed')
    expect(toolExecutorDispatcher.dispatch).toHaveBeenCalledTimes(1)
  })

  it('extends the soft step budget when tool/progress signals continue the loop', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        const toolMessageCount = request.messages.filter(message => message.role === 'tool').length

        if (toolMessageCount === 0) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-1',
              model: 'test-model',
              toolCalls: [
                {
                  argumentsMode: 'snapshot',
                  toolCall: {
                    id: 'tool-1',
                    index: 0,
                    type: 'function',
                    function: {
                      name: 'step_one',
                      arguments: '{"step":1}'
                    }
                  }
                }
              ],
              finishReason: 'tool_calls'
            },
            {
              kind: 'final',
              responseId: 'resp-1',
              model: 'test-model'
            }
          ])
        }

        if (toolMessageCount === 1) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'test-model',
              toolCalls: [
                {
                  argumentsMode: 'snapshot',
                  toolCall: {
                    id: 'tool-2',
                    index: 0,
                    type: 'function',
                    function: {
                      name: 'step_two',
                      arguments: '{"step":2}'
                    }
                  }
                }
              ],
              finishReason: 'tool_calls'
            },
            {
              kind: 'final',
              responseId: 'resp-2',
              model: 'test-model'
            }
          ])
        }

        return createAsyncStream([
          {
            kind: 'delta',
            responseId: 'resp-3',
            model: 'test-model',
            content: 'Completed after budget extension',
            finishReason: 'stop'
          },
          {
            kind: 'final',
            responseId: 'resp-3',
            model: 'test-model'
          }
        ])
      })
    }

    const toolExecutorDispatcher: ToolExecutorDispatcher = {
      dispatch: vi.fn(async (batch) => ({
        status: 'completed' as const,
        batchId: batch.batchId,
        stepId: batch.stepId,
        results: batch.calls.map(call => ({
          stepId: batch.stepId,
          toolCallId: call.toolCallId,
          toolCallIndex: call.index,
          toolName: call.name,
          status: 'success' as const,
          content: {
            ok: true
          }
        }))
      }))
    }

    const runtime = new DefaultAgentRuntime({
      requestSpecSource,
      runDescriptorSource,
      loopInputBootstrapper: new DefaultLoopInputBootstrapper(),
      userRecordMaterializer: new DefaultUserRecordMaterializer(),
      initialTranscriptMaterializer: new DefaultInitialTranscriptMaterializer(),
      runtimeInfrastructure: createDefaultRuntimeInfrastructure(),
      agentLoop: new DefaultAgentLoop(),
      agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
        modelStreamExecutor,
        toolExecutorDispatcher
      })
    })

    const result = await runtime.run({
      hostRequest: {
        hostType: 'test',
        hostRequestId: 'req-2b',
        submittedAt: Date.now(),
        userContent: [
          {
            type: 'input_text',
            text: 'extend budget through tool progress'
          }
        ]
      },
      execution: {
        softMaxSteps: 1,
        hardMaxSteps: 3,
        extensionStepSize: 1
      }
    })

    expect(result.status).toBe('completed')
    if (result.status !== 'completed') {
      throw new Error('Expected completed result')
    }
    expect(result.finalStep.content).toBe('Completed after budget extension')
    expect(modelStreamExecutor.execute).toHaveBeenCalledTimes(3)
    expect(toolExecutorDispatcher.dispatch).toHaveBeenCalledTimes(2)
  })

  it('emits step.failed even when the step fails before any delta is produced', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async () => {
        throw new Error('executor failed before stream')
      })
    }
    const agentEventEmitter: AgentEventEmitter = {
      emitStepStarted: vi.fn(async () => {}),
      emitStepDelta: vi.fn(async () => {}),
      emitStepCompleted: vi.fn(async () => {}),
      emitStepFailed: vi.fn(async () => {}),
      emitStepAborted: vi.fn(async () => {}),
      emitToolAwaitingConfirmation: vi.fn(async () => {}),
      emitToolConfirmationDenied: vi.fn(async () => {}),
      emitToolExecutionStarted: vi.fn(async () => {}),
      emitToolExecutionCompleted: vi.fn(async () => {}),
      emitToolExecutionFailed: vi.fn(async () => {}),
      emitToolExecutionAborted: vi.fn(async () => {}),
      emitLoopCompleted: vi.fn(async () => {}),
      emitLoopFailed: vi.fn(async () => {}),
      emitLoopAborted: vi.fn(async () => {})
    }

    const runtime = new DefaultAgentRuntime({
      requestSpecSource,
      runDescriptorSource,
      loopInputBootstrapper: new DefaultLoopInputBootstrapper(),
      userRecordMaterializer: new DefaultUserRecordMaterializer(),
      initialTranscriptMaterializer: new DefaultInitialTranscriptMaterializer(),
      runtimeInfrastructure: createDefaultRuntimeInfrastructure(),
      agentLoop: new DefaultAgentLoop(),
      agentLoopDependenciesFactory: new DefaultAgentLoopDependenciesFactory({
        modelStreamExecutor,
        agentEventEmitter
      })
    })

    const result = await runtime.run({
      hostRequest: {
        hostType: 'test',
        hostRequestId: 'req-3',
        submittedAt: Date.now(),
        userContent: [
          {
            type: 'input_text',
            text: 'fail immediately'
          }
        ]
      }
    })

    expect(result.status).toBe('failed')
    expect(agentEventEmitter.emitStepFailed).toHaveBeenCalledTimes(1)
    expect(agentEventEmitter.emitLoopFailed).toHaveBeenCalledTimes(1)
  })
})
