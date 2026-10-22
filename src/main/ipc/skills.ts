import { ipcMain, shell } from 'electron'
import path from 'path'
import { createLogger } from '@main/logging/LogService'
import { SkillService } from '@main/services/skills/SkillService'
import { SKILL_FILE } from '@main/services/skills/SkillParser'
import { processLoadSkill, processReadSkillFile, processUnloadSkill } from '@main/tools/skills/SkillToolsProcessor'
import {
  SKILL_LIST_ACTION,
  SKILL_REFRESH_ACTION,
  SKILL_SCAN_RESULT_ACTION,
  SKILL_GET_ACTION,
  SKILL_LOAD_ACTION,
  SKILL_UNLOAD_ACTION,
  SKILL_READ_FILE_ACTION,
  SKILL_REVEAL_ACTION
} from '@shared/constants'

const logger = createLogger('SkillIPC')

export function registerSkillHandlers(): void {
  ipcMain.handle(SKILL_LIST_ACTION, async () => {
    logger.info('skill.list')
    return await SkillService.listSkills()
  })

  ipcMain.handle(SKILL_REFRESH_ACTION, async () => await SkillService.refresh())
  ipcMain.handle(SKILL_SCAN_RESULT_ACTION, async () => await SkillService.getScanResult())

  ipcMain.handle(SKILL_GET_ACTION, async (_event, { name }) => {
    logger.info('skill.get', { name })
    return await SkillService.getSkillContent(name)
  })

  ipcMain.handle(SKILL_READ_FILE_ACTION, async (_event, args) => {
    logger.info('skill.read_file')
    return await processReadSkillFile(args)
  })

  ipcMain.handle(SKILL_LOAD_ACTION, async (_event, args) => {
    logger.info('skill.load')
    return await processLoadSkill(args)
  })

  ipcMain.handle(SKILL_UNLOAD_ACTION, async (_event, args) => {
    logger.info('skill.unload')
    return await processUnloadSkill(args)
  })

  ipcMain.handle(SKILL_REVEAL_ACTION, async (_event, { name }) => {
    logger.info('skill.reveal', { name })
    try {
      const skillRoot = await SkillService.resolveSkillRootPath(name, { allowDisabled: true })
      shell.showItemInFolder(path.join(skillRoot, SKILL_FILE))
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
