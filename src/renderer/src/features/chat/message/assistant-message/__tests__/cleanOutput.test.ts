import { describe, expect, it } from 'vitest'
import { mapAssistantMessage } from '../model/assistantMessageMapper'
import { projectCleanOutputContent, projectCleanOutputStatus as projectProgress } from '../model/cleanOutput'
import type { AssistantMessageTranscriptProjection } from '../model/assistantMessageMapper'

const projectCleanOutputStatus = (...args: Parameters<typeof projectProgress>): string => projectProgress(...args).label

const project = (segments: MessageSegment[]): AssistantMessageTranscriptProjection => mapAssistantMessage({
  committedMessage: { role: 'assistant', content: '', segments }
}, { isLatest: true, isStreaming: true, accounts: [], providerDefinitions: [] }).transcript
const text = (content = 'Answer'): TextSegment => ({ type: 'text', segmentId: 'text', content, timestamp: 1 })
const tool = (id: string, status = 'running'): ToolCallSegment => ({
  type: 'toolCall', segmentId: id, toolCallId: id, name: 'read_file', content: { status }, timestamp: 2
})

describe('clean output projections', () => {
  it('keeps semantic phases independent of reason text', () => {
    const active = tool('a')
    active.content.args = { tool_call_reason: 'Waiting for approval wording in a document' }
    expect(projectProgress(project([active])).phase).toBe('tool')
    expect(projectProgress(project([active]), 'approval').phase).toBe('approval')
    expect(projectProgress(project([text()])).phase).toBe('writing')
    expect(projectProgress(project([{ type: 'reasoning', segmentId: 'r', content: 'Check. Inspect source.', timestamp: 1 }])).phase).toBe('thinking')
    expect(projectProgress(project([])).phase).toBe('working')
  })

  it('preserves ordered visible text without guessing answer intent', () => {
    const first = text('Let me check.')
    const last = { ...text('Result'), segmentId: 'result' }
    const hidden = { ...text('Hidden'), segmentId: 'hidden', presentation: { transcriptVisible: false } }
    const content = projectCleanOutputContent(project([first, tool('read'), text('   '), hidden, last]))
    expect(content.textItems.map(item => item.segment)).toEqual([first, last])
    expect(content.imageItems).toEqual([])
    expect(content.errorItems).toEqual([])
  })

  it('keeps user images and errors separate from ordinary tool details', () => {
    const image = { ...tool('image', 'success'), name: 'image_show' }
    const error: ErrorSegment = { type: 'error', segmentId: 'error', error: { name: 'Error', message: 'Failed', timestamp: 3 } }
    const content = projectCleanOutputContent(project([tool('read', 'success'), image, error]))
    expect(content.imageItems.map(item => item.segment)).toEqual([image])
    expect(content.errorItems.map(item => item.segment)).toEqual([error])
    expect(content.textItems).toEqual([])
  })

  it('distinguishes empty or invalid images from a valid image-only answer', () => {
    const image = { ...tool('image', 'success'), name: 'image_show' }
    expect(projectCleanOutputContent(project([])).hasVisibleContent).toBe(false)
    expect(projectCleanOutputContent(project([text('  '), image])).hasVisibleContent).toBe(false)
    const assetId = `${'a'.repeat(64)}.png`
    image.content.result = { kind: 'image_show', success: true, image: {
      assetId, url: `image-asset://snapshot/${assetId}`, mimeType: 'image/png', size: 10, width: 32, height: 32
    } }
    expect(projectCleanOutputContent(project([image])).hasVisibleContent).toBe(true)
  })

  it('prioritizes interaction and cancellation over parallel tools', () => {
    const transcript = project([tool('a'), tool('b')])
    expect(projectCleanOutputStatus(transcript)).toBe('Running 2 tools…')
    expect(projectCleanOutputStatus(transcript, 'approval')).toBe('Waiting for approval')
    expect(projectCleanOutputStatus(transcript, 'question')).toBe('Waiting for your answer')
    expect(projectCleanOutputStatus(transcript, 'cancelling')).toBe('Stopping…')
    expect(projectCleanOutputStatus(project([tool('a', 'success'), tool('b')]))).toBe('Running read_file…')
    expect(projectCleanOutputStatus(project([tool('a', 'pending')]))).toBe('Preparing read_file…')
  })

  it('follows current text/reasoning phase', () => {
    const thought: ReasoningSegment = { type: 'reasoning', segmentId: 'thought', content: 'Private reasoning', timestamp: 2 }
    expect(projectCleanOutputStatus(project([]))).toBe('Working…')
    expect(projectCleanOutputStatus(project([text()]))).toBe('Writing response…')
    expect(projectCleanOutputStatus(project([text(), thought]))).toBe('Thinking…')
    expect(projectCleanOutputStatus(project([{ ...thought, endedAt: 3 }]))).toBe('Private reasoning')
    expect(projectCleanOutputStatus(project([thought, tool('a', 'failed')]))).toBe('Working…')
  })

  it('waits for a complete second reasoning sentence and keeps it stable as streaming continues', () => {
    const thought: ReasoningSegment = { type: 'reasoning', segmentId: 'thought', content: '', timestamp: 2 }
    for (const content of ['', 'The user says hello.', 'The user says hello. I will check']) {
      thought.content = content
      expect(projectCleanOutputStatus(project([thought]))).toBe('Thinking…')
    }
    thought.content = 'The user says hello. I will check the project. More analysis'
    expect(projectCleanOutputStatus(project([thought]))).toBe('I will check the project.')
    thought.content += ' continues.'
    expect(projectCleanOutputStatus(project([thought]))).toBe('I will check the project.')
    expect(projectCleanOutputStatus(project([thought, tool('active')]))).toBe('Running read_file…')
    expect(projectCleanOutputStatus(project([thought]), 'approval')).toBe('Waiting for approval')
    expect(projectCleanOutputStatus(project([thought]), 'question')).toBe('Waiting for your answer')
    expect(projectCleanOutputStatus(project([thought]), 'cancelling')).toBe('Stopping…')
  })

  it.each([
    ['用户提出了问题。先核对项目\n配置。再进行验证。', '先核对项目 配置。'],
    ['The user asks about version 1.2. I will inspect the config.', 'I will inspect the config.'],
    ['The user asks why. Check the config! Later steps.', 'Check the config!'],
    ['The user asks why. “Check the config.” Later steps.', '“Check the config.”']
  ])('extracts the complete second sentence from %s', (content, expected) => {
    const thought: ReasoningSegment = { type: 'reasoning', segmentId: 'thought', content, timestamp: 2 }
    expect(projectCleanOutputStatus(project([thought]))).toBe(expected)
  })

  it('uses available reasoning after completion, including an unpunctuated final sentence', () => {
    const thought: ReasoningSegment = { type: 'reasoning', segmentId: 'thought', content: 'Only one sentence.', timestamp: 2, endedAt: 3 }
    expect(projectCleanOutputStatus(project([thought]))).toBe('Only one sentence.')
    thought.content = 'The user asks why. Check the config'
    expect(projectCleanOutputStatus(project([thought]))).toBe('Check the config')
    thought.content = '  '
    expect(projectCleanOutputStatus(project([thought]))).toBe('Working…')
    expect(projectCleanOutputStatus(project([thought, text()]))).toBe('Writing response…')
  })

  it('uses streamed reasons from object or partial JSON arguments in one line', () => {
    const current = tool('a', 'pending')
    current.content.args = '{"tool_call_reason":"核对项目\\n配置", "file":'
    expect(projectCleanOutputStatus(project([current]))).toBe('核对项目 配置 Running 1 tool.')
    current.content.args = { tool_call_reason: '验证修改结果', file: 'private-file' }
    expect(projectCleanOutputStatus(project([current]))).toBe('验证修改结果 Running 1 tool.')
    current.content.args = { tool_call_reason: '   ' }
    expect(projectCleanOutputStatus(project([current]))).toBe('Preparing read_file…')
  })

  it('shows the latest active reason with a parallel count and excludes completed reasons', () => {
    const earlier = tool('a')
    earlier.content.args = { tool_call_reason: 'Read configuration' }
    const latest = tool('b')
    latest.content.args = { tool_call_reason: 'Check build scripts' }
    expect(projectCleanOutputStatus(project([earlier, latest]))).toBe('Check build scripts Running 2 tools.')
    latest.content.status = 'success'
    expect(projectCleanOutputStatus(project([earlier, latest]))).toBe('Read configuration Running 1 tool.')
    expect(projectCleanOutputStatus(project([earlier, latest]), 'approval')).toBe('Waiting for approval')
  })
})
