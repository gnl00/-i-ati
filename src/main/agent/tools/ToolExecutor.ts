import { mcpRuntimeService } from '@main/services/mcpRuntime'
import { assessCommandFilesystemScope } from '@main/tools/command/filesystemScope'
import { assessExecuteCommandReview } from '@main/tools/command/risk'
import {
  embeddedToolsRegistry,
  type EmbeddedToolOutputChunk
} from '@tools/registry'
import { embeddedToolMetadata, type EmbeddedToolMetadata } from '@tools/metadata'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import {
  normalizePermissionApprovalMode,
  type AgentConfirmationSource,
  type ResolvedAgentApprovalPolicy
} from '@tools/approval'
import { v4 as uuidv4 } from 'uuid'
import type { ToolCallProps } from '@main/agent/contracts'
import { AbortError, ToolExecutionError } from '@main/agent/contracts'
import type {
  IToolExecutor,
  ToolExecutorConfig,
  ToolExecutionProgress,
  ToolExecutionResult
} from './types'

const DEFAULT_CONFIG = {
  maxConcurrency: 3
}
const TOOL_OUTPUT_BATCH_INTERVAL_MS = 100
const TOOL_OUTPUT_PENDING_STREAM_BYTES = 32 * 1024
const TOOL_OUTPUT_PENDING_MAX_BYTES = TOOL_OUTPUT_PENDING_STREAM_BYTES * 2

function trimUtf8TailToBytes(text: string, maxBytes: number): string {
  const value = Buffer.from(text, 'utf8')
  if (value.length <= maxBytes) {
    return text
  }

  let start = value.length - maxBytes
  while (start < value.length && (value[start] & 0b1100_0000) === 0b1000_0000) {
    start += 1
  }
  return value.subarray(start).toString('utf8')
}

export class ToolExecutor implements IToolExecutor {
  private readonly config: {
    maxConcurrency: number
  }
  private readonly onProgress?: (progress: ToolExecutionProgress) => void
  private readonly signal?: AbortSignal
  private readonly chatUuid?: string
  private readonly workspaceRoot?: string
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
    this.workspaceRoot = config.workspaceRoot
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
    let executionStartTime: number | undefined
    let metadataConfirmationApproved = false

    const requiresPlanReview = toolName === 'plan_create'
      && Boolean(this.requestConfirmation)
      && !this.shouldAutoApprovePlanCreate()
    const requiresCommandReview = toolName === 'execute_command' && Boolean(this.requestConfirmation)
    const metadataReview = this.resolveMetadataReview(toolName)
    const requiresMetadataReview = Boolean(this.requestConfirmation)
      && toolName !== 'plan_create'
      && toolName !== 'execute_command'
      && !requiresPlanReview
      && !requiresCommandReview
      && Boolean(metadataReview)
      && !this.shouldAutoApproveAppConfirmation()

    if (metadataReview && this.shouldAutoApproveAppConfirmation()) {
      metadataConfirmationApproved = true
    }

    if (!requiresPlanReview && !requiresCommandReview && !requiresMetadataReview) {
      executionStartTime = Date.now()
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
          runtimeArgs = this.applyRuntimeContext(decision.args, toolName)
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
        const filesystemScope = assessCommandFilesystemScope({
          command,
          filesystem_scope: runtimeArgs?.filesystem_scope,
          filesystem_scope_reason: runtimeArgs?.filesystem_scope_reason,
          cwd: runtimeArgs?.cwd,
          env: runtimeArgs?.env,
          workspaceRoot: this.workspaceRoot
        })
        if (this.shouldAutoApproveAppConfirmation()) {
          runtimeArgs = {
            ...runtimeArgs,
            confirmed: true
          }
        } else if (risk.level === 'dangerous' || risk.level === 'warning' || filesystemScope.requiresConfirmation) {
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
              possibleRisk: filesystemScope.requiresConfirmation
                ? [risk.possibleRisk, filesystemScope.reason].filter(Boolean).join(' ')
                : risk.possibleRisk,
              riskScore: risk.normalizedRiskScore,
              filesystemScope: filesystemScope.declaredScope,
              inferredFilesystemScope: filesystemScope.inferredScope,
              filesystemReason: filesystemScope.reason
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
            confirmed: false
          }
        }
      }

      if (requiresMetadataReview && this.requestConfirmation && metadataReview) {
        const decision = await this.requestConfirmation({
          toolCallId: toolId,
          name: toolName,
          args: runtimeArgs,
          agent: this.confirmationSource,
          ui: this.createMetadataReviewUi(toolName, metadataReview)
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
        metadataConfirmationApproved = true
        if (decision.args) {
          runtimeArgs = this.applyRuntimeContext(decision.args, toolName)
        }
      }

      if (requiresPlanReview || requiresCommandReview || requiresMetadataReview) {
        executionStartTime = Date.now()
        this.reportProgress({
          id: toolId,
          name: toolName,
          phase: 'started'
        })
      }

      executionStartTime ??= Date.now()
      const content = await this.executeTool(
        call,
        runtimeArgs,
        toolId,
        metadataConfirmationApproved
      )

      const result: ToolExecutionResult = {
        id: toolId,
        index: toolIndex,
        name: toolName,
        content,
        cost: Date.now() - executionStartTime,
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
      const result = this.createErrorResult(
        call,
        error,
        typeof executionStartTime === 'number' ? Date.now() - executionStartTime : 0
      )
      this.reportProgress({
        id: toolId,
        name: toolName,
        phase: 'failed',
        result
      })
      return result
    }
  }

  private async executeTool(
    call: ToolCallProps,
    runtimeArgs?: any,
    resolvedToolCallId?: string,
    metadataConfirmationApproved = false
  ): Promise<any> {
    const toolName = call.function
    const toolCallId = resolvedToolCallId ?? call.id ?? `call_${uuidv4()}`

    if (this.allowedTools && !this.allowedTools.has(toolName)) {
      throw new Error(`Tool "${toolName}" is not allowed in this runtime`)
    }

    if (embeddedToolsRegistry.isRegistered(toolName)) {
      const safeArgs = this.stripToolCallReason(runtimeArgs ?? this.normalizeArgs(call))
      const handler = embeddedToolsRegistry.getHandler(toolName)
      if (!handler) {
        throw new Error(`Tool "${toolName}" is not registered`)
      }
      let sequence = 0
      let stdoutBytes = 0
      let stderrBytes = 0
      let pendingBytes = 0
      let pendingChunks: EmbeddedToolOutputChunk[] = []
      let flushTimer: NodeJS.Timeout | undefined

      const compactPendingOutput = (): void => {
        const compacted = (['stdout', 'stderr'] as const)
          .map(stream => ({
            stream,
            text: trimUtf8TailToBytes(
              pendingChunks
                .filter(chunk => chunk.stream === stream)
                .map(chunk => chunk.text)
                .join(''),
              TOOL_OUTPUT_PENDING_STREAM_BYTES
            )
          }))
          .filter(chunk => chunk.text.length > 0)
        pendingChunks = compacted
        pendingBytes = compacted.reduce(
          (total, chunk) => total + Buffer.byteLength(chunk.text, 'utf8'),
          0
        )
      }

      const flushOutput = (): void => {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = undefined
        }
        if (pendingChunks.length === 0) {
          return
        }
        sequence += 1
        const chunks = pendingChunks
        pendingChunks = []
        pendingBytes = 0
        this.reportProgress({
          id: toolCallId,
          name: toolName,
          phase: 'output',
          output: {
            toolCallId,
            sequence,
            chunks,
            stdoutBytes,
            stderrBytes
          }
        })
      }

      try {
        return await handler(safeArgs, {
          signal: this.signal,
          metadataConfirmationApproved,
          onOutput: (chunk) => {
            const chunkBytes = Buffer.byteLength(chunk.text, 'utf8')
            if (chunk.stream === 'stdout') {
              stdoutBytes += chunkBytes
            } else {
              stderrBytes += chunkBytes
            }
            pendingChunks.push(chunk)
            pendingBytes += chunkBytes
            if (pendingBytes >= TOOL_OUTPUT_PENDING_MAX_BYTES) {
              compactPendingOutput()
            }
            if (!flushTimer) {
              flushTimer = setTimeout(flushOutput, TOOL_OUTPUT_BATCH_INTERVAL_MS)
            }
          }
        })
      } finally {
        flushOutput()
      }
    }

    const callId = call.id || `call_${uuidv4()}`
    const safeArgs = this.stripToolCallReason(runtimeArgs ?? this.normalizeArgs(call))
    return await mcpRuntimeService.callTool(callId, toolName, safeArgs as { [x: string]: unknown })
  }

  private normalizeArgs(call: ToolCallProps): any {
    const args = typeof call.args === 'string'
      ? this.parseArgsString(call.args)
      : call.args
    return this.applyRuntimeContext(args, call.function)
  }

  private stripToolCallReason(args: any): any {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return args
    }

    if (!(TOOL_CALL_REASON_PARAMETER_NAME in args)) {
      return args
    }

    const cleanArgs = { ...args }
    delete cleanArgs[TOOL_CALL_REASON_PARAMETER_NAME]
    return cleanArgs
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

    const toolSource = this.resolveToolSource(toolName)
    let nextArgs = args

    if (toolSource !== 'mcp') {
      nextArgs = { ...nextArgs }
      if (this.chatUuid) {
        nextArgs.chat_uuid = this.chatUuid
      } else {
        delete nextArgs.chat_uuid
      }
    }

    if (toolName?.startsWith('subagent_')) {
      if (this.modelRef && !nextArgs.model_ref) {
        nextArgs = { ...nextArgs, model_ref: this.modelRef }
      }
      if (this.submissionId && !nextArgs.parent_submission_id) {
        nextArgs = { ...nextArgs, parent_submission_id: this.submissionId }
      }
      nextArgs = {
        ...nextArgs,
        permission_approval_mode: normalizePermissionApprovalMode(this.approvalPolicy.permissionApprovalMode)
      }
    }

    return nextArgs
  }

  private resolveToolSource(toolName?: string): 'embedded' | 'mcp' | undefined {
    if (!toolName) {
      return undefined
    }
    if (embeddedToolsRegistry.isRegistered(toolName)) {
      return 'embedded'
    }
    return mcpRuntimeService.getToolSource(toolName)
  }

  private shouldAutoApprovePlanCreate(): boolean {
    return this.approvalPolicy.mode === 'relaxed' || this.shouldAutoApproveAppConfirmation()
  }

  private shouldAutoApproveAppConfirmation(): boolean {
    return normalizePermissionApprovalMode(this.approvalPolicy.permissionApprovalMode) === 'auto'
  }

  private resolveMetadataReview(toolName: string): EmbeddedToolMetadata | undefined {
    if (!embeddedToolsRegistry.isRegistered(toolName)) {
      return undefined
    }
    const metadata = embeddedToolMetadata[toolName]
    if (!metadata) {
      return undefined
    }
    if (metadata.riskLevel !== 'dangerous' && !metadata.mutatesWorkspace) {
      return undefined
    }
    return metadata
  }

  private createMetadataReviewUi(
    toolName: string,
    metadata: EmbeddedToolMetadata
  ): NonNullable<Parameters<NonNullable<ToolExecutorConfig['requestConfirmation']>>[0]['ui']> {
    const riskLevel = metadata.riskLevel === 'dangerous' ? 'dangerous' : 'risky'
    const reason = metadata.mutatesWorkspace
      ? `Tool "${toolName}" can mutate workspace state.`
      : `Tool "${toolName}" has ${metadata.riskLevel} risk.`
    const riskScore = metadata.riskLevel === 'dangerous'
      ? 8
      : metadata.mutatesWorkspace ? 5 : 4

    return {
      title: `Confirm ${toolName}`,
      riskLevel,
      reason,
      possibleRisk: reason,
      riskScore
    }
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
