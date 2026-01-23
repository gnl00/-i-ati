let katexPromise: Promise<void> | null = null
let speedHighlightPromise: Promise<void> | null = null

export const loadKatexStyles = (): Promise<void> => {
  if (!katexPromise) {
    katexPromise = import('katex/dist/katex.min.css').then(() => {})
  }
  return katexPromise
}

export const loadSpeedHighlightTheme = (): Promise<void> => {
  if (!speedHighlightPromise) {
    speedHighlightPromise = import('@speed-highlight/core/themes/atom-dark.css').then(() => {})
  }
  return speedHighlightPromise
}

export const preloadRendererStyles = (): void => {
  void loadKatexStyles()
  void loadSpeedHighlightTheme()
}
