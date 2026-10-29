import { HIDDEN_MESSAGE_SOURCES, MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { createLogger } from '@main/logging/LogService'
import type { ContextRecord } from '../context/ContextRecord'
import type { ContextSnapshot } from '../context/ContextSnapshot'
import type { AgentRequestSpec } from '../request/AgentRequestSpec'
import { projectContextRequest, type MaterializedProtocolRequest } from '../context/ContextRequest'
import { DefaultExecutableRequestAdapter } from '../model/ExecutableRequestAdapter'
import { compactContext, type ContextCompressionInput } from './ContextCompactor'
import { measureRequestComposition } from './RequestCompositionMetrics'
import { RequestTokenizer, resolveContextBudget } from './RequestTokenizer'

const logger = createLogger('ContextManager')
const isVisibleUser = (record: ContextRecord): boolean =>
  record.kind === 'user' && (!record.source || !HIDDEN_MESSAGE_SOURCES.has(record.source))

export interface ContextManagerOptions {
  compress?: (input: ContextCompressionInput) => Promise<string>
  measureRequest?: (request: IUnifiedRequest) => Promise<Record<string, unknown>>
}

/** Sole owner of live model context. Raw facts remain complete; only the request view changes. */
export class ContextManager {
  private readonly records: ContextRecord[]
  private readonly tokenizer: RequestTokenizer
  private readonly adapter = new DefaultExecutableRequestAdapter()
  private readonly currentUser: number
  private pendingTools?: number
  private covered = 0
  private summary?: string
  private omitted = false
  private updatedAt: number

  constructor(
    initialRecords: readonly ContextRecord[],
    private readonly requestSpec: AgentRequestSpec,
    private readonly identity: { id: string; timestamp: number },
    private readonly options: ContextManagerOptions = {}
  ) {
    this.records = [...initialRecords]
    this.tokenizer = new RequestTokenizer(requestSpec.model)
    this.currentUser = this.records.findLastIndex(isVisibleUser)
    this.updatedAt = identity.timestamp
  }

  append(records: ContextRecord[], timestamp: number): void {
    for (const record of records) {
      if (record.kind === 'assistant_step') {
        // A completed model step consumes the prior tool batch; failures never append a step.
        this.pendingTools = record.step.toolCalls.length ? this.records.length : undefined
      }
      this.records.push(record)
    }
    this.updatedAt = timestamp
  }

  snapshot(): ContextSnapshot {
    return {
      transcriptId: this.identity.id,
      createdAt: this.records[0]?.timestamp ?? this.identity.timestamp,
      updatedAt: this.updatedAt,
      records: [...this.records]
    }
  }

  async prepare(signal?: AbortSignal): Promise<MaterializedProtocolRequest> {
    signal?.throwIfAborted()
    const required = new Set<number>()
    // All active-run user instructions remain pinned. Runtime context uses the latest value per source.
    const contexts = new Map<string, number>()
    this.records.forEach((record, index) => {
      if (record.kind !== 'user') return
      if (isVisibleUser(record) && index >= this.currentUser) required.add(index)
      if (record.source === MESSAGE_SOURCE.SYSTEM_PROMPT) required.add(index)
      if (
        record.source &&
        HIDDEN_MESSAGE_SOURCES.has(record.source) &&
        record.source !== MESSAGE_SOURCE.COMPRESSION_SUMMARY &&
        record.source !== MESSAGE_SOURCE.RUN_STOPPED
      ) {
        contexts.set(record.source, index)
      }
    })
    contexts.forEach((index) => required.add(index))
    if (this.pendingTools !== undefined) {
      for (let i = this.pendingTools; i < this.records.length; i++) required.add(i)
      this.validateToolBatch(this.records.slice(this.pendingTools))
    }

    const makeRequest = (
      records: ContextRecord[],
      summary?: string,
      omitted = false
    ): MaterializedProtocolRequest => {
      const prefix: ContextRecord[] = []
      if (omitted)
        prefix.push(
          this.contextNote(
            '[Earlier context was omitted to fit the model window. Do not assume missing facts. Consult recovery tools available in this request or saved tool output paths when available.]'
          )
        )
      if (summary) prefix.push(this.contextNote(`[Previous conversation summary]\n${summary}`))
      return projectContextRequest({
        records: [...prefix, ...records],
        requestSpec: this.requestSpec
      })
    }
    const measure = async (
      request: MaterializedProtocolRequest
    ): Promise<{ bodyBytes: number; tokens: number; budget: ReturnType<typeof resolveContextBudget> }> => {
      const unified = this.adapter.adapt(request)
      const body = this.options.measureRequest
        ? await this.options.measureRequest(unified)
        : {
            system: unified.systemPrompt,
            messages: unified.messages,
            tools: unified.tools,
            options: unified.options,
            ...unified.requestOverrides
          }
      signal?.throwIfAborted()
      const serialized = JSON.stringify(body)
      return {
        bodyBytes: Buffer.byteLength(serialized),
        tokens: this.tokenizer.count(serialized),
        budget: resolveContextBudget(
          this.requestSpec.contextWindowTokens,
          body,
          this.tokenizer.estimated
        )
      }
    }
    let retained = this.records.filter((_record, i) => i >= this.covered || required.has(i))
    let request = makeRequest(retained, this.summary, this.omitted || (this.covered > 0 && !this.summary))
    let measured = await measure(request)
    if (measured.tokens <= measured.budget.input) {
      logger.info('context.prepared', {
        runId: this.identity.id, inputTokens: measured.tokens, inputBudget: measured.budget.input,
        outputReserve: measured.budget.output, windowUnknown: measured.budget.windowUnknown,
        encoding: this.tokenizer.encoding, estimated: this.tokenizer.estimated,
        bodyBytes: measured.bodyBytes, parts: measureRequestComposition(request), systemPromptParts: this.requestSpec.systemPromptParts,
        omittedRecords: this.records.length - retained.length, summarized: Boolean(this.summary)
      })
      return request
    }

    const mandatory = this.records.filter((_record, i) => required.has(i))
    const minimalRequest = makeRequest(mandatory)
    const minimal = await measure(minimalRequest)
    if (minimal.tokens > minimal.budget.input) {
      throw new Error(
        `Required context exceeds the model token budget: input=${minimal.tokens}, budget=${minimal.budget.input}, outputReserve=${minimal.budget.output}, window=${minimal.budget.window}, encoding=${this.tokenizer.encoding}, estimated=${this.tokenizer.estimated}, windowUnknown=${minimal.budget.windowUnknown}`
      )
    }

    // Old user turns and complete assistant/result batches are the only removable units.
    const groups: number[][] = []
    let group: number[] = []
    this.records.forEach((record, index) => {
      if (index < this.covered || required.has(index)) return
      if ((record.kind === 'assistant_step' || isVisibleUser(record)) && group.length) {
        groups.push(group)
        group = []
      }
      group.push(index)
    })
    if (group.length) groups.push(group)
    const removed = new Set<number>()
    // Leave space for a bounded summary and omission notice; all required facts survive unchanged.
    const target = Math.max(minimal.tokens, Math.floor(measured.budget.input * 0.85))
    // Search complete historical prefixes instead of measuring after every single group.
    // BPE boundary effects can change exact counts; every selected request is still measured.
    const selectPrefix = (count: number): void => {
      removed.clear()
      for (let i = 0; i < count; i++) {
        groups[i].forEach((index) => removed.add(index))
      }
      retained = this.records.filter(
        (_record, i) => required.has(i) || (i >= this.covered && !removed.has(i))
      )
      request = makeRequest(retained, undefined, true)
    }
    let low = 1
    let high = groups.length
    let selected = groups.length
    let lastProbe = 0
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      selectPrefix(middle)
      lastProbe = middle
      measured = await measure(request)
      if (measured.tokens <= target) {
        selected = middle
        high = middle - 1
      } else {
        low = middle + 1
      }
    }
    if (lastProbe !== selected) selectPrefix(selected)
    const removedRecords = this.records.filter((_record, index) => removed.has(index))
    let summary: string | undefined
    let compressionFailed = false
    if (this.requestSpec.contextCompression !== false && removedRecords.length) {
      try {
        const text = JSON.stringify(
          projectContextRequest({
            records: removedRecords,
            requestSpec: this.requestSpec
          }).messages
        )
        const compressor = this.options.compress ?? compactContext
        summary = (
          await compressor({
            text,
            previousSummary: this.summary,
            requestSpec: this.requestSpec,
            signal
          })
        ).trim()
        signal?.throwIfAborted()
        if (!summary || this.tokenizer.count(summary) >=
          this.tokenizer.count(text) + this.tokenizer.count(this.summary ?? ''))
          summary = undefined
      } catch (error) {
        signal?.throwIfAborted()
        compressionFailed = true
        logger.warn('context.compression_failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError'
        })
      }
    }
    let omitted = this.omitted || !summary
    // A failed merge need not erase an earlier useful summary. The notice records the gap.
    summary ??= this.summary
    request = makeRequest(retained, summary, omitted)
    measured = await measure(request)
    if (measured.tokens > measured.budget.input && summary !== this.summary && this.summary) {
      summary = this.summary
      omitted = true
      request = makeRequest(retained, summary, true)
      measured = await measure(request)
    }
    if (measured.tokens > measured.budget.input) {
      summary = undefined
      request = makeRequest(retained, undefined, true)
      measured = await measure(request)
    }
    // The notice is optional too; it must never block an otherwise valid current request.
    if (measured.tokens > measured.budget.input) {
      request = minimalRequest
      measured = minimal
    }
    this.covered = removed.size ? Math.max(this.covered, ...removed) + 1 : this.covered
    this.omitted = omitted || !summary
    this.summary = summary
    const finalMeasurement = measured
    logger.info('context.prepared', {
      runId: this.identity.id,
      bodyBytes: finalMeasurement.bodyBytes,
      parts: measureRequestComposition(request),
      systemPromptParts: this.requestSpec.systemPromptParts,
      inputTokens: finalMeasurement.tokens,
      inputBudget: finalMeasurement.budget.input,
      outputReserve: minimal.budget.output,
      encoding: this.tokenizer.encoding,
      estimated: this.tokenizer.estimated,
      windowUnknown: minimal.budget.windowUnknown,
      omittedRecords: removed.size,
      summarized: Boolean(summary),
      compressionFailed
    })
    return request
  }

  private contextNote(text: string): ContextRecord {
    return {
      kind: 'user',
      recordId: 'request-context-view',
      timestamp: this.updatedAt,
      source: MESSAGE_SOURCE.COMPRESSION_SUMMARY,
      content: [{ type: 'input_text', text }]
    }
  }

  private validateToolBatch(records: ContextRecord[]): void {
    const assistant = records[0]
    if (assistant?.kind !== 'assistant_step')
      throw new Error('Missing assistant for pending tool batch')
    const ids = assistant.step.toolCalls.map((call) => call.id)
    const results = records.filter((record) => record.kind === 'tool_result')
    if (
      new Set(ids).size !== ids.length ||
      results.length !== ids.length ||
      ids.some(
        (id) =>
          results.filter(
            (result) => result.toolCallId === id && result.stepId === assistant.step.stepId
          ).length !== 1
      )
    ) {
      throw new Error('Pending tool batch does not contain exactly one result for every call')
    }
  }
}
