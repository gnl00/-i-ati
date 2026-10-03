import { Download, FileText, RotateCcw, X } from 'lucide-react'

function downloadAttachment(attachment: TextAttachment): void {
  const url = URL.createObjectURL(new Blob([attachment.text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = attachment.filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const actionClass = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-(--chat-text-secondary) hover:bg-(--chat-surface-hover) active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent) motion-reduce:active:scale-100'

export function TextAttachmentList({ attachments, onRemove, onRestore }: {
  attachments: TextAttachment[]
  onRemove?: (id: string) => void
  onRestore?: (attachment: TextAttachment) => void
}): React.JSX.Element | null {
  if (!attachments.length) return null
  return (
    <div aria-label="Text attachments" className="flex min-w-0 flex-col gap-1.5" onClick={event => event.stopPropagation()}>
      {attachments.map(attachment => (
        <div key={attachment.id} className="min-w-0 rounded-lg border border-(--chat-border-subtle) bg-(--chat-surface) px-2 py-1">
          <details className="group min-w-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md text-xs text-(--chat-text-primary) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent) [&::-webkit-details-marker]:hidden">
              <FileText aria-hidden="true" className="size-4 shrink-0 text-(--chat-text-secondary)" />
              <span className="min-w-0 flex-1 truncate font-medium" title={attachment.filename}>{attachment.filename}</span>
              <span className="shrink-0 text-[10px] tabular-nums text-(--chat-text-muted)">{new TextEncoder().encode(attachment.text).byteLength.toLocaleString()} B · {attachment.text.split(/\r\n|\r|\n/).length.toLocaleString()} lines</span>
              <span className="shrink-0 text-[10px] text-(--chat-text-secondary) group-open:hidden">Preview</span>
              <span className="hidden shrink-0 text-[10px] text-(--chat-text-secondary) group-open:inline">Close</span>
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-(--app-surface-inset) p-2 font-mono text-[11px] leading-5 text-(--chat-text-body)">{attachment.text}</pre>
          </details>
          <div className="flex items-center justify-end gap-1">
            {onRestore && <button type="button" className={actionClass} title="Paste as text" aria-label={`Paste ${attachment.filename} as text`} onClick={() => onRestore(attachment)}><RotateCcw className="size-3.5" /></button>}
            <button type="button" className={actionClass} title="Download" aria-label={`Download ${attachment.filename}`} onClick={() => downloadAttachment(attachment)}><Download className="size-3.5" /></button>
            {onRemove && <button type="button" className={actionClass} title="Remove" aria-label={`Remove ${attachment.filename}`} onClick={() => onRemove(attachment.id)}><X className="size-3.5" /></button>}
          </div>
        </div>
      ))}
    </div>
  )
}
