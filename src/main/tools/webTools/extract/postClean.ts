/**
 * 提取内容的最终逐行清洗。
 *
 * 与旧实现的差异：
 * 1. 保留短行（length > 0 而非 > 2）：中文短标题「简介」、列表符「- 」、单字标号、
 *    表格分隔等会被误删。
 * 2. 噪声按「行首锚定整行剔除」而非「关键字截到行尾」：旧的 /(广告|...).*$/gim 会把
 *    正文里出现关键字的行（如「广告投放策略研究」）从关键字处截断，误删正文。
 */

export type CleanMode = 'lite' | 'full'

// 整行以这些词开头才判定为噪声行（页脚/推广/版权/订阅等）
const NOISE_LINE = /^(分享到|广告|推广|Copyright|©|版权所有|备案号|关注我们|订阅|Newsletter|扫码关注|点击下载|下载客户端)/i

// 混排页脚里已知分隔符后的版权/备案尾巴，仅做精确尾清理，不用裸 .*$
const TRAILING_FOOTER = /\s*[|｜·•]\s*(Copyright|©|版权所有|备案号).*$/i

function cleanLines(text: string, lite: boolean): string {
  let fence: { marker: string; length: number } | undefined
  const lines: string[] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      lines.push(line)
      if (match && match[1][0] === fence.marker && match[1].length >= fence.length && !match[2].trim()) {
        fence = undefined
      }
      continue
    }
    if (match) {
      fence = { marker: match[1][0], length: match[1].length }
      lines.push(line)
      continue
    }
    // Preserve indentation and spacing in source files and Markdown code/lists.
    if (/^[ \t]+\S/.test(line)) {
      lines.push(line)
      continue
    }
    const cleaned = lite ? line.replace(TRAILING_FOOTER, '').trim() : line.trimEnd()
    if (lite && NOISE_LINE.test(cleaned)) continue
    lines.push(cleaned)
  }
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n')
}

export function postCleanLite(text: string): string {
  return cleanLines(text, true)
}

export function postCleanFull(text: string): string {
  return cleanLines(text, false)
}

export function postClean(text: string, mode: CleanMode): string {
  return mode === 'full' ? postCleanFull(text) : postCleanLite(text)
}
