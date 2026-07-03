export type ParsedDataImageUrl = {
  mediaType: string
  data: string
}

const DATA_IMAGE_URL_PATTERN = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/i

export const parseDataImageUrl = (url: string): ParsedDataImageUrl | undefined => {
  const match = DATA_IMAGE_URL_PATTERN.exec(url.trim())
  if (!match) {
    return undefined
  }

  const mediaType = match[1].trim().toLowerCase()
  const data = match[2].replace(/\s/g, '')
  if (!mediaType.startsWith('image/') || !data) {
    return undefined
  }

  return { mediaType, data }
}

export const inferImageMimeTypeFromUrl = (url: string): string | undefined => {
  const pathname = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return url.split(/[?#]/, 1)[0]
    }
  })().toLowerCase()

  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (pathname.endsWith('.png')) {
    return 'image/png'
  }
  if (pathname.endsWith('.webp')) {
    return 'image/webp'
  }
  if (pathname.endsWith('.gif')) {
    return 'image/gif'
  }

  return undefined
}
