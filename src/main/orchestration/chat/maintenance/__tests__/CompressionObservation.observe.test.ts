import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MessageCompressionService } from '../MessageCompressionService'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    isReady: vi.fn(() => false)
  },
  shell: {
    openExternal: vi.fn()
  },
  BrowserWindow: vi.fn(),
  session: {},
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  }
}))

vi.mock('@main/main-window', () => ({
  mainWindow: null,
  createWindow: vi.fn(),
  getWinPosition: vi.fn(),
  pinWindow: vi.fn(),
  setWinPosition: vi.fn()
}))

vi.mock('@main/db/plugins', () => ({
  pluginDb: {
    getPluginConfigs: vi.fn(() => []),
    getPlugins: vi.fn(() => []),
    savePluginConfigs: vi.fn()
  }
}))

vi.mock('@main/request/index', () => ({
  unifiedChatRequest: vi.fn(async (request: IUnifiedRequest): Promise<IUnifiedResponse> => {
    const response = await fetch(`${request.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${request.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map(message => ({
          role: message.role,
          content: message.content
        })),
        stream: false
      })
    })

    const payload = await response.json()
    if (!response.ok) {
      throw new Error(`Observation summary request failed: HTTP ${response.status} ${JSON.stringify(payload)}`)
    }

    return {
      id: payload.id ?? 'observation',
      model: payload.model ?? request.model,
      timestamp: Date.now(),
      content: payload.choices?.[0]?.message?.content ?? '',
      finishReason: payload.choices?.[0]?.finish_reason
    }
  })
}))

type ChatRow = {
  id: number
  uuid: string
  title: string
  model_account_id: string | null
  model_model_id: string | null
  update_time: number
}

type MessageRow = {
  id: number
  chat_id: number | null
  chat_uuid: string | null
  body: string
  tokens: number | null
}

type ConfigRow = {
  value: string
}

type CompressedSummaryRow = {
  id: number
  chat_id: number
  chat_uuid: string
  message_ids: string
  start_message_id: number
  end_message_id: number
  summary: string
  original_token_count: number | null
  summary_token_count: number | null
  used_token_count_at_compression: number | null
  compression_ratio: number | null
  compressed_at: number
  compression_model: string | null
  compression_version: number | null
  status: string | null
}

type ProviderModelConfigRow = {
  account_id: string
  account_label: string
  provider_id: string
  api_url: string
  api_key: string
  model_id: string
  model_label: string
  model_type: ModelType
  context_window_tokens: number | null
  provider_display_name: string
  adapter_plugin_id: string
}

type LegacyProviderConfig = {
  name: string
  apiUrl: string
  apiKey: string
  models?: Array<{
    name?: string
    value?: string
    type?: ModelType
    enable?: boolean
  }>
}

const runObservation = process.env.RUN_COMPRESSION_OBSERVATION === '1'
const observeIt = runObservation ? it : it.skip

const defaultDbPath = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'at-i-app',
  'chat.db'
)

const queryJson = <T>(dbPath: string, sql: string): T[] => {
  const output = execFileSync('/usr/bin/sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  }).trim()

  if (!output) {
    return []
  }

  return JSON.parse(output) as T[]
}

const toMessageEntity = (row: MessageRow, service: MessageCompressionService): MessageEntity => {
  const body = JSON.parse(row.body) as ChatMessage
  const fallbackTokens = service.estimateTokenCount(JSON.stringify(body))

  return {
    id: row.id,
    chatId: row.chat_id ?? undefined,
    chatUuid: row.chat_uuid ?? undefined,
    body,
    tokens: row.tokens ?? fallbackTokens
  }
}

const toCompressedSummaryEntity = (row: CompressedSummaryRow): CompressedSummaryEntity => ({
  id: row.id,
  chatId: row.chat_id,
  chatUuid: row.chat_uuid,
  messageIds: JSON.parse(row.message_ids) as number[],
  startMessageId: row.start_message_id,
  endMessageId: row.end_message_id,
  summary: row.summary,
  originalTokenCount: row.original_token_count ?? undefined,
  summaryTokenCount: row.summary_token_count ?? undefined,
  usedTokenCountAtCompression: row.used_token_count_at_compression ?? undefined,
  compressionRatio: row.compression_ratio ?? undefined,
  compressedAt: row.compressed_at,
  compressionModel: row.compression_model ?? undefined,
  compressionVersion: row.compression_version ?? undefined,
  status: (row.status as CompressedSummaryEntity['status']) ?? 'active'
})

const toProviderModelConfig = (
  row: ProviderModelConfigRow
): {
  account: ProviderAccount
  model: AccountModel
  providerDefinition: ProviderDefinition
} => ({
  account: {
    id: row.account_id,
    providerId: row.provider_id,
    label: row.account_label,
    apiUrl: row.api_url,
    apiKey: row.api_key,
    models: []
  },
  model: {
    id: row.model_id,
    label: row.model_label,
    type: row.model_type,
    contextWindowTokens: row.context_window_tokens ?? 200_000
  },
  providerDefinition: {
    id: row.provider_id,
    displayName: row.provider_display_name,
    adapterPluginId: row.adapter_plugin_id
  }
})

const normalizeLegacyApiUrl = (apiUrl: string): string => {
  const trimmed = apiUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/v1')) {
    return trimmed
  }
  return `${trimmed}/v1`
}

const resolveModelConfigFromProviderTables = (
  dbPath: string,
  chat: ChatRow
): {
  account: ProviderAccount
  model: AccountModel
  providerDefinition: ProviderDefinition
} | undefined => {
  const requestedProviderName = process.env.COMPRESSION_OBSERVATION_PROVIDER_NAME
  const requestedModelId = process.env.COMPRESSION_OBSERVATION_MODEL_ID
  const requestedAccountId = process.env.COMPRESSION_OBSERVATION_ACCOUNT_ID

  const rows = queryJson<ProviderModelConfigRow>(
    dbPath,
    `
      SELECT
        pa.id AS account_id,
        pa.label AS account_label,
        pa.provider_id AS provider_id,
        pa.api_url AS api_url,
        pa.api_key AS api_key,
        pm.model_id AS model_id,
        pm.label AS model_label,
        pm.type AS model_type,
        pm.context_window_tokens AS context_window_tokens,
        pd.display_name AS provider_display_name,
        pd.adapter_plugin_id AS adapter_plugin_id
      FROM provider_accounts pa
      INNER JOIN provider_models pm ON pm.account_id = pa.id
      INNER JOIN provider_definitions pd ON pd.id = pa.provider_id
      WHERE pm.enabled = 1
        AND pd.enabled = 1
        AND pa.api_key != ''
      ORDER BY
        CASE WHEN pa.id = '${requestedAccountId ?? ''}' THEN 0 ELSE 1 END,
        CASE WHEN pd.display_name = '${requestedProviderName ?? ''}' THEN 0 ELSE 1 END,
        CASE WHEN pa.provider_id = '${requestedProviderName?.toLowerCase() ?? ''}' THEN 0 ELSE 1 END,
        CASE WHEN pm.model_id = '${requestedModelId ?? ''}' THEN 0 ELSE 1 END,
        CASE WHEN pa.id = '${chat.model_account_id ?? ''}' THEN 0 ELSE 1 END,
        CASE WHEN pm.model_id = '${chat.model_model_id ?? ''}' THEN 0 ELSE 1 END,
        pa.updated_at DESC
    `
  )

  const row = rows.find(item => (
    (!requestedAccountId || item.account_id === requestedAccountId)
    && (!requestedProviderName || item.provider_display_name === requestedProviderName || item.provider_id === requestedProviderName.toLowerCase())
    && (!requestedModelId || item.model_id === requestedModelId)
  )) ?? rows.find(item => (
    item.account_id === chat.model_account_id
    && item.model_id === chat.model_model_id
  )) ?? rows[0]

  return row ? toProviderModelConfig(row) : undefined
}

const resolveModelConfig = (
  dbPath: string,
  chat: ChatRow,
  config: IAppConfig
): {
  account: ProviderAccount
  model: AccountModel
  providerDefinition: ProviderDefinition
} => {
  const fromProviderTables = resolveModelConfigFromProviderTables(dbPath, chat)
  if (fromProviderTables) {
    return fromProviderTables
  }

  const candidates = [
    config.compression?.compressionModel,
    chat.model_account_id && chat.model_model_id
      ? { accountId: chat.model_account_id, modelId: chat.model_model_id }
      : undefined,
    config.tools?.mainModel
  ].filter((modelRef): modelRef is ModelRef => Boolean(modelRef))

  for (const modelRef of candidates) {
    const account = config.accounts?.find(item => item.id === modelRef.accountId)
    const model = account?.models.find(item => item.id === modelRef.modelId)
    const providerDefinition = account
      ? config.providerDefinitions?.find(item => item.id === account.providerId)
      : undefined

    if (account && model && providerDefinition) {
      return {
        account,
        model: {
          ...model,
          contextWindowTokens: model.contextWindowTokens ?? 200_000
        },
        providerDefinition
      }
    }
  }

  const legacyProviders = ((config as any).providers as LegacyProviderConfig[] | undefined) ?? []
  const requestedProviderName = process.env.COMPRESSION_OBSERVATION_PROVIDER_NAME
  const requestedModelId = process.env.COMPRESSION_OBSERVATION_MODEL_ID
  const legacyProvider = legacyProviders.find(provider =>
    provider.apiKey
    && provider.models?.some(model => model.enable !== false)
    && (!requestedProviderName || provider.name === requestedProviderName)
  )
  const legacyModel = legacyProvider?.models?.find(model =>
    model.enable !== false
    && (!requestedModelId || model.value === requestedModelId)
  )

  if (legacyProvider && legacyModel?.value) {
    return {
      account: {
        id: legacyProvider.name,
        providerId: legacyProvider.name,
        label: legacyProvider.name,
        apiUrl: normalizeLegacyApiUrl(legacyProvider.apiUrl),
        apiKey: legacyProvider.apiKey,
        models: []
      },
      model: {
        id: legacyModel.value,
        label: legacyModel.name ?? legacyModel.value,
        type: legacyModel.type ?? 'llm',
        contextWindowTokens: 200_000
      },
      providerDefinition: {
        id: legacyProvider.name,
        displayName: legacyProvider.name,
        adapterPluginId: 'openai-chat-compatible-adapter'
      }
    }
  }

  throw new Error(`No usable model config found for chat ${chat.uuid}`)
}

describe('Compression observation', () => {
  observeIt('generates summaries for the latest three chats without writing compressed_summaries', async () => {
    const dbPath = process.env.COMPRESSION_OBSERVATION_DB_PATH ?? defaultDbPath
    expect(fs.existsSync(dbPath), `DB not found: ${dbPath}`).toBe(true)

    const service = new MessageCompressionService()

    const configRow = queryJson<ConfigRow>(
      dbPath,
      "SELECT value FROM configs WHERE key = 'appConfig'"
    )[0]
    if (!configRow) {
      throw new Error('appConfig not found')
    }
    const appConfig = JSON.parse(configRow.value) as IAppConfig
    const observationConfig: CompressionConfig = {
      ...(appConfig.compression ?? {}),
      enabled: true,
      autoCompress: false,
      triggerTokenRatio: 0.000001
    }

    const chats = queryJson<ChatRow>(
      dbPath,
      `
        SELECT id, uuid, title, model_account_id, model_model_id, update_time
        FROM chats
        WHERE msg_count > 0
        ORDER BY update_time DESC
        LIMIT 3
      `
    )

    expect(chats.length).toBeGreaterThan(0)

    for (const [index, chat] of chats.entries()) {
      const rows = queryJson<MessageRow>(
        dbPath,
        `
          SELECT id, chat_id, chat_uuid, body, tokens
          FROM messages
          WHERE chat_id = ${chat.id}
          ORDER BY id ASC
        `
      )
      const messages = rows.map(row => toMessageEntity(row, service))
      const summaries = queryJson<CompressedSummaryRow>(
        dbPath,
        `
          SELECT *
          FROM compressed_summaries
          WHERE chat_id = ${chat.id} AND status = 'active'
          ORDER BY compressed_at ASC
        `
      ).map(toCompressedSummaryEntity)
      const { account, model, providerDefinition } = resolveModelConfig(dbPath, chat, appConfig)
      const strategy = service.analyzeCompressionStrategy(
        messages,
        summaries,
        model,
        observationConfig
      )

      console.info([
        '',
        `========== Compression Observation #${index + 1} ==========`,
        `chat: ${chat.title || '(untitled)'}`,
        `chatUuid: ${chat.uuid}`,
        `messages: ${messages.length}`,
        `activeSummaries: ${summaries.length}`,
        `messagesToCompress: ${strategy.messagesToCompress.length}`,
        `messagesToKeep: ${strategy.messagesToKeep.length}`,
        `model: ${account.label} / ${model.id}`
      ].join('\n'))

      const latestSummary = summaries.at(-1)
      if (!strategy.shouldCompress && latestSummary) {
        console.info(`summaryMode: existing_active_summary\nsummary:\n${latestSummary.summary}`)
        continue
      }

      const messagesToCompress = strategy.shouldCompress
        ? messages.filter(message =>
          message.id && strategy.messagesToCompress.includes(message.id)
        )
        : messages
      const summary = await service.generateSummary(
        messagesToCompress,
        model,
        account,
        providerDefinition,
        strategy.shouldCompress ? latestSummary?.summary : undefined
      )

      console.info(`summaryMode: ${strategy.shouldCompress ? 'incremental_compression_preview' : 'full_range_preview'}\nsummary:\n${summary}`)
    }
  }, 180_000)
})
