const TOKEN_PREFIX = '\u0000TGTOKEN'
const TOKEN_SUFFIX = '\u0000'

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const escapeAttribute = (value: string): string => {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

const sanitizeUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}

const stripMarkdown = (value: string): string => {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/```(?:[a-zA-Z0-9_-]+\n)?([\s\S]*?)```/g, (_, code: string) => code.trimEnd())
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/~~([^\n]+?)~~/g, '$1')
    .replace(/\*\*([^\n]+?)\*\*/g, '$1')
    .replace(/__([^\n]+?)__/g, '$1')
    .replace(/(^|[^\*])\*([^\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_([^\n]+?)_(?!_)/g, '$1$2')
    .trim()
}

const applyInlineFormatting = (value: string): string => {
  return value
    .replace(/~~([^\n]+?)~~/g, '<s>$1</s>')
    .replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>')
    .replace(/__([^\n]+?)__/g, '<u>$1</u>')
    .replace(/(^|[\s(>])\*([^\n*][^\n]*?)\*(?=$|[\s).,!?:;<])/g, '$1<i>$2</i>')
    .replace(/(^|[\s(>])_([^\n_][^\n]*?)_(?=$|[\s).,!?:;<])/g, '$1<i>$2</i>')
}

const applyLineFormatting = (value: string): string => {
  const lines = value.split('\n')
  const formatted: string[] = []
  let quoteBuffer: string[] = []

  const flushQuoteBuffer = (): void => {
    if (quoteBuffer.length === 0) return
    formatted.push(`<blockquote>${quoteBuffer.join('\n')}</blockquote>`)
    quoteBuffer = []
  }

  lines.forEach(line => {
    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/)
    if (heading) {
      flushQuoteBuffer()
      formatted.push(`<b>${heading[1].trim()}</b>`)
      return
    }

    const quote = line.match(/^\s*&gt;\s?(.*)$/)
    if (quote) {
      quoteBuffer.push(quote[1])
      return
    }

    flushQuoteBuffer()

    formatted.push(line)
  })

  flushQuoteBuffer()
  return formatted.join('\n')
}

const markdownToTelegramHtml = (value: string): string => {
  const tokens: string[] = []
  const storeToken = (html: string): string => {
    const token = `${TOKEN_PREFIX}${tokens.length}${TOKEN_SUFFIX}`
    tokens.push(html)
    return token
  }

  let text = value.replace(/\r\n?/g, '\n').trim()

  text = text.replace(/```(?:[a-zA-Z0-9_-]+\n)?([\s\S]*?)```/g, (_, code: string) => {
    return storeToken(`<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`)
  })

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, url: string) => {
    const safeUrl = sanitizeUrl(url)
    if (!safeUrl) {
      return `${label} (${url})`
    }
    return storeToken(`<a href="${escapeAttribute(safeUrl)}">${escapeHtml(label)}</a>`)
  })

  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    return storeToken(`<pre><code>${escapeHtml(code)}</code></pre>`)
  })

  text = escapeHtml(text)
  text = applyLineFormatting(text)
  text = applyInlineFormatting(text)

  tokens.forEach((tokenHtml, index) => {
    text = text.replaceAll(`${TOKEN_PREFIX}${index}${TOKEN_SUFFIX}`, tokenHtml)
  })

  return text
}

export function formatTelegramRichText(value: string): {
  text: string
  fallbackText: string
  parseMode?: 'HTML'
} {
  const plainText = stripMarkdown(value)
  const html = markdownToTelegramHtml(value)
  const hasFormatting = /<\/?(?:b|i|u|s|code|pre|a|blockquote)>/i.test(html)

  if (!hasFormatting) {
    return {
      text: plainText,
      fallbackText: plainText
    }
  }

  return {
    text: html,
    fallbackText: plainText,
    parseMode: 'HTML'
  }
}
