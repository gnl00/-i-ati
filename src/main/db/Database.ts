import { app } from 'electron'
import path from 'path'
import * as fs from 'fs'
import Database from 'better-sqlite3'

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

    this.createTables()
    this.ensureChatWorkspacePathColumn()
    this.createIndexes()

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

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        msg_count INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        workspace_path TEXT,
        create_time INTEGER NOT NULL,
        update_time INTEGER NOT NULL
      )
    `)

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
      CREATE TABLE IF NOT EXISTS provider_definitions (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        adapter_type TEXT NOT NULL,
        api_version TEXT,
        icon_key TEXT,
        default_api_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

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
        enabled INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, model_id)
      )
    `)

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
        compression_ratio REAL,
        compressed_at INTEGER NOT NULL,
        compression_model TEXT,
        compression_version INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_submit_events (
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
        icon TEXT,
        description TEXT,
        model_account_id TEXT NOT NULL,
        model_model_id TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_built_in INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0
      )
    `)

    console.log('[Database] Tables created')
  }

  private createIndexes(): void {
    if (!this.db) throw new Error('Database not initialized')

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chats_uuid ON chats(uuid);
      CREATE INDEX IF NOT EXISTS idx_chats_update_time ON chats(update_time DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_uuid ON messages(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_chat_id ON compressed_summaries(chat_id);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_chat_uuid ON compressed_summaries(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_status_chat ON compressed_summaries(status, chat_id);
      CREATE INDEX IF NOT EXISTS idx_compressed_summaries_message_range ON compressed_summaries(chat_id, start_message_id, end_message_id);
      CREATE INDEX IF NOT EXISTS idx_chat_submit_events_submission ON chat_submit_events(submission_id);
      CREATE INDEX IF NOT EXISTS idx_chat_submit_events_chat_id ON chat_submit_events(chat_id);
      CREATE INDEX IF NOT EXISTS idx_chat_submit_events_chat_uuid ON chat_submit_events(chat_uuid);
      CREATE INDEX IF NOT EXISTS idx_chat_submit_events_timestamp ON chat_submit_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_assistants_is_built_in ON assistants(is_built_in);
      CREATE INDEX IF NOT EXISTS idx_assistants_is_default ON assistants(is_default);
      CREATE INDEX IF NOT EXISTS idx_chat_skills_chat_id ON chat_skills(chat_id);
      CREATE INDEX IF NOT EXISTS idx_chat_skills_skill_name ON chat_skills(skill_name);
      CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider_id ON provider_accounts(provider_id);
      CREATE INDEX IF NOT EXISTS idx_provider_models_account_id ON provider_models(account_id);
    `)

    console.log('[Database] Indexes created')
  }

  private ensureChatWorkspacePathColumn(): void {
    if (!this.db) throw new Error('Database not initialized')

    const columns = this.db.prepare(`PRAGMA table_info(chats)`).all() as { name: string }[]
    const hasWorkspacePath = columns.some(column => column.name === 'workspace_path')

    if (!hasWorkspacePath) {
      this.db.exec(`ALTER TABLE chats ADD COLUMN workspace_path TEXT`)
      console.log('[Database] Migrated chats table: added workspace_path')
    }
  }
}

export { AppDatabase }
