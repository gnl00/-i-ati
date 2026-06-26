export const escapeXmlText = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
)

export const escapeXmlAttribute = (value: string): string => (
  escapeXmlText(value)
    .replace(/"/g, '&quot;')
)

export const xmlSelfClosingTag = (
  name: string,
  attrs: Record<string, string | number | boolean | null | undefined> = {}
): string => {
  const renderedAttrs = Object.entries(attrs)
    .filter(([, value]) => value != null)
    .map(([attrName, value]) => `${attrName}="${escapeXmlAttribute(String(value))}"`)
    .join(' ')

  if (!renderedAttrs) {
    return `<${name} />`
  }

  return `<${name} ${renderedAttrs} />`
}

export const xmlTag = (name: string, content: string): string => (
  `<${name}>${content}</${name}>`
)
