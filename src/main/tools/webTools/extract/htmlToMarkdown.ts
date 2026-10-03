import TurndownService from 'turndown'
import * as cheerio from 'cheerio'
import { createLogger } from '@main/logging/LogService'
import type { CleanMode } from './postClean'

const logger = createLogger('HtmlToMarkdown')

export type { CleanMode }

/**
 * 创建并配置 Turndown 实例
 */
export function createTurndownService(): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*'
  })

  turndownService.remove(['script', 'style', 'noscript'])

  turndownService.addRule('emptyLinks', {
    filter: (node) => node.nodeName === 'A' && !node.textContent?.trim(),
    replacement: () => ''
  })

  turndownService.addRule('emptyImages', {
    filter: (node) =>
      node.nodeName === 'IMG' && !node.getAttribute('alt') && !node.getAttribute('title'),
    replacement: () => ''
  })

  turndownService.addRule('fencedPreformattedCode', {
    filter: 'pre',
    replacement: (_content, node) => {
      const code = node.querySelector('code')
      const text = (code?.textContent ?? node.textContent ?? '').replace(/\r\n?/g, '\n')
      const classes = code?.getAttribute('class') || node.parentElement?.getAttribute('class') || ''
      const language = /(?:language|highlight)-([\w+-]+)/.exec(classes)?.[1] || ''
      const runs = text.match(/`{3,}/g) || []
      const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)))
      return `\n\n${fence}${language}\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}\n\n`
    }
  })

  return turndownService
}

/**
 * 将（已抽取的）HTML 片段转换为 Markdown。转换失败时降级为纯文本。
 */
export function convertHtmlToMarkdown(html: string): string {
  try {
    return createTurndownService().turndown(html)
  } catch (error) {
    logger.error('turndown_convert.failed', error)
    const $ = cheerio.load(html)
    return $('body').text()
  }
}
