let katexPromise: Promise<void> | null = null
let speedHighlightAtomDarkPromise: Promise<void> | null = null
let speedHighlightDarkPromise: Promise<void> | null = null

export const loadKatexStyles = (): Promise<void> => {
  if (!katexPromise) {
    katexPromise = import('katex/dist/katex.min.css').then(() => {})
  }
  return katexPromise
}

export const loadSpeedHighlightTheme = (theme: 'atom-dark' | 'dark'): Promise<void> => {
  if (theme === 'dark') {
    if (!speedHighlightDarkPromise) {
      speedHighlightDarkPromise = import('@speed-highlight/core/themes/dark.css')
        .then(() => {})
        .catch(() => loadSpeedHighlightTheme('atom-dark'))
    }
    return speedHighlightDarkPromise
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
