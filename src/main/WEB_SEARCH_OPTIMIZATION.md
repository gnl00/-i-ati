# Web Search 性能优化指南

## 📊 当前问题分析

### 原代码的性能瓶颈（导致 15s 延迟）

1. **重复加载页面** (第 36 行)
   ```typescript
   await page.reload({ waitUntil: 'networkidle' })
   ```
   - 问题：页面加载两次（goto + reload）
   - 影响：增加 3-5 秒

2. **过度等待网络空闲** (第 61-63 行)
   ```typescript
   await p.waitForLoadState('networkidle', { timeout: 10000 })
   ```
   - 问题：等待所有网络请求完成
   - 影响：每个页面增加 2-5 秒

3. **资源拦截设置混乱**
   - 第 17 行：context 级别拦截图片
   - 第 28-35 行：page 级别拦截广告（但在 goto 之后设置）
   - 问题：第一次加载没有拦截，reload 才生效

4. **低效的文本提取**
   ```typescript
   const pContent = await p.content()  // 传输整个 HTML
   const $ = cheerio.load(pContent)    // 在 Node.js 中解析
   ```
   - 问题：传输大量数据，然后在 Node.js 中处理
   - 影响：增加 1-2 秒

## 🚀 优化方案对比

| 优化项 | 原代码 | 优化后 | 预计提升 |
|--------|--------|--------|----------|
| 浏览器启动超时 | 50s | 30s | - |
| 搜索页等待策略 | networkidle | domcontentloaded | -3s |
| 搜索页超时 | 30s | 10s | - |
| 移除 reload | ❌ | ✅ | -3~5s |
| 内容页等待策略 | domcontentloaded + networkidle | 仅 domcontentloaded | -2~5s/页 |
| 内容页超时 | 30s + 10s | 10s | - |
| 文本提取方式 | cheerio (Node.js) | evaluate (浏览器内) | -1~2s/页 |
| 资源拦截 | 部分 | 全面（图片/字体/CSS/广告） | -2~3s/页 |
| 错误处理 | Promise.all | Promise.allSettled | 更稳定 |

**预计总提升：从 15s 降低到 5-8s**

## 🎯 关键优化点详解

### 1. 移除不必要的 reload

**原代码问题：**
```typescript
await page.goto(url)
await page.route('**/*', ...) // 在 goto 之后设置
await page.reload({ waitUntil: 'networkidle' }) // 重新加载
```

**优化方案：**
```typescript
await context.route('**/*', ...) // 在 context 级别设置
await page.goto(url, { waitUntil: 'domcontentloaded' }) // 只加载一次
```

### 2. 使用 domcontentloaded 代替 networkidle

**原理：**
- `domcontentloaded`: DOM 解析完成即可（通常 1-2s）
- `networkidle`: 等待所有网络请求完成（可能 5-10s）

**对于内容抓取，DOM 解析完成就足够了！**

### 3. 在浏览器内提取文本

**原代码：**
```typescript
const html = await page.content()  // 传输 100KB-1MB HTML
const $ = cheerio.load(html)       // Node.js 解析
const text = $('body').text()      // 提取文本
```

**优化后：**
```typescript
const text = await page.evaluate(() => {
  // 直接在浏览器内提取文本
  return document.body.innerText
})  // 只传输文本（10-50KB）
```

### 4. 全面的资源拦截

**拦截的资源类型：**
- ✅ 图片 (image)
- ✅ 媒体 (media)
- ✅ 字体 (font)
- ✅ 样式表 (stylesheet) - 可选
- ✅ 广告/追踪器域名

**预计节省：每个页面 50-80% 的带宽**

## 🔥 进阶优化建议

### 方案 A: 使用更轻量的浏览器引擎

```typescript
// 使用 Firefox 代替 Chromium（更快启动）
import { firefox } from 'playwright-extra'

browser = await firefox.launch({
  headless: true,
  timeout: 20000
})
```

### 方案 B: 复用浏览器实例

**当前问题：** 每次搜索都启动新浏览器（3-5s）

**优化方案：** 保持浏览器实例运行

```typescript
// 在应用启动时创建浏览器实例
let globalBrowser = null

async function getBrowser() {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await chromium.launch({ headless: true })
  }
  return globalBrowser
}

const handleWebSearch = async ({ fetchCounts, param }) => {
  const browser = await getBrowser()  // 复用实例
  const context = await browser.newContext()
  // ... 其余代码
  await context.close()  // 只关闭 context，不关闭 browser
}
```

**预计提升：节省 3-5s 启动时间**

### 方案 C: 使用 HTTP 客户端代替浏览器

**适用场景：** 如果目标网站不需要 JS 渲染

```typescript
import axios from 'axios'
import * as cheerio from 'cheerio'

async function fetchWithAxios(url: string) {
  const response = await axios.get(url, {
    timeout: 5000,
    headers: {
      'User-Agent': 'Mozilla/5.0 ...'
    }
  })
  const $ = cheerio.load(response.data)
  // 移除噪音元素
  $('script, style, nav, header, footer').remove()
  return $('body').text()
}
```

**优点：**
- 速度快 10-20 倍
- 资源占用少

**缺点：**
- 不支持需要 JS 渲染的网站
- 可能被反爬虫检测

### 方案 D: 混合策略（推荐）

```typescript
// 1. 先用 axios 尝试（快速）
// 2. 如果失败或内容为空，再用 playwright（可靠）

async function smartFetch(url: string) {
  try {
    // 尝试快速方式
    const text = await fetchWithAxios(url)
    if (text.length > 100) {
      return text
    }
  } catch (error) {
    console.log('Axios failed, falling back to playwright')
  }

  // 回退到 playwright
  return await fetchWithPlaywright(url)
}
```

### 方案 E: 限制并发数

**当前问题：** 同时打开 3 个页面可能导致资源竞争

```typescript
// 使用 p-limit 控制并发
import pLimit from 'p-limit'

const limit = pLimit(2)  // 最多同时 2 个页面

const promises = relevantLinks.map(link =>
  limit(() => fetchPageContent(link))
)
```

### 方案 F: 添加缓存机制

```typescript
import NodeCache from 'node-cache'

const searchCache = new NodeCache({ stdTTL: 3600 }) // 1小时缓存

const handleWebSearch = async ({ fetchCounts, param }) => {
  const cacheKey = `search:${param}`
  const cached = searchCache.get(cacheKey)

  if (cached) {
    console.log('Cache hit!')
    return cached
  }

  // ... 执行搜索
  const result = { success: true, links, result: results }
  searchCache.set(cacheKey, result)
  return result
}
```

### 方案 G: 使用搜索 API（终极方案）

**推荐服务：**
1. **Bing Search API** - 官方 API，速度快
2. **Google Custom Search API** - 每天 100 次免费
3. **SerpAPI** - 聚合多个搜索引擎
4. **Brave Search API** - 隐私友好

**优点：**
- 速度极快（< 1s）
- 稳定可靠
- 不需要浏览器

**缺点：**
- 需要 API key
- 可能有费用

```typescript
// 使用 Bing Search API 示例
import axios from 'axios'

async function bingSearch(query: string) {
  const response = await axios.get(
    'https://api.bing.microsoft.com/v7.0/search',
    {
      params: { q: query, count: 3 },
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY
      }
    }
  )

  const links = response.data.webPages.value.map(v => v.url)

  // 然后用 playwright 抓取这些链接的内容
  // ...
}
```

## 📈 性能测试建议

### 添加性能监控

```typescript
const handleWebSearch = async ({ fetchCounts, param }) => {
  const startTime = Date.now()
  const timings = {}

  try {
    // 浏览器启动
    const t1 = Date.now()
    browser = await chromium.launch(...)
    timings.browserLaunch = Date.now() - t1

    // 搜索页加载
    const t2 = Date.now()
    await page.goto(...)
    timings.searchPageLoad = Date.now() - t2

    // 内容抓取
    const t3 = Date.now()
    const results = await Promise.allSettled(promises)
    timings.contentFetch = Date.now() - t3

    timings.total = Date.now() - startTime

    console.log('Performance timings:', timings)

    return { success: true, links, result: results, timings }
  } catch (error) {
    // ...
  }
}
```

## 🎯 推荐实施顺序

### 阶段 1: 立即实施（预计提升 50%）
1. ✅ 使用优化后的代码（web-search-optimized.ts）
2. ✅ 移除 reload
3. ✅ 使用 domcontentloaded
4. ✅ 在浏览器内提取文本
5. ✅ 全面资源拦截

### 阶段 2: 短期优化（预计再提升 30%）
1. 🔄 复用浏览器实例
2. 🔄 添加缓存机制
3. 🔄 限制并发数为 2

### 阶段 3: 长期优化（预计再提升 20%）
1. 🔮 混合策略（axios + playwright）
2. 🔮 考虑使用搜索 API
3. 🔮 添加性能监控

## 📝 使用建议

### 替换现有代码

```bash
# 备份原文件
cp src/main/web-search.ts src/main/web-search.backup.ts

# 使用优化版本
cp src/main/web-search-optimized.ts src/main/web-search.ts
```

### 测试性能

```typescript
// 在 renderer 中测试
const startTime = Date.now()
const result = await window.electron?.ipcRenderer.invoke('web-search', {
  fetchCounts: 3,
  param: 'test query'
})
console.log(`Search took: ${Date.now() - startTime}ms`)
```

## ⚠️ 注意事项

1. **超时设置**
   - 根据网络环境调整超时时间
   - 国内网络可能需要更长超时

2. **反爬虫**
   - 某些网站可能检测 headless 浏览器
   - 已使用 stealth 插件，但不是 100% 有效

3. **资源占用**
   - 并行抓取会占用更多内存
   - 建议限制并发数

4. **错误处理**
   - 使用 Promise.allSettled 确保部分失败不影响整体
   - 记录失败的 URL 以便调试

## 🔍 故障排查

### 如果速度仍然慢

1. 检查网络连接
2. 检查目标网站是否响应慢
3. 增加日志查看哪个环节慢
4. 考虑使用代理

### 如果内容提取不完整

1. 检查目标网站是否需要 JS 渲染
2. 尝试等待特定元素加载
3. 调整 mainSelectors 选择器

### 如果频繁超时

1. 增加超时时间
2. 减少并发数
3. 检查是否被反爬虫拦截
