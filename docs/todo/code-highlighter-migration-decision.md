# 代码高亮库迁移技术决策文档

**创建日期**: 2025-12-26
**状态**: 待决策
**相关文件**:
- `src/renderer/src/components/markdown/SyntaxHighlighterWrapper.tsx`
- `src/renderer/src/components/chat/SpeedCodeHighlight.tsx`
- `src/renderer/src/components/chat/ToolCallResult.tsx`

---

## 1. 背景

### 1.1 当前实现

项目中存在两个代码高亮方案：

| 组件 | 使用库 | 用途 | 大小 |
|------|--------|------|------|
| **ToolCallResult** | speed-highlight | 显示工具调用结果（JSON） | ~2kB + 1kB/语言 |
| **CodeWrapper** | react-syntax-highlighter | 显示各种语言代码块 | ~几百kB |

### 1.2 已完成的优化

- ✅ ToolCallResult 已迁移到 speed-highlight（2025-12-26）
- ✅ 实现了渐进式渲染，避免同时渲染多个工具调用造成卡顿
- ✅ 优化了 CodeWrapper 的样式、主题和用户体验

### 1.3 待决策问题

**是否需要将 CodeWrapper 中的 react-syntax-highlighter 也替换为 speed-highlight？**

---

## 2. 使用场景分析

### 2.1 ToolCallResult（已迁移）

**特点：**
- 主要显示 JSON 格式数据
- 可能同时渲染多个（3-10+ 个工具调用）
- 性能瓶颈明显，是主要优化目标
- 语言类型单一（JSON）

**迁移效果：**
- 体积减小：~200kB → ~3kB
- 渲染性能提升：配合渐进式渲染，流畅度显著改善
- **结论：迁移成功，效果显著 ✅**

### 2.2 CodeWrapper（待决策）

**特点：**
- 显示用户代码和 LLM 生成的代码
- 支持多种语言：Python, JavaScript, TypeScript, HTML, CSS, JSX, TSX, Vue, etc.
- 通常每条消息包含 1-3 个代码块
- 性能压力相对较小

**使用频率：**
- LLM 回复中经常包含代码示例
- 用户粘贴代码进行咨询
- 代码块长度不固定（10 行 - 200+ 行）

---

## 3. 技术对比

### 3.1 体积对比

| 库 | 核心大小 | 语言包大小 | 总大小（估算） |
|----|---------|-----------|--------------|
| **react-syntax-highlighter** | ~150kB | ~50kB/语言 | ~400-600kB (包含常用语言) |
| **speed-highlight** | ~2kB | ~1kB/语言 | ~10-20kB (包含常用语言) |

**体积差异：约 20-30 倍**

### 3.2 功能对比

| 功能 | react-syntax-highlighter | speed-highlight | 重要性 |
|------|--------------------------|-----------------|--------|
| 语言支持 | 200+ 种语言 | 20+ 种主流语言 | ⭐⭐⭐ |
| 主题支持 | 50+ 主题 | 5-10 主题 | ⭐⭐⭐ |
| 自动换行 | ✅ wrapLongLines | ⚠️ 需自定义 CSS | ⭐⭐⭐ |
| 行号显示 | ✅ showLineNumbers | ❌ 需自己实现 | ⭐⭐ |
| TypeScript 支持 | ✅ | ✅ | ⭐⭐⭐ |
| React 集成 | ✅ 原生支持 | ⚠️ 需封装 | ⭐⭐ |
| 渲染性能 | 中等 | 优秀 | ⭐⭐⭐ |
| 自定义样式 | ✅ 丰富 | ⚠️ 有限 | ⭐⭐ |

### 3.3 当前 CodeWrapper 使用的功能

```typescript
<MemoSyntaxHighlighter
  customStyle={{
    paddingTop: '0.5rem',
    paddingLeft: '0.75rem',
    paddingRight: '0.5rem',
    paddingBottom: '0.5rem',
    margin: '0',
    fontSize: '0.8125rem',
    lineHeight: '1.6',
  }}
  PreTag={'div'}
  children={String(children).replace(/\n$/, '')}
  language={language}
  style={isDarkMode ? vscDarkPlus : dracula}  // 自定义主题
  wrapLongLines={true}                         // 长行换行
  showLineNumbers={false}
/>
```

**关键依赖：**
- ✅ `customStyle` - 自定义样式
- ✅ `style={vscDarkPlus / dracula}` - 主题切换
- ✅ `wrapLongLines` - 长行自动换行
- ❌ `showLineNumbers` - 未使用

---

## 4. 迁移方案分析

### 方案 A：保持现状（推荐 ⭐⭐⭐⭐⭐）

**优势：**
1. **无性能瓶颈**
   - CodeWrapper 中代码块数量可控（1-3 个/消息）
   - 没有像 ToolCallResult 那样的批量渲染问题
   - 用户体验良好

2. **主题和样式完善**
   - 刚完成了主题优化（vscDarkPlus / dracula）
   - 样式效果好，用户满意
   - 迁移需重新适配主题

3. **功能完整**
   - `wrapLongLines` 对长代码很重要
   - 多语言支持完善
   - 边界情况处理成熟

4. **维护成本低**
   - 不需要重新测试各种语言
   - 不需要处理兼容性问题

**劣势：**
- Bundle 体积较大（但可接受）

**适用场景：**
- 性能表现良好
- 重视功能完整性和稳定性
- 主题和样式要求高

### 方案 B：完全迁移

**优势：**
1. **Bundle 体积大幅减小**
   - 减少 400-600kB → ~10-20kB
   - 对首次加载有明显帮助

2. **技术栈统一**
   - 只使用一个高亮库
   - 代码更简洁

3. **渲染性能提升**
   - speed-highlight 渲染速度更快
   - 对长代码块效果明显

**劣势：**
1. **需要重新实现功能**
   - 长行换行需自定义 CSS
   - 主题需要手动适配
   - 可能出现未知问题

2. **开发成本高**
   - 需要测试所有支持的语言
   - 需要重新调整样式
   - 可能影响用户体验

3. **主题选择受限**
   - speed-highlight 主题较少
   - 需要自己定制或妥协

**实施步骤（如果选择此方案）：**

1. **扩展 SpeedCodeHighlight 组件**（2-3 小时）
   ```typescript
   // 添加更多配置选项
   interface SpeedCodeHighlightProps {
     code: string
     language: string
     isDarkMode?: boolean
     wrapLines?: boolean  // 新增：长行换行
     maxHeight?: string   // 新增：最大高度
     customStyles?: React.CSSProperties
   }
   ```

2. **适配主题**（2-3 小时）
   - 研究 speed-highlight 的主题系统
   - 尝试模拟 vscDarkPlus / dracula 配色
   - 或选择 speed-highlight 自带主题（如 github-dark）

3. **实现长行换行**（1-2 小时）
   ```css
   .shj-lang-* {
     white-space: pre-wrap;
     word-break: break-word;
   }
   ```

4. **替换 CodeWrapper**（1 小时）
   ```typescript
   // 原来
   <MemoSyntaxHighlighter ... />

   // 替换为
   <SpeedCodeHighlight
     code={children}
     language={language}
     isDarkMode={isDarkMode}
     wrapLines={true}
   />
   ```

5. **全面测试**（2-3 小时）
   - 测试常用语言：JavaScript, TypeScript, Python, HTML, CSS, JSON
   - 测试长代码换行
   - 测试主题切换
   - 测试 iframe 渲染模式（HTML/JSX/Vue）

**预计工作量：8-12 小时**

### 方案 C：混合方案（灵活但复杂）

**思路：**
- 简单语言（JSON, plaintext）使用 speed-highlight
- 复杂语言（Python, JSX, TypeScript 等）使用 react-syntax-highlighter

**优势：**
- 平衡性能和功能

**劣势：**
- 逻辑复杂，难以维护
- 不推荐 ❌

---

## 5. 决策建议

### 推荐方案：**方案 A - 保持现状** ⭐⭐⭐⭐⭐

**理由：**

1. **性能优先级**
   - ✅ 真正的性能瓶颈（ToolCallResult）已解决
   - ✅ CodeWrapper 无明显性能问题
   - ✅ 渐进式渲染已优化了整体体验

2. **收益 vs 成本**
   - 迁移收益：减少 ~400kB bundle（对桌面应用影响有限）
   - 迁移成本：8-12 小时开发 + 可能的 bug + 用户体验风险
   - **结论：成本 > 收益**

3. **用户体验**
   - 当前主题和样式刚优化完成，效果很好
   - react-syntax-highlighter 功能完善，边界情况处理好
   - 迁移可能引入新问题

4. **技术债务**
   - react-syntax-highlighter 是成熟的行业标准
   - speed-highlight 更适合简单场景（如 JSON）
   - 保持现状不会增加技术债务

### 何时重新考虑迁移？

**触发条件：**
1. Bundle 分析显示 react-syntax-highlighter 占用 > 10%
2. 用户反馈代码块渲染卡顿
3. 首次加载时间超过 3 秒
4. 需要支持 Web 版本（对体积更敏感）

**评估方法：**
```bash
# 1. 构建生产版本
npm run build

# 2. 分析 bundle 大小
npx webpack-bundle-analyzer dist/stats.json

# 3. 查看 react-syntax-highlighter 的实际占比
# 如果占比 < 5% → 保持现状
# 如果占比 > 10% → 考虑迁移
```

---

## 6. 实施计划（如果决定迁移）

### Phase 1: 调研和准备（1-2 天）

- [ ] 使用 webpack-bundle-analyzer 分析当前 bundle
- [ ] 评估 react-syntax-highlighter 的实际占用
- [ ] 研究 speed-highlight 的主题定制方法
- [ ] 创建迁移 POC（Proof of Concept）

### Phase 2: 开发和测试（2-3 天）

- [ ] 扩展 SpeedCodeHighlight 组件
- [ ] 适配主题（vscDarkPlus / dracula 或替代方案）
- [ ] 实现长行换行逻辑
- [ ] 替换 CodeWrapper 实现
- [ ] 全面测试所有支持的语言

### Phase 3: 灰度发布和监控（1 周）

- [ ] 内部测试版本
- [ ] 收集用户反馈
- [ ] 监控性能指标
- [ ] 准备回滚方案

### Phase 4: 正式发布

- [ ] 修复发现的问题
- [ ] 更新文档
- [ ] 正式发布

---

## 7. 风险评估

### 迁移风险（方案 B）

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 主题效果不如预期 | 高 | 中 | 提前做 POC，准备回滚方案 |
| 某些语言高亮异常 | 中 | 中 | 全面测试，保留 react-syntax-highlighter 作为 fallback |
| 长行换行不完美 | 中 | 高 | 深入研究 CSS，或接受差异 |
| 开发时间超预期 | 低 | 中 | 预留 buffer 时间 |
| 用户体验下降 | 高 | 低 | 灰度发布，快速回滚 |

### 保持现状风险（方案 A）

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Bundle 持续增大 | 中 | 低 | 定期监控，按需优化 |
| 依赖库过时 | 低 | 低 | react-syntax-highlighter 仍在维护 |

---

## 8. 附录

### 8.1 相关技术文档

- [speed-highlight 官方文档](https://github.com/speed-highlight/core)
- [react-syntax-highlighter 官方文档](https://github.com/react-syntax-highlighter/react-syntax-highlighter)

### 8.2 已完成的优化记录

**2025-12-26: ToolCallResult 性能优化**
- ✅ 迁移到 speed-highlight
- ✅ 实现渐进式渲染
- ✅ 移除不必要的状态管理
- **效果：显著减少卡顿，用户体验提升**

**2025-12-26: CodeWrapper 样式优化**
- ✅ 添加主题切换（vscDarkPlus / dracula）
- ✅ 优化 header 设计
- ✅ 合并 CodeWrapper 和 CodeWrapperNoHeader
- ✅ 支持 vue 语言
- **效果：视觉体验大幅提升**

### 8.3 决策检查清单

在做出最终决策前，请确认：

- [ ] 已运行 bundle 分析，了解 react-syntax-highlighter 的实际占用
- [ ] 已评估用户对当前代码块渲染的满意度
- [ ] 已考虑开发成本和收益
- [ ] 已准备 POC 或回滚方案（如果选择迁移）
- [ ] 团队成员已达成共识

---

## 9. 最终建议

**推荐：方案 A - 保持现状**

**理由总结：**
1. 已解决主要性能瓶颈（ToolCallResult）
2. CodeWrapper 无明显性能问题
3. 当前主题和样式效果优秀
4. 迁移成本高，收益有限
5. 技术成熟度和稳定性优先

**后续行动：**
- 定期监控 bundle 大小
- 如果触发迁移条件（占用 > 10%），重新评估
- 继续优化其他性能瓶颈

**最后更新**: 2025-12-26
**决策人**: 待定
**预计下次评审**: 3-6 个月后或触发条件满足时
