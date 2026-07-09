import TurndownService from 'turndown'
import * as cheerio from 'cheerio'
import { createLogger } from '@main/logging/LogService'
import type { CleanMode } from './postClean'

const logger = createLogger('HtmlToMarkdown')

export type { CleanMode }

/**
 * 创建并配置 Turndown 实例
 */
export function createTurndownService(mode: CleanMode): TurndownService {
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

  if (mode === 'lite') {
    turndownService.addRule('trimLongCodeBlocks', {
      filter: (node) => node.nodeName === 'PRE',
      replacement: (content) => {
        const trimmed = content.trim()
        if (trimmed.length > 4000) {
          return `${trimmed.slice(0, 4000)}\n...`
        }
        return `\n\n${trimmed}\n\n`
      }
    })
  }

  return turndownService
}

/**
 * 将（已抽取的）HTML 片段转换为 Markdown。转换失败时降级为纯文本。
 */
export function convertHtmlToMarkdown(html: string, mode: CleanMode): string {
  try {
    return createTurndownService(mode).turndown(html)
  } catch (error) {
    logger.error('turndown_convert.failed', error)
    const $ = cheerio.load(html)
    return $('body').text()
  }
}
