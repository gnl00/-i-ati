import { describe, expect, it } from 'vitest'
import { expandTextAttachments, isTextAttachmentList, shouldAttachPastedText } from '../textAttachments'

const attachment = { id: 'paste-1', filename: 'pasted-text-1.txt', text: '你好\r\n  code\n' }

describe('pasted text attachments', () => {
  it('converts only pastes meeting the character or line threshold', () => {
    expect(shouldAttachPastedText('a'.repeat(7999))).toBe(false)
    expect(shouldAttachPastedText('a'.repeat(8000))).toBe(true)
    expect(shouldAttachPastedText(Array(100).fill('a').join('\n'))).toBe(false)
    expect(shouldAttachPastedText(Array(99).fill('x'.repeat(21)).join('\r\n'))).toBe(false)
    expect(shouldAttachPastedText(Array(100).fill('x'.repeat(21)).join('\r\n'))).toBe(true)
  })

  it('preserves every original character and attachment order in API-visible text', () => {
    const second = { ...attachment, id: 'paste-2', filename: 'pasted-text-2.txt', text: 'second' }
    const expanded = expandTextAttachments('Analyze these', [attachment, second])
    expect(expanded).toContain(`--- BEGIN ATTACHED TEXT ---\n${attachment.text}\n--- END ATTACHED TEXT ---`)
    expect(expanded.indexOf(attachment.filename)).toBeLessThan(expanded.indexOf(second.filename))
    expect(expandTextAttachments('unchanged')).toBe('unchanged')
    expect(expandTextAttachments('', [attachment])).toContain(attachment.text)
  })

  it('rejects malformed IPC attachments and unsafe names', () => {
    expect(isTextAttachmentList(undefined)).toBe(true)
    expect(isTextAttachmentList([attachment])).toBe(true)
    for (const value of [null, {}, [null], [{ ...attachment, filename: '../file.txt' }], [{ ...attachment, text: 42 }], [{ ...attachment, id: '' }]]) {
      expect(isTextAttachmentList(value)).toBe(false)
    }
  })
})
