import { randomUUID } from 'node:crypto'
import { inspect } from 'node:util'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { name as applicationName } from '../../../package.json'
import { app } from 'electron'
import {
  CLI_HELP_TEXT,
  CliInputError,
  parseCliArguments
} from '@main/hosts/cli/CliInputAdapter'
import { redactCliText, redactCliValue } from '@main/hosts/cli/CliRedaction'

let cliSecrets: readonly string[] = []

const writeStderr = (text: string): void => {
  try {
    process.stderr.write(text)
  } catch {
    // The process can be terminating after a broken stderr pipe.
  }
}

const formatConsoleArgument = (value: unknown): string => {
  if (typeof value === 'string') return redactCliText(value, cliSecrets)
  try {
    return inspect(redactCliValue(value, cliSecrets), {
      depth: null,
      colors: false,
      breakLength: Number.POSITIVE_INFINITY,
      compact: true
    })
  } catch {
    return '[UNSERIALIZABLE]'
  }
}

export const installCliConsoleCapture = (): void => {
  const methods = ['debug', 'info', 'log', 'warn', 'error'] as const
  const consoleRecord = console as unknown as Record<string, (...args: unknown[]) => void>
  for (const method of methods) {
    consoleRecord[method] = (...args: unknown[]): void => {
      writeStderr(`${args.map(formatConsoleArgument).join(' ')}\n`)
    }
  }
}

const emitJsonError = async (
  runId: string,
  code: string,
  error: unknown
): Promise<void> => {
  const payload = redactCliValue({
    schemaVersion: 1,
    runId,
    type: 'run.error',
    timestamp: Date.now(),
    payload: {
      code,
      message: error instanceof Error ? error.message : String(error)
    }
  }, cliSecrets)
  try {
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(`${JSON.stringify(payload)}\n`, 'utf8', (writeError?: Error | null) => {
        if (writeError) reject(writeError)
        else resolve()
      })
    })
  } catch {
    writeStderr(`${redactCliText(`${code}: ${error instanceof Error ? error.message : String(error)}`, cliSecrets)}\n`)
  }
}

const isInputError = (error: unknown): error is CliInputError => error instanceof CliInputError

export const runCliApplication = async (): Promise<number> => {
  const runId = randomUUID()

  let parsed
  try {
    parsed = parseCliArguments(process.argv.slice(2))
  } catch (error) {
    await emitJsonError(runId, isInputError(error) ? error.code : 'ARGUMENT_INVALID', error)
    return 2
  }

  if (parsed.kind === 'help') {
    process.stdout.write(`${CLI_HELP_TEXT}\n`)
    return 0
  }

  let prepared
  try {
    // The orchestrator imports only host contracts and file helpers. Runtime
    // and logging modules load in the initialization phase after setPath.
    const { prepareCliRun } = await import('@main/orchestration/cli/CliRunOrchestrator')
    prepared = await prepareCliRun(parsed)
  } catch (error) {
    await emitJsonError(runId, isInputError(error) ? error.code : 'INPUT_INVALID', error)
    return isInputError(error) ? 2 : 1
  }

  cliSecrets = [prepared.modelConfig.apiKey]
  // Tool commands inherit process.env. Keep the credential in the request
  // spec while removing it from child-process environments.
  delete process.env[prepared.modelConfig.apiKeyEnv]

  const abortController = new AbortController()
  let abortKind: 'timeout' | 'SIGINT' | 'SIGTERM' | undefined
  const onSignal = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (abortKind) return
    abortKind = signal
    abortController.abort()
  }
  const onSigint = (): void => onSignal('SIGINT')
  const onSigterm = (): void => onSignal('SIGTERM')
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  const timeoutHandle = setTimeout(() => {
    if (abortKind) return
    abortKind = 'timeout'
    abortController.abort()
  }, prepared.options.timeoutSeconds * 1_000)

  const startedAt = Date.now()
  let chatId: number | undefined
  let databaseReady = false
  let logServiceReady = false
  let disconnectMcp: (() => void) | undefined
  let waitForCommandCleanup: (() => Promise<void>) | undefined
  let exitCode = 1
  try {
    // Direct-file Electron launches otherwise use the default Electron profile.
    const profileDir = prepared.options.profileDir
      ? resolve(prepared.options.profileDir)
      : resolve(app.getPath('appData'), applicationName)
    await mkdir(profileDir, { recursive: true, mode: 0o700 })
    app.setName(applicationName)
    app.setPath('userData', profileDir)
    app.setPath('sessionData', prepared.paths.sessionData)
    await app.whenReady()

    const [
      { logService },
      { databaseRuntime },
      { configDb },
      { chatDb },
      { initializeMainEmbeddedTools },
      { setCommandWorkspaceBasePath },
      { waitForCommandProcessCleanup },
      { preserveCallerShellPathForCommands },
      { mcpRuntimeService },
      { runCliTask }
    ] = await Promise.all([
      import('@main/logging/LogService'),
      import('@main/db/runtime'),
      import('@main/db/config'),
      import('@main/db/chat'),
      import('@main/tools'),
      import('@main/tools/command/CommandProcessor'),
      import('@main/services/command/CommandProcessRunner'),
      import('@main/services/shellEnvironment'),
      import('@main/services/mcpRuntime'),
      import('@main/orchestration/cli/CliRunOrchestrator')
    ])
    disconnectMcp = (): void => mcpRuntimeService.disconnectAll()
    waitForCommandCleanup = waitForCommandProcessCleanup

    logService.setAdditionalRedactionSecrets(cliSecrets)
    await logService.initialize()
    logServiceReady = true
    await databaseRuntime.initialize()
    databaseReady = true
    const appConfig = configDb.initConfig()
    cliSecrets = [...cliSecrets, ...(appConfig.accounts ?? []).map(account => account.apiKey)]
    logService.setAdditionalRedactionSecrets(cliSecrets)
    initializeMainEmbeddedTools()
    preserveCallerShellPathForCommands()
    setCommandWorkspaceBasePath(prepared.workspace)

    const now = Date.now()
    const chatUuid = `cli:${runId}`
    chatId = chatDb.saveChat({
      uuid: chatUuid,
      title: 'CLI run',
      messages: [],
      workspacePath: prepared.workspace,
      permissionApprovalMode: prepared.options.approval === 'auto' ? 'auto' : 'manual',
      createTime: now,
      updateTime: now
    })

    const [{ prepareCliChatProfile }, { SkillService }, { default: MemoryService }, { knowledgebaseService }] = await Promise.all([
      import('@main/orchestration/cli/CliChatProfile'),
      import('@main/services/skills/SkillService'),
      import('@main/services/memory/MemoryService'),
      import('@main/services/knowledgebase/KnowledgebaseService')
    ])
    await SkillService.initializeFromConfig(appConfig)
    for (const initialize of [(): Promise<void> => MemoryService.initialize(), (): Promise<void> => knowledgebaseService.initialize()]) {
      try {
        await initialize()
      } catch (error) {
        writeStderr(`${redactCliText(`CLI optional service initialization failed: ${error instanceof Error ? error.message : String(error)}`, cliSecrets)}\n`)
      }
    }
    const chat = chatDb.getChatById(chatId)!
    const profile = await prepareCliChatProfile(chat, prepared.instruction, prepared.modelConfig)
    exitCode = await runCliTask({
      prepared,
      runId,
      chatUuid,
      profile,
      signal: abortController.signal,
      startedAt,
      getAbortKind: () => abortKind
    })
  } catch (error) {
    await emitJsonError(runId, 'INITIALIZATION_FAILED', error)
    exitCode = 1
  } finally {
    clearTimeout(timeoutHandle)
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)

    try {
      await waitForCommandCleanup?.()
    } catch (error) {
      writeStderr(`${redactCliText(`CLI command cleanup failed: ${error instanceof Error ? error.message : String(error)}`, cliSecrets)}\n`)
      exitCode = 1
    }

    try {
      disconnectMcp?.()
    } catch (error) {
      writeStderr(`${redactCliText(`CLI MCP cleanup failed: ${error instanceof Error ? error.message : String(error)}`, cliSecrets)}\n`)
      exitCode = 1
    }

    if (databaseReady) {
      try {
        const { databaseRuntime } = await import('@main/db/runtime')
        databaseRuntime.close()
      } catch (error) {
        writeStderr(`${redactCliText(`CLI database cleanup failed: ${error instanceof Error ? error.message : String(error)}`, cliSecrets)}\n`)
        exitCode = 1
      }
    }

    if (logServiceReady) {
      try {
        const { logService } = await import('@main/logging/LogService')
        await logService.close()
      } catch (error) {
        writeStderr(`${redactCliText(`CLI log cleanup failed: ${error instanceof Error ? error.message : String(error)}`, cliSecrets)}\n`)
        exitCode = 1
      }
    }
  }

  return exitCode
}
