import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import * as cheerio from 'cheerio'

const handleWebSearch = async ({ fetchCounts, param }) => {
  let browser
  try {
    console.log('headless-search action received:', fetchCounts, param);
    const stealthPlugin = stealth()
    chromium.use(stealthPlugin)

    // 优化 1: 减少启动超时时间
    browser = await chromium.launch({
      headless: true,  // 使用 headless 模式，更快且节省资源
      timeout: 30000,  // 30秒启动超时
      args: [
        '--disable-dev-shm-usage',  // 避免共享内存问题
        '--disable-gpu',             // 禁用 GPU 加速
        '--no-sandbox',              // 沙箱模式（根据环境决定）
        '--disable-setuid-sandbox'
      ]
    })

    // 优化 2: 在 context 级别统一设置资源拦截
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      // 禁用不必要的功能
      javaScriptEnabled: true,  // 保持 JS 启用，因为某些网站需要
    })

    // 优化 3: 统一的资源拦截策略（在 context 级别）
    await context.route('**/*', route => {
      const request = route.request()
      const resourceType = request.resourceType()
      const url = request.url()

      // 拦截不需要的资源类型
      if (
        resourceType === 'image' ||
        resourceType === 'media' ||
        resourceType === 'font' ||
        // 注意：不拦截 stylesheet，因为某些网站需要 CSS 来显示内容
        // resourceType === 'stylesheet' ||
        url.includes('ads') ||
        url.includes('analytics') ||
        url.includes('doubleclick.net') ||
        url.includes('googlesyndication.com') ||
        url.includes('googletagmanager.com')
      ) {
        return route.abort()
      }
      route.continue()
    })

    const page = await context.newPage()

    // 优化 4: 使用更激进的等待策略
    const searchSite = 'www.bing.com'
    const queryStr = searchSite.includes('google')
      ? (param as string).trim().replaceAll(' ', '+')
      : (param as string)
    const encodedQueryStr = encodeURIComponent(queryStr)

    // 使用 load 等待策略，确保页面基本加载完成
    await page.goto(`https://${searchSite}/search?q=${encodedQueryStr}`, {
      waitUntil: 'load',  // 等待 load 事件，比 domcontentloaded 更可靠
      timeout: 20000      // 20秒超时，给搜索页足够时间
    })

    // 等待搜索结果出现（不要求可见，因为某些情况下元素可能被 CSS 隐藏）
    await page.waitForSelector('ol#b_results', {
      timeout: 15000,
      state: 'attached'  // 只要元素存在于 DOM 中即可，不要求可见
    })

    // 额外等待一下，确保 JavaScript 执行完成
    await page.waitForTimeout(1000)

    // Extract search result URLs
    const relevantLinks = await page.evaluate((count) => {
      const results: string[] = []
      const searchResultLinks = document.querySelectorAll('ol#b_results li.b_algo h2 a[href^="http"]')
      for (let i = 0; i < Math.min(count, searchResultLinks.length); i++) {
        const link: any = searchResultLinks[i]
        if (link.href && !link.href.includes('google.com')) {
          results.push(link.href)
        }
      }
      return results
    }, fetchCounts)

    console.log('links', relevantLinks)

    // 优化 6: 并行抓取，但使用更激进的策略
    const promises: Promise<string>[] = relevantLinks.map(async (link) => {
      let p
      try {
        p = await context.newPage()

        // 使用 load 等待策略，平衡速度和可靠性
        await p.goto(link, {
          waitUntil: 'load',  // 等待 load 事件，确保基本内容加载完成
          timeout: 15000      // 15秒超时，给内容页足够时间
        })

        // 可选：等待一小段时间让动态内容渲染
        await p.waitForTimeout(1500).catch(() => {})

        // 优化 8: 在浏览器内直接提取文本，减少数据传输
        const extractedText = await p.evaluate(() => {
          // 移除噪音元素
          const noiseSelectors = [
            'script', 'style', 'nav', 'header', 'footer',
            '.ad', '.advertisement', '.sidebar', '.comments',
            '[class*="related"]', '[class*="recommend"]',
            'iframe', 'noscript'
          ]
          noiseSelectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.remove())
          })

          // 优先提取主要内容区域
          const mainSelectors = [
            'main',
            'article',
            '[role="main"]',
            '.content',
            '.main-content',
            '#content',
            '#main'
          ]

          let mainContent = null
          for (const selector of mainSelectors) {
            mainContent = document.querySelector(selector)
            if (mainContent) break
          }

          // 如果找到主内容区域，只提取该区域；否则提取 body
          const targetElement = mainContent || document.body

          // 提取文本并进行基础清理
          return targetElement.innerText || targetElement.textContent || ''
        })

        // 优化 9: 简化文本清理逻辑
        const cleanedText = postClean(extractedText)
        return cleanedText

      } catch (error) {
        console.log(`Navigate error ${link}:`, error.message)
        return ''  // 失败返回空字符串
      } finally {
        if (p) {
          await p.close().catch(() => {})
        }
      }
    })

    // 优化 10: 使用 Promise.allSettled 代替 Promise.all
    // 这样即使某些 Promise 超时也不会影响其他的
    const settledResults = await Promise.allSettled(promises)
    const results = settledResults.map(result =>
      result.status === 'fulfilled' ? result.value : ''
    )

    await browser.close()

    return { success: true, links: relevantLinks, result: results }

  } catch (error: any) {
    console.error('headless-web-search error:', error)
    return { success: false, result: error.message }
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}

// 优化 11: 简化文本清理函数
function postClean(text: string): string {
  return text
    .replace(/\r\n/g, '\n')           // 统一换行符
    .replace(/[ \t]+/g, ' ')          // 合并多个空格/制表符
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2)        // 过滤太短的行
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')       // 合并多个换行
    .replace(/(分享到|广告|推广|Copyright|备案号|关注我们|订阅|Newsletter).*$/gim, '')
    .trim()
}

export {
  handleWebSearch
}
