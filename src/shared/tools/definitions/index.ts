/**
 * Tools Configuration
 * 合并所有工具定义并导出
 */

import { activityJournalTools } from '../activityJournal/definitions'
import { commandTools } from '../command/definitions'
import { emotionTools } from '../emotion/definitions'
import { fileOperationsTools } from '../fileOperations/definitions'
import { historyTools } from '../history/definitions'
import { knowledgebaseTools } from '../knowledgebase/definitions'
import { logTools } from '../log/definitions'
import { memoryTools } from '../memory/definitions'
import { mergeToolDefinitions } from '../definitions-utils'
import { planTools } from '../plan/definitions'
import { pluginTools } from '../plugin/definitions'
import { registryTools } from '../registry/definitions'
import { scheduleTools } from '../schedule/definitions'
import { skillTools } from '../skills/definitions'
import { soulTools } from '../soul/definitions'
import { subagentTools } from '../subagent/definitions'
import { telegramTools } from '../telegram/definitions'
import { userInfoTools } from '../userInfo/definitions'
import { webTools } from '../webTools/definitions'
import { workContextTools } from '../workContext/definitions'

/**
 * 合并所有工具定义
 */
export const tools = mergeToolDefinitions(
  registryTools,
  webTools,
  fileOperationsTools,
  workContextTools,
  memoryTools,
  historyTools,
  commandTools,
  skillTools,
  planTools,
  scheduleTools,
  soulTools,
  emotionTools,
  pluginTools,
  telegramTools,
  userInfoTools,
  activityJournalTools,
  knowledgebaseTools,
  subagentTools,
  logTools
)

/**
 * 导出默认工具配置
 */
export default tools
