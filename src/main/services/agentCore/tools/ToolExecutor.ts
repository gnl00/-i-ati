import { mcpRuntimeService } from '@main/services/mcpRuntime'
import { assessExecuteCommandReview } from '@main/tools/command/risk'
import { embeddedToolsRegistry } from '@tools/registry'
import type { AgentConfirmationSource, ResolvedAgentApprovalPolicy } from '@tools/approval'
import { v4 as uuidv4 } from 'uuid'
import type { ToolCallProps } from '../types'
import { AbortError, ToolExecutionError } from '@main/services/chatRun/errors'
import { normalizeToolArgs } from '@main/services/chatRun/utils'
import type {
  IToolExecutor,
  ToolExecutorConfig,
  ToolExecutionProgress,
  ToolExecutionResult
} from './types'

const DEFAULT_CONFIG = {
  maxConcurrency: 3
}

export class ToolExecutor implements IToolExecutor {
  private readonly config: {
    maxConcurrency: number
  }
  private readonly onProgress?: (progress: ToolExecutionProgress) => void
  private readonly signal?: AbortSignal
  private readonly chatUuid?: string
  private readonly submissionId?: string
  private readonly modelRef?: ModelRef
  private readonly allowedTools?: Set<string>
  private readonly approvalPolicy: ResolvedAgentApprovalPolicy
  private readonly confirmationSource?: AgentConfirmationSource
  private readonly requestConfirmation?: ToolExecutorConfig['requestConfirmation']

  constructor(config: ToolExecutorConfig = {}) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? DEFAULT_CONFIG.maxConcurrency
    }
    this.onProgress = config.onProgress
    this.signal = config.signal
    this.chatUuid = config.chatUuid
    this.submissionId = config.submissionId
    this.modelRef = config.modelRef
    this.allowedTools = config.allowedTools ? new Set(config.allowedTools) : undefined
    this.approvalPolicy = config.approvalPolicy ?? { mode: 'strict' }
    this.confirmationSource = config.confirmationSource
    this.requestConfirmation = config.requestConfirmation
  }

  async execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]> {
    if (calls.length === 0) {
      return []
    }

    if (this.signal?.aborted) {
      return calls.map(call => this.createAbortedResult(call))
    }

    const chunks = this.chunkArray(calls, this.config.maxConcurrency)
    const allResults: ToolExecutionResult[] = []

    for (const chunk of chunks) {
      if (this.signal?.aborted) {
        allResults.push(...chunk.map(call => this.createAbortedResult(call)))
        continue
      }

      const chunkResults = await Promise.allSettled(chunk.map(call => this.executeOne(call)))
      const results = chunkResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value
        }
        return this.createErrorResult(chunk[index], result.reason)
      })

      allResults.push(...results)
    }

    return allResults
  }

  private async executeOne(call: ToolCallProps): Promise<ToolExecutionResult> {
    const toolId = call.id || `call_${uuidv4()}`
    const toolName = call.function
    const toolIndex = call.index ?? 0
    const startTime = Date.now()

    const requiresPlanReview = toolName === 'plan_create'
      && Boolean(this.requestConfirmation)
      && !this.shouldAutoApprovePlanCreate()
    const requiresCommandReview = toolName === 'execute_command' && Boolean(this.requestConfirmation)

    if (!requiresPlanReview && !requiresCommandReview) {
      this.reportProgress({
        id: toolId,
        name: toolName,
        phase: 'started'
      })
    }

    try {
      if (this.signal?.aborted) {
        return this.createAbortedResult(call)
      }

      let runtimeArgs = this.normalizeArgs(call)
      if (requiresPlanReview && this.requestConfirmation) {
        const decision = await this.requestConfirmation({
          toolCallId: toolId,
          name: toolName,
          args: runtimeArgs,
          agent: this.confirmationSource
        })
        if (!decision.approved) {
          const result = this.createAbortedResultWithReason(call, decision.reason)
          this.reportProgress({
            id: toolId,
            name: toolName,
            phase: 'completed',
            result
          })
          return result
        }
        if (decision.args) {
          runtimeArgs = this.applyRuntimeContext(normalizeToolArgs(decision.args), toolName)
        }
      }

      if (requiresCommandReview && this.requestConfirmation) {
        const command = typeof runtimeArgs?.command === 'string' ? runtimeArgs.command : ''
        const executionReason = typeof runtimeArgs?.execution_reason === 'string' ? runtimeArgs.execution_reason : ''
        const possibleRisk = typeof runtimeArgs?.possible_risk === 'string' ? runtimeArgs.possible_risk : ''
        const riskScore = typeof runtimeArgs?.risk_score === 'number' ? runtimeArgs.risk_score : 0
        const risk = assessExecuteCommandReview({
          command,
          possible_risk: possibleRisk,
          risk_score: riskScore
        })
        if (risk.level === 'dangerous' || risk.level === 'warning') {
          const decision = await this.requestConfirmation({
            toolCallId: toolId,
            name: toolName,
            args: runtimeArgs,
            agent: this.confirmationSource,
            ui: {
              command,
              riskLevel: risk.level === 'warning' ? 'risky' : 'dangerous',
              reason: risk.reason,
              executionReason,
              possibleRisk: risk.possibleRisk,
              riskScore: risk.normalizedRiskScore
            }
          })
          if (!decision.approved) {
            const result = this.createAbortedResultWithReason(call, decision.reason)
            this.reportProgress({
              id: toolId,
              name: toolName,
              phase: 'completed',
              result
            })
            return result
          }
          runtimeArgs = {
            ...runtimeArgs,
            confirmed: true
          }
        } else {
          runtimeArgs = {
            ...runtimeArgs,
            confirmed: true
          }
        }
      }

      if (requiresPlanReview || requiresCommandReview) {
        this.reportProgress({
          id: toolId,
          name: toolName,
          phase: 'started'
        })
      }

      const content = await this.executeTool(call, runtimeArgs)

      const result: ToolExecutionResult = {
        id: toolId,
        index: toolIndex,
        name: toolName,
        content,
        cost: Date.now() - startTime,
        status: 'success'
      }

      this.reportProgress({
        id: toolId,
        name: toolName,
        phase: 'completed',
        result
      })

      return result
    } catch (error: any) {
      const result = this.createErrorResult(call, error, Date.now() - startTime)
      this.reportProgress({
        id: toolId,
        name: toolName,
        phase: 'failed',
        result
      })
      return result
    }
  }

  private async executeTool(call: ToolCallProps, runtimeArgs?: any): Promise<any> {
    const toolName = call.function

    if (this.allowedTools && !this.allowedTools.has(toolName)) {
      throw new Error(`Tool "${toolName}" is not allowed in this runtime`)
    }

    if (embeddedToolsRegistry.isRegistered(toolName)) {
      const safeArgs = runtimeArgs ?? this.normalizeArgs(call)
      const handler = embeddedToolsRegistry.getHandler(toolName)
      if (!handler) {
        throw new Error(`Tool "${toolName}" is not registered`)
      }
      return await handler(safeArgs)
    }

    const callId = call.id || `call_${uuidv4()}`
    const safeArgs = runtimeArgs ?? this.normalizeArgs(call)
    return await mcpRuntimeService.callTool(callId, toolName, safeArgs as { [x: string]: unknown })
  }

  private normalizeArgs(call: ToolCallProps): any {
    const args = typeof call.args === 'string'
      ? this.parseArgsString(call.args)
      : call.args
    const normalizedArgs = normalizeToolArgs(args)
    return this.applyRuntimeContext(normalizedArgs, call.function)
  }

  private parseArgsString(rawArgs: string): any {
    const trimmed = rawArgs.trim()
    if (!trimmed) {
      return {}
    }
    return JSON.parse(trimmed)
  }

  private applyRuntimeContext(args: any, toolName?: string): any {
    if (!args || typeof args !== 'object') {
      return args
    }

    if (this.chatUuid && (
      toolName?.startsWith('schedule_')
      || toolName?.startsWith('plan_')
      || toolName?.startsWith('activity_journal_')
      || toolName === 'execute_command'
    )) {
      const nextArgs = { ...args, chat_uuid: this.chatUuid }
      if (toolName?.startsWith('subagent_')) {
        return {
          ...nextArgs,
          ...(this.modelRef ? { model_ref: this.modelRef } : {}),
          ...(this.submissionId ? { parent_submission_id: this.submissionId } : {})
        }
      }
      return nextArgs
    }

    let nextArgs = args

    if (this.chatUuid && !args.chat_uuid) {
      nextArgs = { ...nextArgs, chat_uuid: this.chatUuid }
    }

    if (toolName?.startsWith('subagent_')) {
      if (this.modelRef && !nextArgs.model_ref) {
        nextArgs = { ...nextArgs, model_ref: this.modelRef }
      }
      if (this.submissionId && !nextArgs.parent_submission_id) {
        nextArgs = { ...nextArgs, parent_submission_id: this.submissionId }
      }
    }

    return nextArgs
  }

  private shouldAutoApprovePlanCreate(): boolean {
    return this.approvalPolicy.mode === 'relaxed'
  }

  private createErrorResult(
    call: ToolCallProps,
    error: any,
    cost: number = 0
  ): ToolExecutionResult {
    const toolId = call.id || `call_${uuidv4()}`
    const toolName = call.function
    const toolIndex = call.index ?? 0

    let status: ToolExecutionResult['status'] = 'error'
    let wrappedError: Error

    if (error instanceof AbortError || error.name === 'AbortError') {
      status = 'aborted'
      wrappedError = error
    } else if (error instanceof ToolExecutionError) {
      wrappedError = error
    } else {
      wrappedError = new ToolExecutionError(toolName, error)
    }

    return {
      id: toolId,
      index: toolIndex,
      name: toolName,
      content: null,
      cost,
      error: wrappedError,
      status
    }
  }

  private createAbortedResult(call: ToolCallProps): ToolExecutionResult {
    return this.createAbortedResultWithReason(call, 'Execution aborted')
  }

  private createAbortedResultWithReason(call: ToolCallProps, reason?: string): ToolExecutionResult {
    const toolId = call.id || `call_${uuidv4()}`
    const toolName = call.function
    const toolIndex = call.index ?? 0

    return {
      id: toolId,
      index: toolIndex,
      name: toolName,
      content: null,
      cost: 0,
      error: new AbortError(reason || 'Execution aborted'),
      status: 'aborted'
    }
  }

  private reportProgress(progress: ToolExecutionProgress): void {
    if (!this.onProgress) {
      return
    }
    try {
      this.onProgress(progress)
    } catch (error) {
      console.error('[ToolExecutor] Progress callback error:', error)
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
