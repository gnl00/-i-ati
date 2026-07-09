import * as cheerio from 'cheerio'
import { createLogger } from '@main/logging/LogService'
import { convertHtmlToMarkdown, type CleanMode } from './htmlToMarkdown'
import { postClean } from './postClean'

const logger = createLogger('ContentExtractor')

// 结构性/语义性噪声：精确标签与精确类名，直接整块移除
const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  '.ad',
  '.ads',
  '.advertisement',
  '.sidebar',
  '.comments',
  '.comment',
  '.share',
  '.sharing',
  '.social',
  '.subscribe',
  '.newsletter',
  '.cookie',
  '.consent'
]

// className 词级黑名单：命中整词（以空格或连字符分隔）才移除。
// 用词边界而非子串匹配，避免误伤 hotel / recommendation / shotgun 等正文类名，
// 也覆盖 related-posts / recommend_list 这类连字符/下划线命名。
const NOISE_CLASS_RE = /(^|[\s_-])(related|recommend|promo|sponsor|share|social|advert|adsbygoogle)([\s_-]|$)/i

// 候选正文容器，语义标签优先
const CANDIDATE_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '[itemprop="articleBody"]',
  '[data-testid="article-body"]',
  '[data-content="article"]',
  '.post-content',
  '.entry-content',
  '.article-content',
  '.article',
  '.post',
  '.content',
  '.main-content',
  '#content',
  '#main'
]

const SEMANTIC_BOOST = new Set(['article', 'main'])
const MIN_CONTAINER_TEXT = 200

/**
 * 从完整 HTML 中抽取正文容器的 HTML 与页面标题。只 load 一次 cheerio。
 *
 * 选容器策略：不再「第一个命中即用」（易选到空壳 <main>），而是对所有候选按
 * 「文本量 × (1 - 链接密度) + 段落数加权」评分，取最高分容器，无合格候选退 body。
 */
export function extractMainHtml(html: string): { title: string; html: string } {
  const $ = cheerio.load(html)
  const title = $('title').first().text().trim()

  // 1) 移除结构性噪声
  NOISE_SELECTORS.forEach(sel => $(sel).remove())

  // 2) 移除 className 词级命中的噪声块
  $('[class]').each((_, el) => {
    const cls = ($(el).attr('class') || '')
    if (NOISE_CLASS_RE.test(cls)) $(el).remove()
  })

  // 3) 评分选容器
  let best: { el: any; score: number } | null = null
  const consider = (el: any, tag: string): void => {
    const $el = $(el)
    const text = $el.text().replace(/\s+/g, ' ').trim()
    const textLen = text.length
    if (textLen < MIN_CONTAINER_TEXT) return
    const linkLen = $el.find('a').text().length
    const linkDensity = textLen ? Math.min(linkLen / textLen, 1) : 1
    const pCount = $el.find('p').length
    let score = textLen * (1 - linkDensity) + pCount * 50
    if (SEMANTIC_BOOST.has(tag)) score *= 1.2
    if (!best || score > best.score) best = { el, score }
  }

  for (const selector of CANDIDATE_SELECTORS) {
    $(selector).each((_, el) => consider(el, (el as any).tagName?.toLowerCase() || ''))
  }

  const target = best ? $((best as { el: any }).el) : $('body')
  return { title, html: target.html() || '' }
}

/**
 * 完整抽取管线：HTML → 主容器 → Markdown → 逐行清洗。
 * 供直连 HTTP 路径与 BrowserWindow 渲染路径共用。
 *
 * @param fallbackTitle 当页面无 <title> 时使用的兜底标题
 */
export function extractCleanContent(
  html: string,
  mode: CleanMode,
  fallbackTitle = ''
): { title: string; text: string } {
  try {
    const { title, html: mainHtml } = extractMainHtml(html)
    const markdown = convertHtmlToMarkdown(mainHtml, mode)
    return {
      title: title || fallbackTitle,
      text: postClean(markdown, mode)
    }
  } catch (error) {
    logger.error('extract_clean_content.failed', error)
    return { title: fallbackTitle, text: '' }
  }
}
