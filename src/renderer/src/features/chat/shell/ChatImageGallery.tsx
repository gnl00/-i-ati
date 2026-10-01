import { Cross1Icon } from '@radix-ui/react-icons'
import {
  ImageViewer,
  PreviewImage,
  type ImagePreviewSource,
} from '@renderer/shared/components/image-viewer'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { useRef } from 'react'

export default function ChatImageGallery(): React.ReactElement | null {
  const imageSrcBase64List = useChatStore((state) => state.imageSrcBase64List)
  const setImageSrcBase64List = useChatStore(
    (state) => state.setImageSrcBase64List,
  )
  const thumbnailsRef = useRef<(HTMLButtonElement | null)[]>([])
  const galleryRef = useRef<HTMLDivElement>(null)
  const images = imageSrcBase64List.flatMap((url, index) =>
    typeof url === 'string' ? [{ url, originalIndex: index }] : [],
  )
  const getSource = (index: number): ImagePreviewSource => ({
    element: thumbnailsRef.current[index],
    viewport: galleryRef.current?.getBoundingClientRect(),
  })

  if (images.length === 0) return null

  return (
    <ImageViewer urls={images.map((image) => image.url)} getSource={getSource}>
      {(open) => (
        <div
          ref={galleryRef}
          aria-label="Image attachments"
          className="flex h-full max-w-full gap-2 overflow-x-auto overflow-y-hidden [container-type:size] [scrollbar-width:none]"
          onClick={(event) => event.stopPropagation()}
        >
          {images.map((image, index) => (
            <div
              key={`${image.originalIndex}:${image.url}`}
              className="group relative shrink-0 self-start"
            >
              <button
                ref={(node) => {
                  thumbnailsRef.current[index] = node
                }}
                type="button"
                aria-label={`Open image ${index + 1} of ${images.length}`}
                className="flex min-h-7 min-w-7 max-w-40 items-center justify-center overflow-hidden rounded-md border border-(--chat-border-subtle) bg-white p-0.5 transition-colors duration-150 hover:border-(--chat-border-standard) hover:bg-(--chat-surface-hover) motion-reduce:transition-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--chat-accent) dark:bg-(--chat-surface) dark:hover:bg-(--chat-surface-hover)"
                onClick={(event) => open(index, event.detail > 0)}
              >
                <PreviewImage
                  src={image.url}
                  alt={`Image ${index + 1}`}
                  className="h-auto w-auto max-h-[calc(100cqh_-_6px)] max-w-[154px]"
                />
              </button>
              <button
                type="button"
                aria-label={`Remove image ${index + 1}`}
                className="group/remove absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity duration-150 hover:bg-red-600 focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent) group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                onClick={() =>
                  setImageSrcBase64List(
                    imageSrcBase64List.filter(
                      (_, itemIndex) => itemIndex !== image.originalIndex,
                    ),
                  )
                }
              >
                <Cross1Icon aria-hidden="true" className="h-3 w-3 transition-transform duration-300 ease-in-out group-hover/remove:rotate-180 motion-reduce:transition-none motion-reduce:group-hover/remove:rotate-none" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ImageViewer>
  )
}
