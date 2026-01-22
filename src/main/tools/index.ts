import tools from '@tools/definitions'
import { embeddedToolsRegistry, type ToolDefinition } from '@tools/registry'
import {
  processReadTextFile,
  processReadMediaFile,
  processReadMultipleFiles,
  processWriteFile,
  processEditFile,
  processSearchFile,
  processSearchFiles,
  processListDirectory,
  processListDirectoryWithSizes,
  processDirectoryTree,
  processGetFileInfo,
  processListAllowedDirectories,
  processCreateDirectory,
  processMoveFile
} from '@main-tools/fileOperations/main/FileOperationsProcessor'
import { processWebFetch, processWebSearch } from '@main-tools/webTools/main/WebToolsProcessor'
import { processMemoryRetrieval, processMemorySave } from '@main-tools/memory/main/MemoryToolsProcessor'
import { processExecuteCommand } from '@main-tools/command/main/CommandProcessor'
import { processLoadSkill, processUnloadSkill, processReadSkillFile } from '@main-tools/skills/main/SkillToolsProcessor'

const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  list_tools: async () => embeddedToolsRegistry.getAllToolDefinitions(),
  search_tools: (args) => embeddedToolsRegistry.searchTools(args),
  web_search: processWebSearch,
  web_fetch: processWebFetch,
  read_text_file: processReadTextFile,
  read_media_file: processReadMediaFile,
  read_multiple_files: processReadMultipleFiles,
  write_file: processWriteFile,
  edit_file: processEditFile,
  search_file: processSearchFile,
  search_files: processSearchFiles,
  list_directory: processListDirectory,
  list_directory_with_sizes: processListDirectoryWithSizes,
  directory_tree: processDirectoryTree,
  get_file_info: processGetFileInfo,
  list_allowed_directories: processListAllowedDirectories,
  create_directory: processCreateDirectory,
  move_file: processMoveFile,
  memory_retrieval: processMemoryRetrieval,
  memory_save: processMemorySave,
  execute_command: processExecuteCommand,
  load_skill: processLoadSkill,
  unload_skill: processUnloadSkill,
  read_skill_file: processReadSkillFile
}

export function initializeMainEmbeddedTools(): void {
  const toolDefinitions = tools as ToolDefinition[]
  toolDefinitions.forEach((toolDef) => {
    const toolName = toolDef.function.name
    const handler = toolHandlers[toolName]
    if (handler) {
      embeddedToolsRegistry.register(toolName, handler, toolDef)
    } else {
      console.warn(`[EmbeddedTools] No handler found for tool "${toolName}"`)
    }
  })
}
