import { app } from 'electron'
import { mkdir, realpath, stat } from 'node:fs/promises'
import { inspect, parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { name as applicationName } from '../../../package.json'
import { redactCliText } from '@main/hosts/cli/CliRedaction'

export const TUI_HELP = `ati terminal

  pnpm tui [--workspace <directory>] [--profile-dir <directory>]
           [--resume <session-uuid>] [--model <model-id>] [--account <account-id>]

Uses the configured ati models, tools, skills and MCP servers.
Inside the terminal: /help, /model, /sessions, /new, /quit.
Batch automation remains available through pnpm cli run.`

export async function runTuiApplication(argv = process.argv.slice(2)): Promise<number> {
  let secrets: string[] = []
  const options = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      workspace: { type: 'string' },
      'profile-dir': { type: 'string' },
      resume: { type: 'string' },
      model: { type: 'string' },
      account: { type: 'string' }
    }
  }).values
  if (options.help) {
    process.stdout.write(`${TUI_HELP}\n`)
    return 0
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('TUI requires an interactive terminal. Use pnpm cli run for JSONL automation.')
  const workspace = await realpath(resolve(options.workspace ?? process.cwd()))
  if (!(await stat(workspace)).isDirectory()) throw new Error('Workspace must be a directory.')
  const profile = resolve(
    options['profile-dir'] ?? resolve(app.getPath('appData'), applicationName)
  )
  await mkdir(profile, { recursive: true, mode: 0o700 })
  app.setName(applicationName)
  app.setPath('userData', profile)
  await app.whenReady()

  const originalConsole = { ...console }
  const pending: unknown[][] = []
  let writeLog: ((args: unknown[]) => void) | undefined
  for (const method of ['debug', 'log', 'info', 'warn', 'error'] as const) {
    console[method] = (...args: unknown[]): void => {
      if (writeLog) writeLog(args)
      else if (pending.length < 100) pending.push(args)
    }
  }
  let cleanup: (() => Promise<void>) | undefined
  let stop: (() => Promise<void>) | undefined
  let fatalError: unknown
  const onFatal = (error: unknown): void => {
    fatalError = error
    void closeView?.()
  }
  let closeView: (() => Promise<void>) | undefined
  const onSignal = (): void => {
    void closeView?.()
  }
  try {
    const { logService } = await import('@main/logging/LogService')
    await logService.initialize()
    const { databaseRuntime } = await import('@main/db/runtime')
    cleanup = async (): Promise<void> => {
      try {
        databaseRuntime.close()
      } finally {
        await logService.close()
      }
    }
    await databaseRuntime.initialize()
    const { configDb } = await import('@main/db/config')
    const config = configDb.initConfig()
    secrets = (config.accounts ?? []).map((a) => a.apiKey)
    logService.setAdditionalRedactionSecrets(secrets)
    const logger = logService.createLogger('TUI')
    writeLog = (args): void =>
      logger.info(
        args.map((a): string => (typeof a === 'string' ? a : inspect(a, { depth: 4 }))).join(' ')
      )
    for (const args of pending) writeLog(args)
    pending.length = 0
    const [
      { initializeMainEmbeddedTools },
      { preserveCallerShellPathForCommands },
      { setCommandWorkspaceBasePath },
      { waitForCommandProcessCleanup },
      { mcpRuntimeService },
      { TuiSession },
      { TuiView },
      { SkillService },
      { default: MemoryService },
      { knowledgebaseService }
    ] = await Promise.all([
      import('@main/tools'),
      import('@main/services/shellEnvironment'),
      import('@main/tools/command/CommandProcessor'),
      import('@main/services/command/CommandProcessRunner'),
      import('@main/services/mcpRuntime'),
      import('@main/orchestration/tui/TuiSession'),
      import('@main/hosts/tui/TuiView'),
      import('@main/services/skills/SkillService'),
      import('@main/services/memory/MemoryService'),
      import('@main/services/knowledgebase/KnowledgebaseService')
    ])
    initializeMainEmbeddedTools()
    preserveCallerShellPathForCommands()
    setCommandWorkspaceBasePath(workspace)
    const session = new TuiSession(workspace)
    stop = async (): Promise<void> => {
      await session.close()
      await waitForCommandProcessCleanup()
      mcpRuntimeService.disconnectAll()
    }
    await SkillService.initializeFromConfig(config)
    for (const initialize of [
      (): Promise<void> => MemoryService.initialize(),
      (): Promise<void> => knowledgebaseService.initialize()
    ]) {
      try {
        await initialize()
      } catch (error) {
        logger.warn('Optional service initialization failed', {
          error: String(error)
        })
      }
    }
    for (const [name, server] of Object.entries(configDb.getMcpServerConfig().mcpServers ?? {})) {
      const connected = await mcpRuntimeService.connectServer({
        name,
        ...server
      })
      if (!connected.result) throw new Error(`MCP connection failed: ${name}`)
      session.mcpTools.push(...connected.tools)
    }
    session.initialize(options.resume, options.model, options.account)
    const view = new TuiView(
      session.state,
      {
        submit: (text, mode): Promise<void> => session.submit(text, mode),
        cancel: (): void => session.cancel(),
        close: (): Promise<void> => session.close(),
        newChat: (): void => session.newChat(),
        resume: (id): void => session.resume(id),
        recoverQueue: (): string => session.recoverQueue(),
        models: (): {
          value: string
          label: string
          description: string
          ref: ModelRef
        }[] => session.models(),
        sessions: (): ChatEntity[] => session.sessions(),
        setModel: (ref): void => session.setModel(ref),
        setApproval: (mode): void => session.setApproval(mode),
        answer: (interaction, answer): void => session.answer(interaction, answer)
      },
      workspace
    )
    closeView = (): Promise<void> => view.exit()
    process.on('uncaughtException', onFatal)
    process.on('unhandledRejection', onFatal)
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)
    await view.start()
    if (fatalError) throw fatalError
    process.stdout.write(`\nChat saved: ${session.state.chat?.uuid}\n`)
    return 0
  } catch (error) {
    await closeView?.()
    process.stdout.write(
      `\n${redactCliText(error instanceof Error ? error.message : String(error), secrets)}\n`
    )
    return 1
  } finally {
    process.off('uncaughtException', onFatal)
    process.off('unhandledRejection', onFatal)
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    try {
      await stop?.()
    } finally {
      try {
        await cleanup?.()
      } finally {
        Object.assign(console, originalConsole)
      }
    }
  }
}
