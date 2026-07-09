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

function normalizeLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
}

export function postCleanLite(text: string): string {
  return normalizeLines(text)
    .filter(l => l.length > 0)
    .filter(l => !NOISE_LINE.test(l))
    .map(l => l.replace(TRAILING_FOOTER, '').trim())
    .filter(l => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function postCleanFull(text: string): string {
  return normalizeLines(text)
    .filter(l => l.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function postClean(text: string, mode: CleanMode): string {
  return mode === 'full' ? postCleanFull(text) : postCleanLite(text)
}
