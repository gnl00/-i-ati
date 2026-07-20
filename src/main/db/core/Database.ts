import { app } from 'electron'
import path from 'path'
import * as fs from 'fs'
import Database from 'better-sqlite3'
import { SMART_MESSAGE_TTL_MS } from '@shared/constants/smartMessages'

const LEGACY_SMART_MESSAGE_TTL_MS = 48 * 60 * 60 * 1000

function bootstrapKnowledgebaseDb(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledgebase_documents (
      id TEXT PRIMARY KEY,
      folder_path TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      ext TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      last_indexed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_knowledgebase_documents_folder_path
      ON knowledgebase_documents(folder_path);
    CREATE INDEX IF NOT EXISTS idx_knowledgebase_documents_status
      ON knowledgebase_documents(status);

    CREATE TABLE IF NOT EXISTS knowledgebase_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      char_start INTEGER NOT NULL,
      char_end INTEGER NOT NULL,
      token_estimate INTEGER NOT NULL,
      chunk_hash TEXT NOT NULL,
      metadata_json TEXT,
      FOREIGN KEY(document_id) REFERENCES knowledgebase_documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledgebase_chunks_document_id
      ON knowledgebase_chunks(document_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS vec_knowledgebase_chunks USING vec0(
      chunk_id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    );

    CREATE TABLE IF NOT EXISTS knowledgebase_embedding_cache (
      cache_key TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      strategy_version TEXT NOT NULL,
      chunk_hash TEXT NOT NULL,
      embedding BLOB NOT NULL,
      dimensions INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_knowledgebase_embedding_cache_chunk_hash
      ON knowledgebase_embedding_cache(chunk_hash);
    CREATE INDEX IF NOT EXISTS idx_knowledgebase_embedding_cache_last_used_at
      ON knowledgebase_embedding_cache(last_used_at);
  `)
}

class AppDatabase {
  private static instance: AppDatabase
  private db: Database.Database | null = null
  private dbPath: string
  private initialized = false

  private constructor() {
    const userDataPath = app.getPath('userData')
    this.dbPath = path.join(userDataPath, 'chat.db')
    console.log('[Database] Database path:', this.dbPath)
  }

  static getInstance(): AppDatabase {
    if (!AppDatabase.instance) {
      AppDatabase.instance = new AppDatabase()
    }
    return AppDatabase.instance
  }

  initialize(): Database.Database {
    if (this.initialized && this.db) {
      return this.db
    }

    if (!fs.existsSync(path.dirname(this.dbPath))) {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    }

    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('trusted_schema = OFF')

    this.createTables()
    this.createIndexes()
    this.migrateSmartMessageTtl()

    this.initialized = true
    return this.db
  }

  getDb(): Database.Database {
    if (!this.db) {
      return this.initialize()
    }
    return this.db
  }

  isReady(): boolean {
    return this.initialized
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.initialized = false
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.createChatsTable()

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        skill_name TEXT NOT NULL,
        load_order INTEGER NOT NULL,
        loaded_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        chat_uuid TEXT,
        body TEXT NOT NULL,
        tokens INTEGER,
        token_usage TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)
    this.ensureColumn('messages', 'token_usage', 'TEXT')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_result_compactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        tool_call_id TEXT,
        level TEXT NOT NULL CHECK (level IN ('balanced', 'minimal')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed')),
        content TEXT,
        original_hash TEXT NOT NULL,
        original_characters INTEGER,
        compacted_characters INTEGER,
        estimated_tokens INTEGER,
        execution_type TEXT CHECK (execution_type IN ('model', 'deterministic')),
        model_id TEXT,
        prompt_version TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        latency_ms INTEGER,
        input_characters INTEGER,
        sent_characters INTEGER,
        input_truncated INTEGER,
        redaction_count INTEGER,
        compactor_id TEXT NOT NULL,
        compactor_version INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        UNIQUE (
          message_id,
          level,
          compactor_id,
          compactor_version,
          original_hash
        )
      )
    `)
    this.ensureColumn(
      'tool_result_compactions',
      'execution_type',
      "TEXT CHECK (execution_type IN ('model', 'deterministic'))"
    )
    this.ensureColumn('tool_result_compactions', 'model_id', 'TEXT')
    this.ensureColumn('tool_result_compactions', 'prompt_version', 'TEXT')
    this.ensureColumn('tool_result_compactions', 'prompt_tokens', 'INTEGER')
    this.ensureColumn('tool_result_compactions', 'completion_tokens', 'INTEGER')
    this.ensureColumn('tool_result_compactions', 'latency_ms', 'INTEGER')
    this.ensureColumn('tool_result_compactions', 'input_characters', 'INTEGER')
    this.ensureColumn('tool_result_compactions', 'sent_characters', 'INTEGER')
    this.ensureColumn('tool_result_compactions', 'input_truncated', 'INTEGER')
    this.ensureColumn('tool_result_compactions', 'redaction_count', 'INTEGER')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_search_documents (
        message_id INTEGER PRIMARY KEY,
        chat_id INTEGER,
        chat_uuid TEXT,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        created_at INTEGER NOT NULL,
        searchable_text TEXT NOT NULL,
        searchable_text_folded TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS message_search_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS message_search_fts USING fts5(
        searchable_text,
        content='message_search_documents',
        content_rowid='message_id',
        tokenize='trigram'
      );
    `)
    this.ensureColumn(
      'message_search_documents',
      'searchable_text_folded',
      "TEXT NOT NULL DEFAULT ''"
    )

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_emotion_state (
        scope TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (scope = 'app')
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS work_contexts (
        chat_id INTEGER PRIMARY KEY,
        chat_uuid TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_host_bindings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        host_type TEXT NOT NULL,
        host_chat_id TEXT NOT NULL,
        host_thread_id TEXT,
        host_user_id TEXT,
        chat_id INTEGER NOT NULL,
        chat_uuid TEXT NOT NULL,
        last_host_message_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        version INTEGER,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        name TEXT PRIMARY KEY,
        config_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        plugin_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        version TEXT,
        manifest_path TEXT,
        install_root TEXT,
        status TEXT NOT NULL DEFAULT 'installed',
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plugin_capabilities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id TEXT NOT NULL,
        capability_kind TEXT NOT NULL,
        capability_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (plugin_id) REFERENCES plugins(plugin_id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plugin_settings (
        plugin_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (plugin_id, key),
        FOREIGN KEY (plugin_id) REFERENCES plugins(plugin_id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_definitions (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        adapter_plugin_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        icon_key TEXT,
        default_api_url TEXT,
        payload_extensions TEXT,
        request_overrides TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.ensureColumn('provider_definitions', 'enabled', 'INTEGER NOT NULL DEFAULT 1')
    this.ensureColumn('provider_definitions', 'payload_extensions', 'TEXT')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_accounts (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        label TEXT NOT NULL,
        api_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_models (
        account_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        modalities_json TEXT,
        capabilities_json TEXT,
        context_window_tokens INTEGER,
        enabled INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, model_id)
      )
    `)

    this.ensureColumn('provider_models', 'modalities_json', 'TEXT')
    this.ensureColumn('provider_models', 'capabilities_json', 'TEXT')
    this.ensureColumn('provider_models', 'context_window_tokens', 'INTEGER')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS compressed_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        chat_uuid TEXT NOT NULL,
        message_ids TEXT NOT NULL,
        start_message_id INTEGER NOT NULL,
        end_message_id INTEGER NOT NULL,
        summary TEXT NOT NULL,
        original_token_count INTEGER,
        summary_token_count INTEGER,
        used_token_count_at_compression INTEGER,
        compression_ratio REAL,
        compressed_at INTEGER NOT NULL,
        compression_model TEXT,
        compression_version INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)
    this.ensureColumn('compressed_summaries', 'used_token_count_at_compression', 'INTEGER')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS smart_messages (
        id TEXT PRIMARY KEY,
        chat_id INTEGER,
        chat_uuid TEXT,
        source_summary_ids TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        action_prompt TEXT NOT NULL,
        reason TEXT,
        priority_score REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        generated_at INTEGER NOT NULL,
        expires_at INTEGER,
        model_id TEXT,
        generation_version INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_run_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id TEXT NOT NULL,
        chat_id INTEGER,
        chat_uuid TEXT,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        payload TEXT,
        meta TEXT,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assistants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        model_account_id TEXT NOT NULL,
        model_model_id TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        sort_index INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_built_in INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_plans (
        id TEXT PRIMARY KEY,
        chat_uuid TEXT,
        goal TEXT NOT NULL,
        context TEXT,
        constraints TEXT,
        status TEXT NOT NULL,
        current_step_id TEXT,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_plan_steps (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        depends_on TEXT,
        tool TEXT,
        input TEXT,
        output TEXT,
        error TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES task_plans(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        chat_uuid TEXT NOT NULL,
        plan_id TEXT,
        goal TEXT NOT NULL,
        run_at INTEGER NOT NULL,
        timezone TEXT,
        status TEXT NOT NULL,
        payload TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        last_error TEXT,
        result_message_id INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (plan_id) REFERENCES task_plans(id) ON DELETE SET NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        chat_uuid TEXT,
        title TEXT NOT NULL,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT,
        tags_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        completed_at INTEGER,
        deleted_at INTEGER
      )
    `)

    this.ensureChatsTableSchema()

    console.log('[Database] Tables created')
  }

  private createIndexes(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chats_uuid ON chats(uuid);
      CREATE INDEX IF NOT EXISTS idx_chats_update_time ON chats(update_time DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_uuid ON messages(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_tool_result_compactions_lookup
        ON tool_result_compactions(message_id, level, status);
      CREATE INDEX IF NOT EXISTS idx_tool_result_compactions_jobs
        ON tool_result_compactions(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_message_search_documents_chat_id_created_at
        ON message_search_documents(chat_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_message_search_documents_chat_uuid_created_at
        ON message_search_documents(chat_uuid, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_message_search_documents_created_at
        ON message_search_documents(created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_host_bindings_unique
        ON chat_host_bindings(host_type, host_chat_id, host_thread_id);
      CREATE INDEX IF NOT EXISTS idx_chat_host_bindings_chat_uuid
        ON chat_host_bindings(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_chat_host_bindings_host_user_id
        ON chat_host_bindings(host_user_id);
      CREATE INDEX IF NOT EXISTS idx_mcp_servers_updated_at ON mcp_servers(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_plugins_source ON plugins(source);
      CREATE INDEX IF NOT EXISTS idx_plugins_enabled ON plugins(enabled);
      CREATE INDEX IF NOT EXISTS idx_plugin_capabilities_plugin_id ON plugin_capabilities(plugin_id);
      CREATE INDEX IF NOT EXISTS idx_plugin_capabilities_kind ON plugin_capabilities(capability_kind);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_chat_id ON compressed_summaries(chat_id);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_chat_uuid ON compressed_summaries(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_status_chat ON compressed_summaries(status, chat_id);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_message_range ON compressed_summaries(chat_id, start_message_id, end_message_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_smart_messages_source_hash ON smart_messages(source_hash, generation_version);
      CREATE INDEX IF NOT EXISTS idx_smart_messages_status_priority ON smart_messages(status, priority_score DESC, generated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_smart_messages_chat_uuid ON smart_messages(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_chat_run_events_submission ON chat_run_events(submission_id);
      CREATE INDEX IF NOT EXISTS idx_chat_run_events_chat_id ON chat_run_events(chat_id);
      CREATE INDEX IF NOT EXISTS idx_chat_run_events_chat_uuid ON chat_run_events(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_chat_run_events_timestamp ON chat_run_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_assistants_is_built_in ON assistants(is_built_in);
      CREATE INDEX IF NOT EXISTS idx_assistants_is_default ON assistants(is_default);
      CREATE INDEX IF NOT EXISTS idx_assistants_order ON assistants(sort_index ASC, updated_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_skills_chat_skill_unique ON chat_skills(chat_id, skill_name);
      CREATE INDEX IF NOT EXISTS idx_chat_skills_chat_id ON chat_skills(chat_id);
      CREATE INDEX IF NOT EXISTS idx_chat_skills_skill_name ON chat_skills(skill_name);
      CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider_id ON provider_accounts(provider_id);
      CREATE INDEX IF NOT EXISTS idx_provider_models_account_id ON provider_models(account_id);
      CREATE INDEX IF NOT EXISTS idx_task_plans_chat_uuid ON task_plans(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_task_plans_status ON task_plans(status);
      CREATE INDEX IF NOT EXISTS idx_task_plan_steps_plan_id ON task_plan_steps(plan_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_chat_uuid ON scheduled_tasks(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_status_run_at ON scheduled_tasks(status, run_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_run_at ON scheduled_tasks(run_at);
      CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_plan_id ON scheduled_tasks(plan_id);
      CREATE INDEX IF NOT EXISTS idx_todos_chat_uuid ON todos(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_todos_status_updated_at ON todos(status, updated_at DESC);
    `)

    console.log('[Database] Indexes created')
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    if (!this.db) throw new Error('Database not initialized')

    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
    if (columns.some(column => column.name === columnName)) {
      return
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }

  private migrateSmartMessageTtl(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.db.prepare(`
      UPDATE smart_messages
      SET expires_at = generated_at + ?
      WHERE expires_at = generated_at + ?
    `).run(SMART_MESSAGE_TTL_MS, LEGACY_SMART_MESSAGE_TTL_MS)
  }

  private createChatsTable(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        msg_count INTEGER NOT NULL DEFAULT 0,
        model_account_id TEXT,
        model_model_id TEXT,
        workspace_path TEXT,
        user_instruction TEXT,
        permission_approval_mode TEXT DEFAULT 'manual',
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `)
  }

  private ensureChatsTableSchema(): void {
    if (!this.db) throw new Error('Database not initialized')

    const columns = this.db.prepare('PRAGMA table_info(chats)').all() as Array<{ name: string }>
    const columnNames = new Set(columns.map(column => column.name))
    const hasOldModelColumn = columnNames.has('model')
    const hasModelAccountId = columnNames.has('model_account_id')
    const hasModelModelId = columnNames.has('model_model_id')
    const hasPermissionApprovalMode = columnNames.has('permission_approval_mode')

    if (!hasPermissionApprovalMode) {
      this.ensureColumn('chats', 'permission_approval_mode', "TEXT DEFAULT 'manual'")
    }

    if (!hasOldModelColumn && hasModelAccountId && hasModelModelId) {
      return
    }

    if (!hasOldModelColumn) {
      if (!hasModelAccountId) {
        this.ensureColumn('chats', 'model_account_id', 'TEXT')
      }
      if (!hasModelModelId) {
        this.ensureColumn('chats', 'model_model_id', 'TEXT')
      }
      return
    }

    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.exec('ALTER TABLE chats DROP COLUMN model')
      this.ensureColumn('chats', 'model_account_id', 'TEXT')
      this.ensureColumn('chats', 'model_model_id', 'TEXT')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

}

export { AppDatabase, bootstrapKnowledgebaseDb }
