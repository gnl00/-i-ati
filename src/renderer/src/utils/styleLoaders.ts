let katexPromise: Promise<void> | null = null
let speedHighlightAtomDarkPromise: Promise<void> | null = null
let speedHighlightDefaultPromise: Promise<void> | null = null

export const loadKatexStyles = (): Promise<void> => {
  if (!katexPromise) {
    katexPromise = import('katex/dist/katex.min.css').then(() => {})
  }
  return katexPromise
}

export const loadSpeedHighlightTheme = (theme: 'atom-dark' | 'default'): Promise<void> => {
  if (theme === 'default') {
    if (!speedHighlightDefaultPromise) {
      speedHighlightDefaultPromise = import('@speed-highlight/core/themes/default.css')
        .then(() => {})
        .catch(() => loadSpeedHighlightTheme('atom-dark'))
    }
    return speedHighlightDefaultPromise
  }

  if (!speedHighlightAtomDarkPromise) {
    speedHighlightAtomDarkPromise = import('@speed-highlight/core/themes/atom-dark.css').then(() => {})
  }
  return speedHighlightAtomDarkPromise
}

export const preloadRendererStyles = (): void => {
  void loadKatexStyles()
  void loadSpeedHighlightTheme('atom-dark')
}
