import { BrowserWindow } from 'electron'

interface WebSearchHandlerArgs {
  fetchCounts: number
  param: string
}

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'

const handleWebSearch = async ({ fetchCounts, param }: WebSearchHandlerArgs) => {
  let searchWindow: BrowserWindow | null = null

  try {
    console.log('electron-search action received:', fetchCounts, param);

    // Create a hidden window for search
    searchWindow = new BrowserWindow({
      show: false,
      width: 1366,
      height: 768,
      webPreferences: {
        offscreen: true, // Use offscreen rendering for better performance
        sandbox: false,  // Needed for some advanced operations? usually better to keep true, but let's stick to simple extraction
        webSecurity: false, // Allow cross-origin if needed, though for search it might not be strictly necessary
        images: false, // Disable images to save bandwidth
      }
    })

    // Set user agent
    searchWindow.webContents.setUserAgent(userAgent)

    const searchSite = 'www.bing.com'
    const queryStr = (param as string).trim().replaceAll(' ', '+')
    const searchUrl = `https://${searchSite}/search?q=${queryStr}`

    // Load search page
    await searchWindow.loadURL(searchUrl, { userAgent })

    // Wait for results to be present
    // Simple wait mechanism: check periodically
    await waitForCondition(async () => {
      if (!searchWindow) return false
      return await searchWindow.webContents.executeJavaScript(`
        document.querySelectorAll('ol#b_results').length > 0
      `)
    }, 15000, 500)

    // Extract links
    const relevantLinks = await searchWindow.webContents.executeJavaScript(`
      (() => {
        const results = []
        const count = ${fetchCounts}
        const searchResultLinks = document.querySelectorAll('ol#b_results li.b_algo h2 a[href^="http"]')
        for (let i = 0; i < Math.min(count, searchResultLinks.length); i++) {
          const link = searchResultLinks[i]
          if (link.href && !link.href.includes('google.com')) {
            results.push(link.href)
          }
        }
        return results
      })()
    `)

    console.log('links', relevantLinks)

    // Close search window early to free resources
    if (searchWindow) {
      searchWindow.close()
      searchWindow = null
    }

    // Process links in parallel (or sequential if we want to be nice to resources, but parallel is faster)
    // We will use a pool of hidden windows or just spawn one per link. Spawning one per link for small counts (3) is fine.

    const results = await Promise.allSettled(relevantLinks.map(async (link: string) => {
      let contentWindow: BrowserWindow | null = null
      try {
        contentWindow = new BrowserWindow({
          show: false,
          webPreferences: {
            offscreen: true,
            images: false,
            webSecurity: false // sometimes needed to bypass some iframe issues or mixed content
          }
        })
        contentWindow.webContents.setUserAgent(userAgent)

        // Timeout for loading
        setTimeout(() => {
          if (contentWindow && !contentWindow.isDestroyed()) {
            contentWindow.webContents.stop()
          }
        }, 15000)

        await contentWindow.loadURL(link, { userAgent })

        // Extract content
        const extractedText = await contentWindow.webContents.executeJavaScript(`
          (() => {
            // Remove noise
            const noiseSelectors = [
              'script', 'style', 'nav', 'header', 'footer',
              '.ad', '.advertisement', '.sidebar', '.comments',
              '[class*="related"]', '[class*="recommend"]',
              'iframe', 'noscript'
            ]
            noiseSelectors.forEach(sel => {
              document.querySelectorAll(sel).forEach(el => el.remove())
            })

            // Main selectors
            const mainSelectors = [
              'main', 'article', '[role="main"]', '.content', '.main-content', '#content', '#main'
            ]
            
            let mainContent = null
            for (const selector of mainSelectors) {
              mainContent = document.querySelector(selector)
              if (mainContent) break
            }
            
            const targetElement = mainContent || document.body
            return targetElement.innerText || targetElement.textContent || ''
          })()
        `)

        return postClean(extractedText)

      } catch (err: any) {
        console.error(`Error scraping ${link}:`, err.message)
        return ''
      } finally {
        if (contentWindow) {
          contentWindow.close()
        }
      }
    }))

    const finalResults = results.map(r => r.status === 'fulfilled' ? r.value : '').filter(t => t.length > 0)

    return { success: true, links: relevantLinks, result: finalResults }

  } catch (error: any) {
    console.error('electron-web-search error:', error)
    return { success: false, result: error.message }
  } finally {
    if (searchWindow) {
      searchWindow.close()
    }
  }
}

// Helper: Polling wait
function waitForCondition(checkFn: () => Promise<boolean>, timeout: number, interval: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const timer = setInterval(async () => {
      try {
        if (await checkFn()) {
          clearInterval(timer)
          resolve()
        } else if (Date.now() - startTime > timeout) {
          clearInterval(timer)
          reject(new Error('Timeout waiting for condition'))
        }
      } catch (e) {
        // If checkFn fails (e.g. window closed), we might want to stop
        clearInterval(timer)
        reject(e)
      }
    }, interval)
  })
}

function postClean(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(分享到|广告|推广|Copyright|备案号|关注我们|订阅|Newsletter).*$/gim, '')
    .trim()
}

export {
  handleWebSearch
}
