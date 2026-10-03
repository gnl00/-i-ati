/** Clipboard text attachments use ordinary text on every model API. */
export function shouldAttachPastedText(text: string): boolean {
  return text.length >= 8000 || (text.length >= 2000 && text.split(/\r\n|\r|\n/).length >= 100)
}

export function expandTextAttachments(text: string, attachments: TextAttachment[] = []): string {
  return [text, ...attachments.map(attachment =>
    `Attached text file: ${attachment.filename}\n\n--- BEGIN ATTACHED TEXT ---\n${attachment.text}\n--- END ATTACHED TEXT ---`
  )].filter(Boolean).join('\n\n')
}

export function isTextAttachmentList(value: unknown): value is TextAttachment[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(item =>
    item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 256
    && typeof item.filename === 'string' && /^pasted-text-[1-9]\d*\.txt$/.test(item.filename)
    && typeof item.text === 'string' && item.text.length > 0
  ))
}
