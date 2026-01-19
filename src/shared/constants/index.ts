export const PIN_WINDOW = 'pin-window'
export const SAVE_CONFIG = 'save-config'
export const GET_CONFIG = 'get-config'
export const GET_WINDOW_SIZE = 'get-window-size'
export const OPEN_EXTERNAL = 'open-external'
export const WEB_SEARCH_ACTION = 'web-search-action'
export const WEB_FETCH_ACTION = 'web-fetch-action'
export const TOOL_SEARCH_ACTION = 'tool-search-action'
export const SKILL_LIST_ACTION = 'skill:list'
export const SKILL_GET_ACTION = 'skill:get'
export const SKILL_LOAD_ACTION = 'skill:load'
export const SKILL_UNLOAD_ACTION = 'skill:unload'
export const SKILL_IMPORT_ACTION = 'skill:import-folder'

// Window Operations Actions
export const WIN_CLOSE = 'win-close'
export const WIN_MINIMIZE = 'win-minimize'
export const WIN_MAXIMIZE = 'win-maximize'

// MCP Operations Actions
export const MCP_CONNECT = 'mcp-connect'
export const MCP_DISCONNECT = 'mcp-disconnect'
export const MCP_TOOL_CALL = 'mcp-tool-call'

// File Operations Actions
export const FILE_READ_ACTION = 'file-read-action'
export const FILE_WRITE_ACTION = 'file-write-action'
export const FILE_EDIT_ACTION = 'file-edit-action'
export const FILE_SEARCH_ACTION = 'file-search-action'

// New File Operations Actions
export const FILE_READ_TEXT_ACTION = 'file-read-text-action'
export const FILE_READ_MEDIA_ACTION = 'file-read-media-action'
export const FILE_READ_MULTIPLE_ACTION = 'file-read-multiple-action'
export const FILE_LIST_DIR_ACTION = 'file-list-dir-action'
export const FILE_LIST_DIR_SIZES_ACTION = 'file-list-dir-sizes-action'
export const FILE_DIR_TREE_ACTION = 'file-dir-tree-action'
export const FILE_SEARCH_FILES_ACTION = 'file-search-files-action'
export const FILE_GET_INFO_ACTION = 'file-get-info-action'
export const FILE_LIST_ALLOWED_DIRS_ACTION = 'file-list-allowed-dirs-action'
export const FILE_CREATE_DIR_ACTION = 'file-create-dir-action'
export const FILE_MOVE_ACTION = 'file-move-action'

// DevServer Operations Actions
export const DEV_SERVER_CHECK_PREVIEW_SH = 'dev-server-check-preview-sh'
export const DEV_SERVER_START = 'dev-server-start'
export const DEV_SERVER_STOP = 'dev-server-stop'
export const DEV_SERVER_STATUS = 'dev-server-status'
export const DEV_SERVER_LOGS = 'dev-server-logs'

// Memory & Embedding Operations Actions
export const MEMORY_ADD = 'memory-add'
export const MEMORY_ADD_BATCH = 'memory-add-batch'
export const MEMORY_SEARCH = 'memory-search'
export const MEMORY_GET_CHAT = 'memory-get-chat'
export const MEMORY_DELETE = 'memory-delete'
export const MEMORY_DELETE_CHAT = 'memory-delete-chat'
export const MEMORY_GET_STATS = 'memory-get-stats'
export const MEMORY_CLEAR = 'memory-clear'
export const EMBEDDING_GENERATE = 'embedding-generate'
export const EMBEDDING_GENERATE_BATCH = 'embedding-generate-batch'
export const EMBEDDING_GET_MODEL_INFO = 'embedding-get-model-info'

// Memory Tools Actions
export const MEMORY_RETRIEVAL_ACTION = 'memory-retrieval-action'
export const MEMORY_SAVE_ACTION = 'memory-save-action'

// Database Operations - Chat
export const DB_CHAT_SAVE = 'db:chat:save'
export const DB_CHAT_GET_ALL = 'db:chat:get-all'
export const DB_CHAT_GET_BY_ID = 'db:chat:get-by-id'
export const DB_CHAT_UPDATE = 'db:chat:update'
export const DB_CHAT_DELETE = 'db:chat:delete'
export const DB_CHAT_SKILL_ADD = 'db:chat-skill:add'
export const DB_CHAT_SKILL_REMOVE = 'db:chat-skill:remove'
export const DB_CHAT_SKILLS_GET = 'db:chat-skill:get'

// Database Operations - Message
export const DB_MESSAGE_SAVE = 'db:message:save'
export const DB_MESSAGE_GET_ALL = 'db:message:get-all'
export const DB_MESSAGE_GET_BY_ID = 'db:message:get-by-id'
export const DB_MESSAGE_GET_BY_IDS = 'db:message:get-by-ids'
export const DB_MESSAGE_UPDATE = 'db:message:update'
export const DB_MESSAGE_DELETE = 'db:message:delete'

// Database Operations - Config
export const DB_CONFIG_GET = 'db:config:get'
export const DB_CONFIG_SAVE = 'db:config:save'
export const DB_CONFIG_INIT = 'db:config:init'

// Database Operations - Chat Submit Event Trace
export const DB_CHAT_SUBMIT_EVENT_SAVE = 'db:chat-submit-event:save'

// Database Operations - Assistant
export const DB_ASSISTANT_SAVE = 'db:assistant:save'
export const DB_ASSISTANT_GET_ALL = 'db:assistant:get-all'
export const DB_ASSISTANT_GET_BY_ID = 'db:assistant:get-by-id'
export const DB_ASSISTANT_UPDATE = 'db:assistant:update'
export const DB_ASSISTANT_DELETE = 'db:assistant:delete'

// Command Operations Actions
export const COMMAND_EXECUTE_ACTION = 'command-execute-action'

// Chat Submit (Main-driven)
export const CHAT_SUBMIT_SUBMIT = 'chat-submit:submit'
export const CHAT_SUBMIT_CANCEL = 'chat-submit:cancel'
export const CHAT_SUBMIT_EVENT = 'chat-submit:event'
export const CHAT_COMPRESSION_EXECUTE = 'chat-compression:execute'
export const CHAT_TITLE_GENERATE = 'chat-title:generate'
