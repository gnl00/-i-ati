# Web Tools 优化计划

## 背景

当前 web_fetch 工具使用 BrowserWindow 加载页面并在浏览器环境中执行 JavaScript 来提取内容。虽然可以处理动态内容，但内容过滤逻辑写在 `executeJavaScript` 字符串中，不够灵活且难以维护。

## 优化方案：BrowserWindow + Cheerio 混合架构

### 核心思路

1. **BrowserWindow 负责渲染** - 执行 JavaScript，获取动态内容
2. **提取渲染后的 HTML** - 将完整的 DOM 结构传回 Node.js
3. **Cheerio 负责解析和过滤** - 在服务端进行精细化内容提取

### 优势

#### 1. 解决 JavaScript 执行问题
- BrowserWindow 已经执行了所有 JavaScript
- 可以获取 SPA 和动态加载的内容
- 自动处理页面重定向

#### 2. 更强大的内容处理能力
- Cheerio 提供 jQuery 风格的 API，比字符串拼接更灵活
- 可以进行复杂的 DOM 遍历和选择
- 易于实现结构化数据提取

#### 3. 更好的可维护性
- 过滤逻辑在 Node.js 端，易于调试
- 可以编写单元测试
- 代码结构更清晰

#### 4. 性能优化
- 减少浏览器端计算，只提取 HTML
- Cheerio 解析速度快（比 JSDOM 快 8 倍）
- 可以并行处理多个页面

## 实现步骤

### 第一阶段：基础实现

#### 1.1 安装依赖
```bash
npm install cheerio
npm install -D @types/cheerio
```

#### 1.2 修改 fetchPageContent 函数
**当前实现：**
```typescript
const result = await contentWindow.webContents.executeJavaScript(`
  (() => {
    // 在浏览器中进行复杂的 DOM 操作
    // 移除元素、查找内容等
    return { pageTitle, finalUrl, extractedText }
  })()
`)
```

**优化后：**
```typescript
// 只提取必要的原始数据
const pageData = await contentWindow.webContents.executeJavaScript(`
  ({
    html: document.documentElement.outerHTML,
    finalUrl: window.location.href,
    title: document.title || ''
  })
`)

// 在 Node.js 端用 Cheerio 处理
const $ = cheerio.load(pageData.html)
// ... 进行内容过滤和提取
```

#### 1.3 实现 Cheerio 内容提取逻辑
- 移除噪声元素（script, style, nav, footer, ads 等）
- 识别主要内容区域（main, article 等）
- 提取纯文本内容
- 清理和格式化文本

### 第二阶段：功能增强（可选）

#### 2.1 结构化内容提取
- 保留标题层级（h1-h6）
- 提取列表结构
- 识别表格数据
- 保留链接信息

#### 2.2 Markdown 转换
- 集成 turndown 库
- 将 HTML 转换为 Markdown
- 保留文档结构
- 输出对 LLM 友好的格式

#### 2.3 智能内容识别
- 使用启发式算法识别主要内容
- 计算内容密度
- 过滤低质量内容
- 提取关键信息

#### 2.4 性能优化
- 在浏览器端做初步过滤（只返回 body）
- 添加内容缓存机制
- 优化页面加载策略（阻止图片、视频加载）
- 提前停止加载（监听 dom-ready 事件）

## 技术细节

### 数据流

```
URL 请求
  ↓
BrowserWindow 加载页面
  ↓
执行 JavaScript（动态内容渲染）
  ↓
提取 HTML + URL + Title
  ↓
传输到 Node.js 主进程
  ↓
Cheerio 解析 HTML
  ↓
移除噪声元素
  ↓
提取主要内容
  ↓
文本清理和格式化
  ↓
返回结果
```

### 关键代码位置

- **WebToolsProcessor.ts** - 主要处理逻辑
  - `fetchPageContent()` - 需要修改的核心函数
  - `postClean()` - 文本清理函数（可能需要调整）

### 需要注意的问题

#### 1. HTML 大小
- 某些页面的 HTML 可能很大（几 MB）
- IPC 传输可能有性能影响
- 解决方案：在浏览器端做初步过滤，只返回 body

#### 2. 内存占用
- 需要在内存中保存完整的 HTML 字符串
- Cheerio 解析也需要内存
- 解决方案：及时释放资源，避免内存泄漏

#### 3. 错误处理
- HTML 格式错误
- 编码问题
- 超大文档处理
- 解决方案：添加完善的错误处理和降级策略

## 预期效果

### 性能提升
- 减少浏览器端计算时间
- 提高内容提取准确性
- 更快的响应速度

### 代码质量
- 更清晰的代码结构
- 更容易测试和维护
- 更好的错误处理

### 功能扩展
- 为未来的 Markdown 转换做准备
- 支持更复杂的内容提取需求
- 易于添加新的过滤规则

## 参考资料

- [Cheerio 官方文档](https://cheerio.js.org/)
- [Cheerio 中文文档](docs/cheerio.md)
- [Turndown - HTML to Markdown](https://github.com/mixmark-io/turndown)
- [Readability.js - 内容提取算法](https://github.com/mozilla/readability)

## 时间规划

- **第一阶段**：基础实现（核心功能）
- **第二阶段**：功能增强（根据需求选择性实现）

## 下一步行动

1. 安装 cheerio 依赖
2. 修改 fetchPageContent 函数
3. 实现基于 Cheerio 的内容过滤
4. 测试和验证效果
5. 根据效果决定是否进入第二阶段
