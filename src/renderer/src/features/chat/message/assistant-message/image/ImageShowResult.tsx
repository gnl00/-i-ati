import { useRef } from 'react'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import {
  ImageViewer,
  PreviewImage,
} from '@renderer/shared/components/image-viewer'
import {
  parseImageShowResult,
  isImageDisplayTool,
} from '@shared/tools/image/types'

export function ImageShowResult({
  toolCall,
}: {
  toolCall: ToolCallSegment
}): React.ReactElement | null {
  const persisted = useChatStore(
    (state) =>
      state.messages.find(
        (message) =>
          message.body.role === 'tool' &&
          isImageDisplayTool(message.body.name) &&
          message.body.toolCallId === toolCall.toolCallId,
      )?.body.content,
  )
  const result =
    parseImageShowResult(persisted) ??
    parseImageShowResult(toolCall.content?.result)
  const button = useRef<HTMLButtonElement>(null)
  if (!result) return null
  const status = result.telegram?.state
  const statusText =
    status === 'sent'
      ? 'Sent to Telegram'
      : status === 'failed'
        ? 'Telegram delivery failed'
        : status === 'sending'
          ? 'Telegram delivery pending'
          : status === 'unknown'
            ? 'Telegram delivery unconfirmed'
            : undefined
  return (
    <figure className="my-3 max-w-full" data-testid="image-show-result">
      <ImageViewer
        urls={[result.image.url]}
        getSource={() => ({ element: button.current })}
      >
        {(open) => (
          <button
            ref={button}
            type="button"
            aria-label="Open image"
            onClick={(event) => open(0, event.detail > 0)}
            style={{
              width: Math.min(
                320,
                (192 * result.image.width) / result.image.height,
              ),
              aspectRatio: `${result.image.width} / ${result.image.height}`,
            }}
            className="flex max-w-full items-center justify-center overflow-hidden rounded-lg border border-(--chat-border-subtle) bg-(--chat-surface) transition-colors duration-150 hover:border-(--chat-border-standard) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent) motion-reduce:transition-none"
          >
            <PreviewImage
              key={result.image.url}
              src={result.image.url}
              alt={result.caption || 'Displayed image'}
            />
          </button>
        )}
      </ImageViewer>
      {(result.caption || statusText) && (
        <figcaption className="mt-1.5 max-w-80 text-xs leading-5 text-(--chat-text-secondary)">
          {result.caption && (
            <p className="whitespace-pre-wrap wrap-anywhere">
              {result.caption}
            </p>
          )}
          {statusText && <p role="status">{statusText}</p>}
        </figcaption>
      )}
    </figure>
  )
}
