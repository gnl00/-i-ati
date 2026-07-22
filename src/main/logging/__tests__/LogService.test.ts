import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const destinations: Array<{ dest: string; flushSync: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }> = []
  const loggers: Array<{
    destination: { dest: string }
    debug: ReturnType<typeof vi.fn>
    info: ReturnType<typeof vi.fn>
    warn: ReturnType<typeof vi.fn>
    error: ReturnType<typeof vi.fn>
  }> = []

  const destination = vi.fn(({ dest }: { dest: string }) => {
    const stream = {
      dest,
      flushSync: vi.fn(),
      end: vi.fn()
    }
    destinations.push(stream)
    return stream
  })

  const pino = vi.fn((_options: unknown, stream: { dest: string }) => {
    const logger = {
      destination: stream,
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    loggers.push(logger)
    return logger
  })

  return {
    destinations,
    loggers,
    destination,
    pino,
    compressAndCleanup: vi.fn().mockResolvedValue(undefined)
  }
})

vi.mock('electron', () => ({
  app: {
    isReady: vi.fn(() => true),
    getPath: vi.fn(() => '/tmp/ati-log-service-test')
  }
}))

vi.mock('pino', () => ({
  default: Object.assign(mocks.pino, { destination: mocks.destination })
}))

vi.mock('../LogFileManager', () => ({
  LogFileManager: class {
    getDateKey(): string {
      return '2026-07-22'
    }

    getLogFilePath(): string {
      return '/logs/app-2026-07-22.log'
    }

    getPerfLogFilePath(): string {
      return '/logs/perf-2026-07-22.log'
    }

    getSchedulerLogFilePath(): string {
      return '/logs/scheduler-2026-07-22.log'
    }

    compressAndCleanup = mocks.compressAndCleanup
  }
}))

import { LogService } from '../LogService'

describe('LogService', () => {
  beforeEach(() => {
    mocks.destinations.length = 0
    mocks.loggers.length = 0
    mocks.destination.mockClear()
    mocks.pino.mockClear()
    mocks.compressAndCleanup.mockClear()
  })

  it('routes scheduler logs exclusively to the scheduler destination at debug level', async () => {
    const service = new LogService()
    await service.initialize()

    service.createSchedulerLogger('SchedulerService').debug('tick.claimed_due_tasks', { count: 0 })

    const appLogger = mocks.loggers.find(logger => logger.destination.dest.includes('/app-'))
    const schedulerLogger = mocks.loggers.find(logger => logger.destination.dest.includes('/scheduler-'))
    const schedulerConfig = mocks.pino.mock.calls.find(([, stream]) => stream.dest.includes('/scheduler-'))?.[0]

    expect(schedulerConfig).toEqual(expect.objectContaining({ level: 'debug' }))
    expect(schedulerLogger?.debug).toHaveBeenCalledWith({
      scope: 'SchedulerService',
      process: 'main',
      msg: 'tick.claimed_due_tasks',
      context: { count: 0 }
    })
    expect(appLogger?.debug).not.toHaveBeenCalled()
  })
})
