import { app } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import DatabaseService from '@main/services/DatabaseService'
import { SkillService } from '@main/services/skills/SkillService'

interface LoadSkillArgs {
  source: string
  name?: string
  allowOverwrite?: boolean
  activate?: boolean
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
  chat_uuid?: string
}

interface LoadSkillResponse {
  success: boolean
  skill?: SkillMetadata
  content?: string
  activated?: boolean
  message?: string
}

interface UnloadSkillResponse {
  success: boolean
  removed?: boolean
  message?: string
}

interface ReadSkillFileResponse {
  success: boolean
  file_path?: string
  content?: string
  lines?: number
  message?: string
}

const isUrl = (value: string): boolean => /^https?:\/\//i.test(value)
const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const resolveSourcePath = (source: string, chatUuid?: string): string => {
  if (isUrl(source) || path.isAbsolute(source)) {
    return source
  }

  if (chatUuid) {
    const workspacePath = DatabaseService.getWorkspacePathByUuid(chatUuid)
    if (workspacePath) {
      return path.join(workspacePath, source)
    }
  }

  return path.join(app.getPath('userData'), source)
}

const resolveSkillFilePath = (name: string, relativePath: string): string => {
  if (!SKILL_NAME_REGEX.test(name)) {
    throw new Error(`Invalid skill name: "${name}"`)
  }
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error('path must be a relative file path')
  }

  const skillDir = path.join(app.getPath('userData'), 'skills', name)
  const resolved = path.resolve(skillDir, relativePath)
  const rel = path.relative(skillDir, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path escapes skill directory')
  }
  return resolved
}

export async function processLoadSkill(args: LoadSkillArgs): Promise<LoadSkillResponse> {
  try {
    const skill = await SkillService.loadSkill({
      source: resolveSourcePath(args.source, args.chat_uuid),
      name: args.name,
      allowOverwrite: args.allowOverwrite
    })

    const content = await SkillService.getSkillContent(skill.name)
    let activated = false
    if (args.activate !== false && args.chat_uuid) {
      const chat = DatabaseService.getChatByUuid(args.chat_uuid)
      if (chat?.id) {
        DatabaseService.addChatSkill(chat.id, skill.name)
        activated = true
      }
    }

    return {
      success: true,
      skill,
      content,
      activated,
      message: activated ? 'Skill loaded and activated.' : 'Skill loaded.'
    }
  } catch (error) {
    console.error('[SkillTools] Failed to load skill:', error)
    return {
      success: false,
      activated: false,
      message: `Failed to load skill: ${error.message}`
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

    const chat = DatabaseService.getChatByUuid(args.chat_uuid)
    if (!chat?.id) {
      return { success: false, removed: false, message: 'Chat not found' }
    }

    DatabaseService.removeChatSkill(chat.id, args.name)
    return { success: true, removed: true, message: 'Skill removed.' }
  } catch (error) {
    console.error('[SkillTools] Failed to unload skill:', error)
    return {
      success: false,
      removed: false,
      message: `Failed to unload skill: ${error.message}`
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

    const absolutePath = resolveSkillFilePath(args.name, args.path)
    if (!existsSync(absolutePath)) {
      return { success: false, message: `File not found: ${args.path}` }
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
      file_path: args.path,
      content: resultContent,
      lines: totalLines
    }
  } catch (error: any) {
    console.error('[SkillTools] Failed to read skill file:', error)
    return {
      success: false,
      message: error.message || 'Failed to read skill file'
    }
  }
}
