type MarkdownNode = {
  type?: string
  value?: string
  children?: MarkdownNode[]
}

function splitTextWithBreaks(value: string): MarkdownNode[] {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = normalized.split('\n')
  const nodes: MarkdownNode[] = []

  parts.forEach((part, index) => {
    if (part) {
      nodes.push({ type: 'text', value: part })
    }
    if (index < parts.length - 1) {
      nodes.push({ type: 'break' })
    }
  })

  return nodes
}

// Convert soft line breaks into hard breaks so chat messages keep user-entered newlines.
export function remarkPreserveLineBreaks() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children) return

      const nextChildren: MarkdownNode[] = []
      for (const child of node.children) {
        if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('\n')) {
          nextChildren.push(...splitTextWithBreaks(child.value))
          continue
        }

        if (child.children) {
          visit(child)
        }
        nextChildren.push(child)
      }

      node.children = nextChildren
    }

    visit(tree)
  }
}
