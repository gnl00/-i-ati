import { activityJournalToolMetadata } from './activityJournal/metadata'
import { commandToolMetadata } from './command/metadata'
import { emotionToolMetadata } from './emotion/metadata'
import { fileOperationsToolMetadata } from './fileOperations/metadata'
import { historyToolMetadata } from './history/metadata'
import { logToolMetadata } from './log/metadata'
import { memoryToolMetadata } from './memory/metadata'
import { mergeEmbeddedToolMetadata } from './metadata-utils'
import { planToolMetadata } from './plan/metadata'
import { pluginToolMetadata } from './plugin/metadata'
import { registryToolMetadata } from './registry/metadata'
import { scheduleToolMetadata } from './schedule/metadata'
import { skillToolMetadata } from './skills/metadata'
import { soulToolMetadata } from './soul/metadata'
import { subagentToolMetadata } from './subagent/metadata'
import { telegramToolMetadata } from './telegram/metadata'
import { userInfoToolMetadata } from './userInfo/metadata'
import { webToolMetadata } from './webTools/metadata'
import { workContextToolMetadata } from './workContext/metadata'

export type {
  EmbeddedToolCapability,
  EmbeddedToolMetadata,
  EmbeddedToolMetadataMap,
  EmbeddedToolRiskLevel
} from './metadata-types'

export const embeddedToolMetadata = mergeEmbeddedToolMetadata(
  registryToolMetadata,
  webToolMetadata,
  fileOperationsToolMetadata,
  workContextToolMetadata,
  memoryToolMetadata,
  historyToolMetadata,
  commandToolMetadata,
  skillToolMetadata,
  planToolMetadata,
  scheduleToolMetadata,
  soulToolMetadata,
  emotionToolMetadata,
  pluginToolMetadata,
  telegramToolMetadata,
  userInfoToolMetadata,
  activityJournalToolMetadata,
  logToolMetadata,
  subagentToolMetadata
)
