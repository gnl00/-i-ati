import { app } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import { chatDb } from '@main/db/chat'
import { SkillService } from '@main/services/skills/SkillService'
import { processExecuteCommand } from '@main/tools/command/CommandProcessor'
import type { ExecuteCommandResponse } from '@tools/command/index.d'

interface LoadSkillArgs {
  name: string
  chat_uuid?: string
}

interface InstallSkillArgs {
  source: string
  name?: string
  allowOverwrite?: boolean
  chat_uuid?: string
}

interface ImportSkillsArgs {
  folderPath: string
  chat_uuid?: string
}

interface UnloadSkillArgs {
  name: string
  chat_uuid?: string
}

interface ReadSkillFileArgs {
  name: string
  path: string
  encoding?: string
  start_line?: number
  end_line?: number
  max_entries?: number
  chat_uuid?: string
}

interface RunSkillScriptArgs {
  name: string
  script: string
  args?: string[]
  env?: Record<string, string>
  timeout?: number
  chat_uuid?: string
}

interface InstallSkillResponse {
  success: boolean
  name?: string
  skill?: SkillMetadata
  message?: string
}

interface LoadSkillResponse {
  success: boolean
  name?: string
  loaded?: boolean
  contextInjected?: boolean
  message?: string
}

interface ImportSkillsResponse {
  success: boolean
  installed?: SkillMetadata[]
  renamed?: Array<{ from: string; to: string }>
  skipped?: Array<{ path: string; reason: string }>
  failed?: Array<{ path: string; error: string }>
  message?: string
}

interface UnloadSkillResponse {
  success: boolean
  removed?: boolean
  message?: string
}

interface ReadSkillFileResponse {
  success: boolean
  skill_root?: string
  file_path?: string
  absolute_path?: string
  content?: string
  lines?: number
  total_entries?: number
  truncated?: boolean
  entries?: Array<{
    name: string
    type: 'file' | 'directory' | 'other'
    path: string
  }>
  message?: string
}

interface RunSkillScriptResponse extends ExecuteCommandResponse {
  skill_root?: string
  script_path?: string
}

const isUrl = (value: string): boolean => /^https?:\/\//i.test(value)
const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DEFAULT_DIRECTORY_ENTRY_LIMIT = 100
const MAX_DIRECTORY_ENTRY_LIMIT = 500

const resolveSourcePath = (source: string, chatUuid?: string): string => {
  if (isUrl(source) || path.isAbsolute(source)) {
    return source
  }

  if (chatUuid) {
    const workspacePath = chatDb.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) {
      return path.join(workspacePath, source)
    }
  }

  return path.join(app.getPath('userData'), source)
}

const resolveSkillFilePath = (skillRoot: string, name: string, relativePath: string): string => {
  if (!SKILL_NAME_REGEX.test(name)) {
    throw new Error(`Invalid skill name: "${name}"`)
  }
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('path must be a relative file path')
  }

  const resolved = path.resolve(skillRoot, relativePath)
  const rel = path.relative(skillRoot, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path escapes skill directory')
  }
  return resolved
}

const resolveSkillRootPath = async (name: string): Promise<string> => {
  if (!SKILL_NAME_REGEX.test(name)) {
    throw new Error(`Invalid skill name: "${name}"`)
  }
  return await SkillService.resolveSkillRootPath(name)
}

const resolveSkillRelativePath = async (name: string, relativePath: string): Promise<{
  skillRoot: string
  absolutePath: string
}> => {
  const skillRoot = await resolveSkillRootPath(name)
  const absolutePath = resolveSkillFilePath(skillRoot, name, relativePath)
  return { skillRoot, absolutePath }
}

const normalizeSkillRelativePath = (relativePath: string): string => {
  const normalized = relativePath.replace(/\\/g, '/')
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '')
}

const getDirectoryEntryType = (
  entry: { isDirectory: () => boolean; isFile: () => boolean }
): 'file' | 'directory' | 'other' => {
  if (entry.isDirectory()) return 'directory'
  if (entry.isFile()) return 'file'
  return 'other'
}

const normalizeDirectoryEntryLimit = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DIRECTORY_ENTRY_LIMIT
  }
  return Math.max(1, Math.min(MAX_DIRECTORY_ENTRY_LIMIT, Math.floor(value)))
}

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`

const buildSkillScriptCommand = (scriptPath: string, args: string[] = []): string => {
  const quotedArgs = args.map(shellQuote).join(' ')
  const commandPrefix = scriptPath.endsWith('.ts')
    ? `bun ${shellQuote(scriptPath)}`
    : shellQuote(scriptPath)
  return [commandPrefix, quotedArgs].filter(Boolean).join(' ')
}

export async function processLoadSkill(args: LoadSkillArgs): Promise<LoadSkillResponse> {
  try {
    if (!args?.name) {
      return { success: false, loaded: false, message: 'name is required' }
    }
    if (!args.chat_uuid) {
      return { success: false, loaded: false, message: 'chat_uuid is required' }
    }

    const chat = chatDb.getChatByUuid(args.chat_uuid)
    if (!chat?.id) {
      return { success: false, loaded: false, message: 'Chat not found' }
    }

    await SkillService.getSkillContent(args.name)

    if (chatDb.getSkills(chat.id).includes(args.name)) {
      return {
        success: true,
        name: args.name,
        loaded: true,
        contextInjected: true,
        message: 'Skill already loaded in hidden skills context.'
      }
    }

    chatDb.addSkill(chat.id, args.name)

    return {
      success: true,
      name: args.name,
      loaded: true,
      contextInjected: true,
      message: 'Skill loaded into hidden skills context.'
    }
  } catch (error) {
    console.error('[SkillTools] Failed to load skill:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      loaded: false,
      message: `Failed to load skill: ${message}`
    }
  }
}

export async function processInstallSkill(args: InstallSkillArgs): Promise<InstallSkillResponse> {
  try {
    if (!args?.source) {
      return { success: false, message: 'source is required' }
    }

    const skill = await SkillService.loadSkill({
      source: resolveSourcePath(args.source, args.chat_uuid),
      name: args.name,
      allowOverwrite: args.allowOverwrite
    })

    return {
      success: true,
      name: skill.name,
      skill,
      message: 'Skill installed.'
    }
  } catch (error) {
    console.error('[SkillTools] Failed to install skill:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to install skill: ${message}`
    }
  }
}

export async function processImportSkills(args: ImportSkillsArgs): Promise<ImportSkillsResponse> {
  try {
    if (!args?.folderPath) {
      return { success: false, message: 'folderPath is required' }
    }

    const summary = await SkillService.importSkillsFromFolder(
      resolveSourcePath(args.folderPath, args.chat_uuid)
    )
    return {
      success: true,
      installed: summary.installed,
      renamed: summary.renamed,
      skipped: summary.skipped,
      failed: summary.failed,
      message: 'Skills imported.'
    }
  } catch (error) {
    console.error('[SkillTools] Failed to import skills:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message: `Failed to import skills: ${message}`
    }
  }
}

export async function processUnloadSkill(args: UnloadSkillArgs): Promise<UnloadSkillResponse> {
  try {
    if (!args?.name) {
      return { success: false, removed: false, message: 'name is required' }
    }
    if (!args.chat_uuid) {
      return { success: false, removed: false, message: 'chat_uuid is required' }
    }

    const chat = chatDb.getChatByUuid(args.chat_uuid)
    if (!chat?.id) {
      return { success: false, removed: false, message: 'Chat not found' }
    }

    chatDb.removeSkill(chat.id, args.name)
    return { success: true, removed: true, message: 'Skill removed.' }
  } catch (error) {
    console.error('[SkillTools] Failed to unload skill:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      removed: false,
      message: `Failed to unload skill: ${message}`
    }
  }
}

export async function processReadSkillFile(args: ReadSkillFileArgs): Promise<ReadSkillFileResponse> {
  try {
    if (!args?.name) {
      return { success: false, message: 'name is required' }
    }
    if (!args?.path) {
      return { success: false, message: 'path is required' }
    }

    const skillRoot = await resolveSkillRootPath(args.name)
    const absolutePath = resolveSkillFilePath(skillRoot, args.name, args.path)
    if (!existsSync(absolutePath)) {
      return { success: false, message: `File not found: ${args.path}` }
    }

    const stats = await fs.stat(absolutePath)
    if (stats.isDirectory()) {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true })
      const limit = normalizeDirectoryEntryLimit(args.max_entries)
      const baseRelativePath = normalizeSkillRelativePath(args.path)
      const mappedEntries = entries
        .map(entry => {
          return {
            name: entry.name,
            type: getDirectoryEntryType(entry),
            path: [baseRelativePath, entry.name].filter(Boolean).join('/')
          }
        })
        .sort((left, right) => {
          if (left.type !== right.type) {
            return left.type === 'directory' ? -1 : right.type === 'directory' ? 1 : 0
          }
          return left.name.localeCompare(right.name)
        })
      const limitedEntries = mappedEntries.slice(0, limit)

      return {
        success: true,
        skill_root: skillRoot,
        file_path: args.path,
        absolute_path: absolutePath,
        total_entries: mappedEntries.length,
        truncated: mappedEntries.length > limitedEntries.length,
        entries: limitedEntries
      }
    }

    const encoding = args.encoding || 'utf-8'
    const content = await fs.readFile(absolutePath, encoding as BufferEncoding)
    const lines = content.split('\n')
    const totalLines = lines.length
    let resultContent = content

    if (args.start_line !== undefined || args.end_line !== undefined) {
      const start = Math.max(0, (args.start_line || 1) - 1)
      const end = args.end_line ? Math.min(totalLines, args.end_line) : totalLines
      resultContent = lines.slice(start, end).join('\n')
    }

    return {
      success: true,
      skill_root: skillRoot,
      file_path: args.path,
      absolute_path: absolutePath,
      content: resultContent,
      lines: totalLines
    }
  } catch (error) {
    console.error('[SkillTools] Failed to read skill file:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      message
    }
  }
}

export async function processRunSkillScript(
  args: RunSkillScriptArgs
): Promise<RunSkillScriptResponse> {
  try {
    if (!args?.name) {
      return { success: false, error: 'name is required' }
    }
    if (!args?.script) {
      return { success: false, error: 'script is required' }
    }
    if (path.isAbsolute(args.script)) {
      return { success: false, error: 'script must be a relative file path' }
    }

    const { skillRoot, absolutePath } = await resolveSkillRelativePath(args.name, args.script)
    if (!existsSync(absolutePath)) {
      return {
        success: false,
        skill_root: skillRoot,
        script_path: absolutePath,
        error: `Script not found: ${args.script}`
      }
    }

    const stats = await fs.stat(absolutePath)
    if (stats.isDirectory()) {
      return {
        success: false,
        skill_root: skillRoot,
        script_path: absolutePath,
        error: `Script path is a directory: ${args.script}`
      }
    }

    const command = buildSkillScriptCommand(args.script, args.args)
    const result = await processExecuteCommand({
      command,
      cwd: skillRoot,
      timeout: args.timeout,
      env: args.env,
      execution_reason: `Run skill script ${args.name}/${args.script}`,
      possible_risk: 'Runs an available skill script with the working directory fixed to the skill root.',
      risk_score: 3,
      confirmed: true
    })

    return {
      ...result,
      skill_root: skillRoot,
      script_path: absolutePath
    }
  } catch (error) {
    console.error('[SkillTools] Failed to run skill script:', error)
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: message
    }
  }
}
