import type { SubagentRole } from './subagent/index.d'

export type EmbeddedToolRiskLevel = 'none' | 'warning' | 'dangerous'

export type EmbeddedToolCapability =
  | 'filesystem_read'
  | 'filesystem_write'
  | 'web'
  | 'memory'
  | 'journal'
  | 'command'
  | 'plan'
  | 'schedule'
  | 'skill'
  | 'soul'
  | 'emotion'
  | 'user_info'
  | 'plugin'
  | 'telegram'
  | 'subagent'
  | 'log'
  | 'registry'

export interface EmbeddedToolMetadata {
  capability: EmbeddedToolCapability
  riskLevel: EmbeddedToolRiskLevel
  mutatesWorkspace: boolean
  subagent: 'allow' | 'deny'
  roles?: SubagentRole[]
}

export const embeddedToolMetadata: Record<string, EmbeddedToolMetadata> = {
  list_tools: {
    capability: 'registry',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  search_tools: {
    capability: 'registry',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  web_search: {
    capability: 'web',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  web_fetch: {
    capability: 'web',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  read: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  read_media: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  write: {
    capability: 'filesystem_write',
    riskLevel: 'none',
    mutatesWorkspace: true,
    subagent: 'allow',
    roles: ['general', 'coder']
  },
  edit: {
    capability: 'filesystem_write',
    riskLevel: 'none',
    mutatesWorkspace: true,
    subagent: 'allow',
    roles: ['general', 'coder']
  },
  grep: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  ls: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  glob: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  tree: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  stat: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  list_allowed_directories: {
    capability: 'filesystem_read',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  mkdir: {
    capability: 'filesystem_write',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  mv: {
    capability: 'filesystem_write',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  work_context_get: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  work_context_set: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  memory_retrieval: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  memory_save: {
    capability: 'memory',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  memory_update: {
    capability: 'memory',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  execute_command: {
    capability: 'command',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'allow'
  },
  install_skill: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  load_skill: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  import_skills: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  unload_skill: {
    capability: 'skill',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  read_skill_file: {
    capability: 'skill',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_create: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_update: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_update_status: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_get_by_id: {
    capability: 'plan',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_get_current_chat: {
    capability: 'plan',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_delete: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plan_step_upsert: {
    capability: 'plan',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  schedule_create: {
    capability: 'schedule',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  schedule_list: {
    capability: 'schedule',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  schedule_cancel: {
    capability: 'schedule',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  schedule_update: {
    capability: 'schedule',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  get_soul: {
    capability: 'soul',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  edit_soul: {
    capability: 'soul',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  reset_soul: {
    capability: 'soul',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  emotion_report: {
    capability: 'emotion',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  list_plugins: {
    capability: 'plugin',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  plugin_install: {
    capability: 'plugin',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  plugin_uninstall: {
    capability: 'plugin',
    riskLevel: 'dangerous',
    mutatesWorkspace: true,
    subagent: 'deny'
  },
  telegram_setup_tool: {
    capability: 'telegram',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  user_info_get: {
    capability: 'user_info',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  user_info_set: {
    capability: 'user_info',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  activity_journal_append: {
    capability: 'journal',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  activity_journal_list: {
    capability: 'journal',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  activity_journal_search: {
    capability: 'journal',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'allow'
  },
  log_search: {
    capability: 'log',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  subagent_spawn: {
    capability: 'subagent',
    riskLevel: 'warning',
    mutatesWorkspace: false,
    subagent: 'deny'
  },
  subagent_wait: {
    capability: 'subagent',
    riskLevel: 'none',
    mutatesWorkspace: false,
    subagent: 'deny'
  }
}
