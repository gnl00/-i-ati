export type ThinkTagToken = {
  type: 'text' | 'reasoning'
  content: string
}

export type ThinkTagTokenizerState = {
  isInThinkTag: boolean
  pendingThinkTagPrefix: string
}

const THINK_START = '<think>'
const THINK_END = '</think>'

const extractTrailingTagPrefix = (
  content: string,
  tag: string
): { stableContent: string; pendingPrefix: string } => {
  const maxPrefixLength = Math.min(tag.length - 1, content.length)

  for (let length = maxPrefixLength; length > 0; length -= 1) {
    const suffix = content.slice(-length)
    if (tag.startsWith(suffix)) {
      return {
        stableContent: content.slice(0, -length),
        pendingPrefix: suffix
      }
    }
  }

  return { stableContent: content, pendingPrefix: '' }
}

const pushToken = (
  tokens: ThinkTagToken[],
  type: ThinkTagToken['type'],
  content: string
): void => {
  if (!content) {
    return
  }

  const previous = tokens[tokens.length - 1]
  if (previous?.type === type) {
    previous.content += content
    return
  }

  tokens.push({ type, content })
}

export class ThinkTagTokenizer {
  parse(
    content: string | undefined,
    state: ThinkTagTokenizerState
  ): ThinkTagToken[] {
    if (!content) {
      return []
    }

    let input = `${state.pendingThinkTagPrefix}${content}`
    state.pendingThinkTagPrefix = ''
    const tokens: ThinkTagToken[] = []

    while (input) {
      if (state.isInThinkTag) {
        const thinkEndIndex = input.indexOf(THINK_END)
        if (thinkEndIndex !== -1) {
          pushToken(tokens, 'reasoning', input.slice(0, thinkEndIndex))
          state.isInThinkTag = false
          input = input.slice(thinkEndIndex + THINK_END.length)
          continue
        }

        const trailing = extractTrailingTagPrefix(input, THINK_END)
        pushToken(tokens, 'reasoning', trailing.stableContent)
        state.pendingThinkTagPrefix = trailing.pendingPrefix
        break
      }

      const thinkStartIndex = input.indexOf(THINK_START)
      if (thinkStartIndex === -1) {
        const trailing = extractTrailingTagPrefix(input, THINK_START)
        pushToken(tokens, 'text', trailing.stableContent)
        state.pendingThinkTagPrefix = trailing.pendingPrefix
        break
      }

      pushToken(tokens, 'text', input.slice(0, thinkStartIndex))
      input = input.slice(thinkStartIndex + THINK_START.length)
      state.isInThinkTag = true
    }

    return tokens
  }
}
