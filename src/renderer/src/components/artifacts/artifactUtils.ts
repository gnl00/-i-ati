import { toast } from 'sonner'
import { getWorkspacePath } from '@renderer/utils/workspaceUtils'

/**
 * 根据文件扩展名获取语言类型
 */
export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'mjs': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'css',
    'less': 'css',
    'json': 'json',
    'md': 'markdown',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'rb': 'ruby',
    'php': 'php',
    'c': 'c',
    'cpp': 'cpp',
    'sh': 'bash',
    'yml': 'yaml',
    'yaml': 'yaml',
    'xml': 'xml',
    'sql': 'sql',
  }
  return languageMap[ext] || 'text'
}

/**
 * 复制文件内容到剪贴板
 */
export async function copyFileToClipboard(content: string, fileName: string): Promise<void> {
  if (!content) return
  try {
    await navigator.clipboard.writeText(content)
    toast.success(`${fileName} 已复制`, { duration: 1500 })
  } catch (err) {
    toast.error('复制失败', { duration: 1500 })
  }
}

/**
 * 下载文件
 */
export function downloadFile(content: string, fileName: string): void {
  if (!content || !fileName) return
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success(`${fileName} 已下载`, { duration: 1500 })
}

/**
 * 复制工作区路径到剪贴板
 */
export async function copyWorkspacePath(chatUuid: string, customWorkspacePath?: string): Promise<void> {
  if (!chatUuid) return
  const workspacePath = getWorkspacePath(chatUuid, customWorkspacePath)
  await navigator.clipboard.writeText(workspacePath)
  toast.success('Copied', { description: workspacePath, duration: 2000 })
}

/**
 * 统计文件树中的文件数量
 */
export function countFilesInTree(nodes: any[]): number {
  return nodes.reduce((count, node) => {
    if (node.type === 'file') return count + 1
    if (node.children) return count + countFilesInTree(node.children)
    return count
  }, 0)
}
