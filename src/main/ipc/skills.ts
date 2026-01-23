import { ipcMain } from 'electron'
import { SkillService } from '@main/services/skills/SkillService'
import { processLoadSkill, processReadSkillFile, processUnloadSkill } from '@main/tools/skills/SkillToolsProcessor'
import {
  SKILL_LIST_ACTION,
  SKILL_GET_ACTION,
  SKILL_LOAD_ACTION,
  SKILL_UNLOAD_ACTION,
  SKILL_IMPORT_ACTION,
  SKILL_READ_FILE_ACTION
} from '@shared/constants'

export function registerSkillHandlers(): void {
  ipcMain.handle(SKILL_LIST_ACTION, async () => {
    console.log('[Skill IPC] List installed skills')
    return await SkillService.listSkills()
  })

  ipcMain.handle(SKILL_GET_ACTION, async (_event, { name }) => {
    console.log(`[Skill IPC] Get skill content: ${name}`)
    return await SkillService.getSkillContent(name)
  })

  ipcMain.handle(SKILL_READ_FILE_ACTION, async (_event, args) => {
    console.log('[Skill IPC] Read skill file')
    return await processReadSkillFile(args)
  })

  ipcMain.handle(SKILL_LOAD_ACTION, async (_event, args) => {
    console.log('[Skill IPC] Load skill')
    return await processLoadSkill(args)
  })

  ipcMain.handle(SKILL_UNLOAD_ACTION, async (_event, args) => {
    console.log('[Skill IPC] Unload skill')
    return await processUnloadSkill(args)
  })

  ipcMain.handle(SKILL_IMPORT_ACTION, async (_event, { folderPath }) => {
    console.log('[Skill IPC] Import skills from folder')
    return await SkillService.importSkillsFromFolder(folderPath)
  })
}
