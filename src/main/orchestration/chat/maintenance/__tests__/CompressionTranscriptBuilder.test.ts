import { describe, expect, it } from 'vitest'
import { CompressionTranscriptBuilder } from '../CompressionTranscriptBuilder'

const message = (
  id: number,
  role: ChatMessage['role'],
  content: ChatMessage['content'],
  overrides: Partial<ChatMessage> = {}
): MessageEntity => ({
  id,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role,
    content,
    segments: [],
    ...overrides
  }
})

describe('CompressionTranscriptBuilder', () => {
  it('groups assistant tool calls with paired tool results', () => {
    const transcript = new CompressionTranscriptBuilder().build([
      message(1, 'user', '使用 plan 制定分步计划'),
      message(2, 'assistant', '计划已建好，7 步。要开始执行吗？', {
        toolCalls: [{
          id: 'call-plan-create',
          type: 'function',
          function: {
            name: 'plan_create',
            arguments: JSON.stringify({
              goal: '完成新品去重代码落地',
              status: 'pending',
              steps: [{ id: '1', title: '创建实体', status: 'todo' }]
            })
          }
        }]
      }),
      message(3, 'tool', JSON.stringify({
        success: true,
        plan: {
          id: 'plan-1',
          status: 'pending',
          steps: [{ id: '1', title: '创建实体', status: 'todo' }]
        }
      }), {
        toolCallId: 'call-plan-create'
      })
    ])

    expect(transcript).toContain('<user id="1">')
    expect(transcript).toContain('使用 plan 制定分步计划')
    expect(transcript).toContain('<assistant id="2">')
    expect(transcript).toContain('<tool name="plan_create" call_id="call-plan-create">')
    expect(transcript).toContain('<param>')
    expect(transcript).toContain('"status": "todo"')
    expect(transcript).toContain('<result message_id="3">')
    expect(transcript).toContain('"plan": {')
    expect(transcript).toContain('</tool>')
    expect(transcript).toContain('</assistant>')
    expect(transcript).not.toContain('<tool_result id="3"')
  })

  it('keeps unmatched tool results as orphan blocks', () => {
    const transcript = new CompressionTranscriptBuilder().build([
      message(4, 'tool', '{"success":true}', {
        toolCallId: 'missing-call'
      })
    ])

    expect(transcript).toBe([
      '<tool_result id="4" tool_call_id="missing-call" orphan="true">',
      '{',
      '  "success": true',
      '}',
      '</tool_result>'
    ].join('\n'))
  })

  it('omits raw image data from VLM image parts', () => {
    const transcript = new CompressionTranscriptBuilder().build([
      message(5, 'user', [
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,raw-image-payload',
            detail: 'auto'
          }
        },
        {
          type: 'text',
          text: 'please inspect this screenshot'
        }
      ])
    ])

    expect(transcript).toContain('[Image omitted from compression input] #1')
    expect(transcript).toContain('please inspect this screenshot')
    expect(transcript).not.toContain('data:image')
    expect(transcript).not.toContain('raw-image-payload')
    expect(transcript).not.toContain('"image_url"')
  })
})
