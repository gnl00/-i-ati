import { readFile, writeFile, mkdir, copyFile } from 'fs/promises'
import { dirname } from 'path'
import { existsSync } from 'fs'
import type {
  ReadTextFileArgs,
  ReadTextFileResponse,
  WriteFileArgs,
  WriteFileResponse,
  EditFileArgs,
  EditFileResponse,
  SearchFileArgs,
  SearchFileResponse,
  SearchMatch
} from '../index'

/**
 * Read File Processor
 * 读取文件内容，支持指定行范围
 */
export async function processReadFile(args: ReadTextFileArgs): Promise<ReadTextFileResponse> {
  try {
    const { file_path, encoding = 'utf-8', start_line, end_line } = args

    console.log(`[ReadFile] Reading file: ${file_path}`)

    // 检查文件是否存在
    if (!existsSync(file_path)) {
      return {
        success: false,
        error: `File not found: ${file_path}`
      }
    }

    // 读取文件内容
    const content = await readFile(file_path, encoding as BufferEncoding)
    const lines = content.split('\n')
    const totalLines = lines.length

    // 如果指定了行范围，则只返回指定范围的内容
    let resultContent = content
    if (start_line !== undefined || end_line !== undefined) {
      const start = Math.max(0, (start_line || 1) - 1)
      const end = end_line ? Math.min(totalLines, end_line) : totalLines
      resultContent = lines.slice(start, end).join('\n')
    }

    console.log(`[ReadFile] Successfully read ${totalLines} lines from ${file_path}`)

    return {
      success: true,
      content: resultContent,
      lines: totalLines
    }
  } catch (error: any) {
    console.error('[ReadFile] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to read file'
    }
  }
}

/**
 * Write File Processor
 * 写入文件内容，支持自动创建目录和备份
 */
export async function processWriteFile(args: WriteFileArgs): Promise<WriteFileResponse> {
  try {
    const { file_path, content, encoding = 'utf-8', create_dirs = true, backup = false } = args

    console.log(`[WriteFile] Writing to file: ${file_path}`)

    // 如果需要备份且文件存在，先备份
    if (backup && existsSync(file_path)) {
      const backupPath = `${file_path}.backup`
      await copyFile(file_path, backupPath)
      console.log(`[WriteFile] Created backup: ${backupPath}`)
    }

    // 如果需要创建目录
    if (create_dirs) {
      const dir = dirname(file_path)
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
        console.log(`[WriteFile] Created directory: ${dir}`)
      }
    }

    // 写入文件
    await writeFile(file_path, content, encoding as BufferEncoding)
    const bytesWritten = Buffer.byteLength(content, encoding as BufferEncoding)

    console.log(`[WriteFile] Successfully wrote ${bytesWritten} bytes to ${file_path}`)

    return {
      success: true,
      bytes_written: bytesWritten
    }
  } catch (error: any) {
    console.error('[WriteFile] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to write file'
    }
  }
}

/**
 * Edit File Processor
 * 编辑文件内容，支持字符串替换和正则替换
 */
export async function processEditFile(args: EditFileArgs): Promise<EditFileResponse> {
  try {
    const { file_path, search, replace, regex = false, all = false } = args

    console.log(`[EditFile] Editing file: ${file_path}`)

    // 检查文件是否存在
    if (!existsSync(file_path)) {
      return {
        success: false,
        error: `File not found: ${file_path}`
      }
    }

    // 读取文件内容
    const content = await readFile(file_path, 'utf-8')

    // 执行替换
    let newContent: string
    let replacements = 0

    if (regex) {
      // 使用正则表达式替换
      const flags = all ? 'g' : ''
      const regexPattern = new RegExp(search, flags)
      newContent = content.replace(regexPattern, () => {
        replacements++
        return replace
      })
    } else {
      // 使用字符串替换
      if (all) {
        const parts = content.split(search)
        replacements = parts.length - 1
        newContent = parts.join(replace)
      } else {
        const index = content.indexOf(search)
        if (index !== -1) {
          newContent = content.substring(0, index) + replace + content.substring(index + search.length)
          replacements = 1
        } else {
          newContent = content
        }
      }
    }

    // 写回文件
    if (replacements > 0) {
      await writeFile(file_path, newContent, 'utf-8')
      console.log(`[EditFile] Made ${replacements} replacement(s) in ${file_path}`)
    } else {
      console.log(`[EditFile] No matches found in ${file_path}`)
    }

    return {
      success: true,
      replacements
    }
  } catch (error: any) {
    console.error('[EditFile] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to edit file'
    }
  }
}

/**
 * Search File Processor
 * 在文件中搜索匹配的内容，支持正则表达式和大小写敏感
 */
export async function processSearchFile(args: SearchFileArgs): Promise<SearchFileResponse> {
  try {
    const { file_path, pattern, regex = false, case_sensitive = true, max_results = 100 } = args

    console.log(`[SearchFile] Searching in file: ${file_path}`)

    // 检查文件是否存在
    if (!existsSync(file_path)) {
      return {
        success: false,
        error: `File not found: ${file_path}`
      }
    }

    // 读取文件内容
    const content = await readFile(file_path, 'utf-8')
    const lines = content.split('\n')
    const matches: SearchMatch[] = []

    // 构建搜索模式
    let searchPattern: RegExp
    if (regex) {
      const flags = case_sensitive ? '' : 'i'
      searchPattern = new RegExp(pattern, flags)
    } else {
      const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const flags = case_sensitive ? 'g' : 'gi'
      searchPattern = new RegExp(escapedPattern, flags)
    }

    // 搜索每一行
    for (let i = 0; i < lines.length && matches.length < max_results; i++) {
      const line = lines[i]
      const lineMatches = line.matchAll(searchPattern)

      for (const match of lineMatches) {
        if (matches.length >= max_results) break

        matches.push({
          line: i + 1,
          content: line,
          column: match.index !== undefined ? match.index + 1 : 0
        })
      }
    }

    console.log(`[SearchFile] Found ${matches.length} match(es) in ${file_path}`)

    return {
      success: true,
      matches,
      total_matches: matches.length
    }
  } catch (error: any) {
    console.error('[SearchFile] Error:', error)
    return {
      success: false,
      error: error.message || 'Failed to search file'
    }
  }
}
