import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  encodeTextFileSnapshot,
  fileVersion,
  publishFile,
  readTextFileSnapshot,
  withFileOperation,
} from '../FileMutationService'

const hooks = vi.hoisted(
  () =>
    ({}) as {
      afterTemporarySync?: () => void | Promise<void>
      beforeLink?: () => void | Promise<void>
      afterRename?: () => void | Promise<void>
      temporaryWriteError?: Error
      renameError?: Error
      statMode?: bigint
      denyWrite?: boolean
      failCleanup?: boolean
    },
)

vi.mock('@main/logging/LogService', () => ({
  createLogger: (): { warn: ReturnType<typeof vi.fn> } => ({ warn: vi.fn() }),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: vi.fn(async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      if (hooks.statMode !== undefined && args[1] !== 'wx') {
        const originalStat = handle.stat.bind(handle)
        vi.spyOn(handle, 'stat').mockImplementation(async (options) => {
          const info = await originalStat(options)
          info.mode = hooks.statMode ?? info.mode
          return info
        })
      }
      if (args[1] === 'wx') {
        if (hooks.temporaryWriteError) {
          vi.spyOn(handle, 'writeFile').mockRejectedValue(
            hooks.temporaryWriteError,
          )
        }
        const sync = handle.sync.bind(handle)
        vi.spyOn(handle, 'sync').mockImplementation(async () => {
          await sync()
          await hooks.afterTemporarySync?.()
        })
      }
      return handle
    }),
    link: vi.fn(async (...args: Parameters<typeof actual.link>) => {
      await hooks.beforeLink?.()
      await actual.link(...args)
    }),
    rename: vi.fn(async (...args: Parameters<typeof actual.rename>) => {
      if (hooks.renameError) throw hooks.renameError
      await actual.rename(...args)
      await hooks.afterRename?.()
    }),
    access: vi.fn(async (...args: Parameters<typeof actual.access>) => {
      if (hooks.denyWrite)
        throw Object.assign(new Error('Access denied'), { code: 'EACCES' })
      await actual.access(...args)
    }),
    rm: vi.fn(async (...args: Parameters<typeof actual.rm>) => {
      if (hooks.failCleanup)
        throw Object.assign(new Error('Cleanup denied'), { code: 'EACCES' })
      await actual.rm(...args)
    }),
  }
})

let directory: string
let path: string

beforeEach(async () => {
  directory = await fs.mkdtemp(join(tmpdir(), 'ati-file-mutation-'))
  path = join(directory, 'sample.txt')
})

afterEach(async () => {
  for (const key of Object.keys(hooks) as (keyof typeof hooks)[])
    delete hooks[key]
  await fs.rm(directory, { recursive: true, force: true })
  vi.clearAllMocks()
})

async function writeOriginal(text = 'original'): Promise<string> {
  await fs.writeFile(path, text)
  return fileVersion(Buffer.from(text))
}

async function expectNoTemporaryFiles(): Promise<void> {
  expect(
    (await fs.readdir(directory)).filter((name) => name.startsWith('.ati-')),
  ).toEqual([])
}

describe('text snapshots', () => {
  it('hashes the original bytes and restores BOM and CRLF after editing the LF view', async () => {
    const original = Buffer.from('\ufeffalpha\r\nbeta\r\n')
    await fs.writeFile(path, original)
    const snapshot = await readTextFileSnapshot(path)

    expect(snapshot).toMatchObject({
      bytes: original,
      version: fileVersion(original),
      text: 'alpha\nbeta\n',
      hasBom: true,
      lineEnding: 'crlf',
      nlink: 1,
    })
    expect(encodeTextFileSnapshot(snapshot, 'alpha\ngamma\n')).toEqual(
      Buffer.from('\ufeffalpha\r\ngamma\r\n'),
    )
  })

  it.each([
    ['alpha\nbeta', 'lf'],
    ['alpha\r\nbeta\ngamma', 'mixed'],
    ['alpha\rbeta', 'mixed'],
    ['', 'none'],
    ['🌱', 'none'],
  ] as const)(
    'round trips %j without changing its bytes',
    async (text, lineEnding) => {
      await fs.writeFile(path, text)
      const snapshot = await readTextFileSnapshot(path)
      expect(snapshot.lineEnding).toBe(lineEnding)
      expect(encodeTextFileSnapshot(snapshot, snapshot.text)).toEqual(
        Buffer.from(text),
      )
    },
  )

  it.each([
    [Buffer.from([0xff]), 'FILE_ENCODING_UNSUPPORTED'],
    [Buffer.from('alpha\0beta'), 'FILE_BINARY_UNSUPPORTED'],
  ])('rejects unsupported text bytes', async (bytes, code) => {
    await fs.writeFile(path, bytes)
    await expect(readTextFileSnapshot(path)).rejects.toMatchObject({ code })
  })

  it.each(['\ud800', '\udc00', 'alpha\ud800beta', 'alpha\0beta'])(
    'rejects invalid replacement text %j',
    async (text) => {
      await writeOriginal()
      const snapshot = await readTextFileSnapshot(path)
      expect(() => encodeTextFileSnapshot(snapshot, text)).toThrow(
        'Text must not contain',
      )
    },
  )

  it('refuses directories and unresolved leaf symlinks', async () => {
    await expect(readTextFileSnapshot(directory)).rejects.toMatchObject({
      code: 'FILE_NOT_REGULAR',
    })
    await writeOriginal()
    const alias = join(directory, 'alias.txt')
    await fs.symlink(path, alias)
    await expect(readTextFileSnapshot(alias)).rejects.toMatchObject({
      code: 'FILE_NOT_REGULAR',
    })
  })

  it('requires LF replacement input for the normalized CRLF view', () => {
    expect(() =>
      encodeTextFileSnapshot(
        { hasBom: false, lineEnding: 'crlf' },
        'alpha\r\nbeta',
      ),
    ).toThrow('Use LF line endings')
  })

  it('rejects a leading BOM in replacement input and leaves the original BOM file unchanged', async () => {
    const original = Buffer.from('\ufefforiginal')
    await fs.writeFile(path, original)
    const snapshot = await readTextFileSnapshot(path)
    expect(() => encodeTextFileSnapshot(snapshot, '\ufeffchanged')).toThrow(
      'Text input must omit a leading BOM',
    )
    expect(await fs.readFile(path)).toEqual(original)
  })
})

describe('file publication', () => {
  it('replaces matching bytes, preserves executable permissions and returns the new version', async () => {
    const expectedVersion = await writeOriginal()
    await fs.chmod(path, 0o751)
    const bytes = Buffer.from('changed 🌱')
    const result = await withFileOperation(() =>
      publishFile({ path, bytes, expectedVersion }),
    )

    expect(result).toEqual({
      version: fileVersion(bytes),
      bytesWritten: bytes.length,
    })
    expect(await fs.readFile(path)).toEqual(bytes)
    expect((await fs.stat(path)).mode & 0o777).toBe(0o751)
    await expectNoTemporaryFiles()
  })

  it('creates an absent file without exposing a partial result', async () => {
    const bytes = Buffer.from('new content')
    await withFileOperation(() =>
      publishFile({ path, bytes, expectedVersion: null }),
    )
    expect(await fs.readFile(path)).toEqual(bytes)
    expect((await fs.stat(path)).nlink).toBe(1)
    await expectNoTemporaryFiles()
  })

  it.each([
    [null, 'FILE_ALREADY_EXISTS'],
    [fileVersion(Buffer.from('stale')), 'FILE_STALE_VERSION'],
    ['invalid', 'FILE_VERSION_INVALID'],
  ])(
    'preserves the file when a version guard fails',
    async (expectedVersion, code) => {
      await writeOriginal()
      await expect(
        publishFile({ path, bytes: Buffer.from('changed'), expectedVersion }),
      ).rejects.toMatchObject({ code })
      expect(await fs.readFile(path, 'utf8')).toBe('original')
      await expectNoTemporaryFiles()
    },
  )

  it('rejects hard-linked files without splitting their shared contents', async () => {
    const expectedVersion = await writeOriginal()
    const alias = join(directory, 'alias.txt')
    await fs.link(path, alias)
    await expect(
      publishFile({ path, bytes: Buffer.from('changed'), expectedVersion }),
    ).rejects.toMatchObject({ code: 'FILE_HARDLINK_UNSUPPORTED' })
    expect(await fs.readFile(path, 'utf8')).toBe('original')
    expect(await fs.readFile(alias, 'utf8')).toBe('original')
  })

  it('checks write access even when the parent directory permits rename', async () => {
    const expectedVersion = await writeOriginal()
    hooks.denyWrite = true
    await expect(
      publishFile({ path, bytes: Buffer.from('changed'), expectedVersion }),
    ).rejects.toMatchObject({ code: 'EACCES' })
    expect(await fs.readFile(path, 'utf8')).toBe('original')
  })

  it('refuses special permission bits without replacing the file', async () => {
    const expectedVersion = await writeOriginal()
    hooks.statMode = 0o104755n
    await expect(
      publishFile({ path, bytes: Buffer.from('changed'), expectedVersion }),
    ).rejects.toMatchObject({ code: 'FILE_METADATA_UNSUPPORTED' })
    expect(await fs.readFile(path, 'utf8')).toBe('original')
  })

  it('preserves an external update discovered immediately before publication', async () => {
    const expectedVersion = await writeOriginal()
    hooks.afterTemporarySync = (): Promise<void> =>
      fs.writeFile(path, 'external update')
    await expect(
      publishFile({ path, bytes: Buffer.from('changed'), expectedVersion }),
    ).rejects.toMatchObject({ code: 'FILE_STALE_VERSION' })
    expect(await fs.readFile(path, 'utf8')).toBe('external update')
    await expectNoTemporaryFiles()
  })

  it('preserves external permission changes made while the replacement is being staged', async () => {
    const expectedVersion = await writeOriginal()
    await fs.chmod(path, 0o751)
    hooks.afterTemporarySync = (): Promise<void> => fs.chmod(path, 0o600)
    await expect(
      publishFile({ path, bytes: Buffer.from('changed'), expectedVersion }),
    ).rejects.toMatchObject({ code: 'FILE_STALE_VERSION' })
    expect(await fs.readFile(path, 'utf8')).toBe('original')
    expect((await fs.stat(path)).mode & 0o777).toBe(0o600)
    await expectNoTemporaryFiles()
  })

  it('preserves a file created after the final absence check', async () => {
    hooks.beforeLink = (): Promise<void> =>
      fs.writeFile(path, 'external creation')
    await expect(
      publishFile({
        path,
        bytes: Buffer.from('changed'),
        expectedVersion: null,
      }),
    ).rejects.toMatchObject({ code: 'FILE_ALREADY_EXISTS' })
    expect(await fs.readFile(path, 'utf8')).toBe('external creation')
    await expectNoTemporaryFiles()
  })

  it('preserves the original and removes staging files after a staging write fails', async () => {
    const expectedVersion = await writeOriginal()
    hooks.temporaryWriteError = Object.assign(new Error('Disk full'), {
      code: 'ENOSPC',
    })
    await expect(
      publishFile({ path, bytes: Buffer.from('changed'), expectedVersion }),
    ).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(await fs.readFile(path, 'utf8')).toBe('original')
    await expectNoTemporaryFiles()
  })

  it('preserves the original and removes staging files when publication fails', async () => {
    const expectedVersion = await writeOriginal()
    hooks.renameError = Object.assign(new Error('Rename failed'), {
      code: 'EIO',
    })
    await expect(
      publishFile({ path, bytes: Buffer.from('changed'), expectedVersion }),
    ).rejects.toMatchObject({ code: 'EIO' })
    expect(await fs.readFile(path, 'utf8')).toBe('original')
    await expectNoTemporaryFiles()
  })

  it.each([undefined, 'stop', new Error('stop')])(
    'normalizes cancellation before publication and preserves the original',
    async (reason) => {
      const expectedVersion = await writeOriginal()
      const controller = new AbortController()
      hooks.afterTemporarySync = (): void => controller.abort(reason)
      await expect(
        publishFile({
          path,
          bytes: Buffer.from('changed'),
          expectedVersion,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(await fs.readFile(path, 'utf8')).toBe('original')
      await expectNoTemporaryFiles()
    },
  )

  it('reports a committed replacement as successful when cancellation arrives after rename', async () => {
    const expectedVersion = await writeOriginal()
    const controller = new AbortController()
    hooks.afterRename = (): void => controller.abort()
    const bytes = Buffer.from('changed')
    await expect(
      publishFile({ path, bytes, expectedVersion, signal: controller.signal }),
    ).resolves.toEqual({
      version: fileVersion(bytes),
      bytesWritten: bytes.length,
    })
    expect(await fs.readFile(path)).toEqual(bytes)
  })

  it('reports successful creation when staging cleanup fails after commit', async () => {
    hooks.failCleanup = true
    const bytes = Buffer.from('changed')
    await expect(
      publishFile({ path, bytes, expectedVersion: null }),
    ).resolves.toEqual({
      version: fileVersion(bytes),
      bytesWritten: bytes.length,
    })
    expect(await fs.readFile(path)).toEqual(bytes)
  })

  it('serializes competing revisions so the stale writer cannot overwrite the winner', async () => {
    const expectedVersion = await writeOriginal()
    const winner = withFileOperation(() =>
      publishFile({ path, bytes: Buffer.from('winner'), expectedVersion }),
    )
    const stale = withFileOperation(() =>
      publishFile({ path, bytes: Buffer.from('stale'), expectedVersion }),
    )
    await expect(winner).resolves.toMatchObject({
      version: fileVersion(Buffer.from('winner')),
    })
    await expect(stale).rejects.toMatchObject({ code: 'FILE_STALE_VERSION' })
    expect(await fs.readFile(path, 'utf8')).toBe('winner')
  })
})

describe('operation queue', () => {
  it('normalizes a cancellation reason thrown by an active operation', async () => {
    const controller = new AbortController()
    await expect(
      withFileOperation(async () => {
        controller.abort('stop')
        controller.signal.throwIfAborted()
      }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError', message: 'stop' })
    await expect(withFileOperation(async () => 'available')).resolves.toBe(
      'available',
    )
  })

  it('releases the queue after an operation rejects', async () => {
    await expect(
      withFileOperation(async () => {
        throw new Error('failed')
      }),
    ).rejects.toThrow('failed')
    await expect(withFileOperation(async () => 'available')).resolves.toBe(
      'available',
    )
  })

  it.each([undefined, 'stop', new Error('stop')])(
    'normalizes queued cancellation while keeping later work behind the active operation',
    async (reason) => {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const order: string[] = []
      const active = withFileOperation(async () => {
        order.push('active')
        await gate
      })
      const controller = new AbortController()
      const cancelled = withFileOperation(async () => {
        order.push('cancelled')
      }, controller.signal)
      const next = withFileOperation(async () => {
        order.push('next')
      })
      controller.abort(reason)
      await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
      expect(order).toEqual(['active'])
      release()
      await Promise.all([active, next])
      expect(order).toEqual(['active', 'next'])
    },
  )

  it('preserves an existing AbortError reason for a pre-cancelled operation', async () => {
    const controller = new AbortController()
    const reason = new DOMException('Stopped', 'AbortError')
    controller.abort(reason)
    await expect(
      withFileOperation(async () => 'unused', controller.signal),
    ).rejects.toBe(reason)
  })
})
