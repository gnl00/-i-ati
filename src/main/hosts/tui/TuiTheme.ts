import type { MarkdownTheme, SelectListTheme } from '@earendil-works/pi-tui'

export type TuiThemeMode = 'light' | 'dark'
export function createTuiTheme(mode: TuiThemeMode): {
  muted: (text: string) => string
  accent: (text: string) => string
  warning: (text: string) => string
  error: (text: string) => string
  bold: (text: string) => string
  markdown: MarkdownTheme
  select: SelectListTheme
} {
  const color =
    (code: number) =>
    (text: string): string =>
      `\x1b[${code}m${text}\x1b[39m`
  const muted = color(90)
  const accent = color(mode === 'dark' ? 94 : 34)
  const warning = color(mode === 'dark' ? 93 : 33)
  const error = color(mode === 'dark' ? 91 : 31)
  const bold = (text: string): string => `\x1b[1m${text}\x1b[22m`
  return {
    muted,
    accent,
    warning,
    error,
    bold,
    markdown: {
      heading: bold,
      link: accent,
      linkUrl: muted,
      code: accent,
      codeBlock: (text) => text,
      codeBlockBorder: muted,
      quote: muted,
      quoteBorder: muted,
      hr: muted,
      listBullet: muted,
      bold,
      italic: (text) => `\x1b[3m${text}\x1b[23m`,
      strikethrough: (text) => `\x1b[9m${text}\x1b[29m`,
      underline: (text) => `\x1b[4m${text}\x1b[24m`
    },
    select: {
      selectedPrefix: accent,
      selectedText: bold,
      description: muted,
      scrollInfo: muted,
      noMatch: muted
    }
  }
}
export type TuiTheme = ReturnType<typeof createTuiTheme>
