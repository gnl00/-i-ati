import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import * as cheerio from 'cheerio'

const handleWebSearch = async ({ fetchCounts, param }) => {
  let browser
  try {
    console.log('headless-search action received:', fetchCounts, param);
    const stealthPlugin = stealth()
    chromium.use(stealthPlugin)
    browser = await chromium.launch({ headless: true, timeout: 50000 })
    // Create a new incognito browser context
    const context = await browser.newContext({
      // userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
    })
    await context.route('**/*.{png,jpg,jpeg}', route => route.abort());
    // Create a new page inside context.
    const page = await context.newPage()
    // 监听页面内的 console.log 输出
    page.on('console', msg => console.log('PAGE LOG:', msg.text()))
    
    // Navigate to search page
    const searchSite = 'www.bing.com'
    const queryStr = searchSite.includes('google') ? (param as string).trim().replaceAll(' ', '+') : (param as string)
    const encodedQueryStr = encodeURIComponent(queryStr)
    await page.goto(`https://${searchSite}/search?q=${encodedQueryStr}`)
    await page.route('**/*', route => {
      const request = route.request();
      const url = request.url();
      if (url.includes('ads') || url.includes('tracker')) {
        return route.abort();
      }
      route.continue();
    });
    await page.reload({ waitUntil: 'networkidle' }); // avoid empty content
    // Wait for search results to load
    await page.waitForSelector('ol#b_results', { timeout: 30000 })
    
    // Extract the first 2 search result URLs
    const relevantLinks = await page.evaluate((count) => {
      const results: string[] = []
      const searchResultLinks = document.querySelectorAll('ol#b_results li.b_algo h2 a[href^="http"]')
      for (let i = 0; i < Math.min(count, searchResultLinks.length); i++) {
        const link: any = searchResultLinks[i]
        // console.log(link.href);
        if (link.href && !link.href.includes('google.com')) {
          results.push(link.href)
        }
      }
      return results
    }, fetchCounts)
    console.log('links', relevantLinks)
    const promises: Promise<string>[] = relevantLinks.map(l => new Promise(async (resolve, rej) => {
      let p
      try {
        p = await context.newPage()
        // 等待页面完全加载，避免导航冲突
        await p.goto(l, { waitUntil: 'domcontentloaded', timeout: 30000 })
        // 等待页面稳定
        await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
          console.log(`Network idle timeout for ${l}, continuing anyway`)
        })

        await p.evaluate(() => {
          const noiseSelectors = [
            'script', 'style', 'nav', 'header', 'footer',
            '.ad', '.advertisement', '.sidebar', '.comments',
            '[class*="related"]', '[class*="recommend"]'
          ]
          noiseSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.remove());
          })
        })
        const pContent = await p.content()
        // console.log('pContent', pContent)
        const $ = cheerio.load(pContent)
        const allText = $('body > div').text()
        const unCleanText = allText ? allText.replaceAll(' ', '').replaceAll('\n', '').replaceAll('\t', '') : ''
        const cleanedText = postClean(unCleanText)
        resolve(cleanedText)
      } catch (error) {
        console.log(`navigate error ${l}`, error)
        // 返回空字符串而不是拒绝，避免单个链接失败导致整体失败
        resolve('')
      } finally {
        // 确保页面被关闭，避免资源泄漏
        if (p) {
          await p.close().catch(() => {})
        }
      }
    }))
    const results = await Promise.all(promises)
    // console.log('Promise.all', results)

    await browser.close()
    
    // Send result back to renderer
    return { success: true, links: relevantLinks, result: results }
  } catch (error: any) {
    console.error('headless-web-search error:', error)
    
    return { success: false, result: error.message }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

function postClean(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(分享到|广告|推广|Copyright|备案号).*$/gim, '');
}

export {
  handleWebSearch
}