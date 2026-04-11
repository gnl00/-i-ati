import { describe, expect, it, vi } from 'vitest'
import type { CompletedAgentLoopResult } from '@main/services/next/loop/AgentLoopResult'
import type { CompletedAgentStep } from '@main/services/next/step/AgentStep'
import type { NextAgentRuntime } from '@main/services/next/runtime/NextAgentRuntime'
import { DefaultSubagentNextRuntimeRunner } from '../next/SubagentNextRuntimeRunner'

describe('DefaultSubagentNextRuntimeRunner execution config', () => {
  it('runs next runtime with default softMaxSteps=25 and hardMaxSteps=25', async () => {
    const finalStep: CompletedAgentStep = {
      stepId: 'step-1',
      stepIndex: 0,
      status: 'completed',
      startedAt: 1,
      completedAt: 2,
      content: 'done',
      toolCalls: []
    }

    const result: CompletedAgentLoopResult = {
      status: 'completed',
      startedAt: 1,
      completedAt: 2,
      transcript: {
        transcriptId: 'tx-1',
        createdAt: 1,
        updatedAt: 2,
        records: []
      },
      finalStep
    }

    const runtime: NextAgentRuntime = {
      run: vi.fn(async () => result)
    }

    const runner = new DefaultSubagentNextRuntimeRunner(undefined, {
      runtime
    } as any)

    await runner.run(
      {
        subagentId: 'sub-1',
        task: 'test execution config',
        role: 'general',
        contextMode: 'minimal',
        files: [],
        modelRef: {
          accountId: 'acc-1',
          modelId: 'model-1'
        }
      },
      {
        modelContext: {
          providerDefinition: {
            adapterPluginId: 'test-adapter',
            requestOverrides: {}
          },
          account: {
            id: 'acc-1',
            apiUrl: 'https://example.invalid',
            apiKey: 'test-key'
          },
          model: {
            id: 'test-model',
            type: 'chat',
            label: 'Test Model'
          }
        } as any,
        systemPrompt: 'system prompt',
        userMessage: 'hello',
        allowedTools: [],
        workspacePath: '/tmp'
      }
    )

    expect(runtime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        execution: {
          softMaxSteps: 25,
          hardMaxSteps: 25
        }
      })
    )
  })
})
