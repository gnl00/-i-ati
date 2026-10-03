import { createHash, randomUUID } from 'node:crypto'
import { constants, type BigIntStats } from 'node:fs'
import { access, link, lstat, open, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { TextDecoder } from 'node:util'
import { createLogger } from '@main/logging/LogService'

const logger = createLogger('FileMutationService')
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const VERSION_PATTERN = /^sha256:[a-f0-9]{64}$/
let operationTail = Promise.resolve()

export class FileOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'FileOperationError'
  }
}

export interface TextFileSnapshot {
  bytes: Buffer
  version: string
  text: string
  hasBom: boolean
  lineEnding: 'lf' | 'crlf' | 'mixed' | 'none'
  mode: number
  nlink: number
}

function fileOperationAbortError(signal: AbortSignal): Error {
  const reason = signal.reason
  if (reason instanceof Error && reason.name === 'AbortError') return reason
  return new DOMException(
    typeof reason === 'string'
      ? reason
      : reason instanceof Error
        ? reason.message
        : 'File operation was cancelled.',
    'AbortError',
  )
}

function throwIfFileOperationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw fileOperationAbortError(signal)
}

function waitForTurn(
  previous: Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) return previous
  throwIfFileOperationAborted(signal)
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort)
      reject(fileOperationAbortError(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void previous.then(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    })
  })
}

export async function withFileOperation<T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfFileOperationAborted(signal)
  const previous = operationTail
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  // ponytail: one Main-process lock; split only after measuring mutation contention.
  operationTail = previous.then(() => current)
  try {
    await waitForTurn(previous, signal)
    throwIfFileOperationAborted(signal)
    return await operation()
  } catch (error) {
    if (signal?.aborted && error === signal.reason) {
      throw fileOperationAbortError(signal)
    }
    throw error
  } finally {
    release()
  }
}

export function fileVersion(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function assertRegularFile(info: BigIntStats): void {
  if (!info.isFile()) {
    throw new FileOperationError(
      'FILE_NOT_REGULAR',
      'The target must be a regular file.',
    )
  }
}

async function readFileBytes(path: string): Promise<{
  bytes: Buffer
  mode: number
  nlink: number
  uid: number
  gid: number
}> {
  assertRegularFile(await lstat(path, { bigint: true }))
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await handle.stat({ bigint: true })
    assertRegularFile(before)
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      BigInt(bytes.length) !== after.size
    ) {
      throw new FileOperationError(
        'FILE_CHANGED_DURING_READ',
        'The file changed while it was being read. Read it again.',
      )
    }
    return {
      bytes,
      mode: Number(after.mode),
      nlink: Number(after.nlink),
      uid: Number(after.uid),
      gid: Number(after.gid),
    }
  } finally {
    await handle.close()
  }
}

export async function readTextFileSnapshot(
  canonicalPath: string,
): Promise<TextFileSnapshot> {
  const snapshot = await readFileBytes(canonicalPath)
  const hasBom = snapshot.bytes.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      hasBom ? snapshot.bytes.subarray(UTF8_BOM.length) : snapshot.bytes,
    )
  } catch {
    throw new FileOperationError(
      'FILE_ENCODING_UNSUPPORTED',
      'The file must contain valid UTF-8 text.',
    )
  }
  if (text.includes('\0')) {
    throw new FileOperationError(
      'FILE_BINARY_UNSUPPORTED',
      'Files containing NUL bytes cannot be edited as text.',
    )
  }
  const withoutCrlf = text.replace(/\r\n/g, '')
  const hasCrlf = text.includes('\r\n')
  const hasLf = withoutCrlf.includes('\n')
  const hasCr = withoutCrlf.includes('\r')
  const lineEnding =
    hasCr || (hasCrlf && hasLf)
      ? 'mixed'
      : hasCrlf
        ? 'crlf'
        : hasLf
          ? 'lf'
          : 'none'
  return {
    bytes: snapshot.bytes,
    mode: snapshot.mode,
    nlink: snapshot.nlink,
    version: fileVersion(snapshot.bytes),
    text: lineEnding === 'crlf' ? text.replace(/\r\n/g, '\n') : text,
    hasBom,
    lineEnding,
  }
}

export function encodeTextFileSnapshot(
  snapshot: Pick<TextFileSnapshot, 'hasBom' | 'lineEnding'>,
  text: string,
): Buffer {
  if (text.startsWith('\ufeff')) {
    throw new FileOperationError(
      'FILE_TEXT_INVALID',
      'Text input must omit a leading BOM; BOM is preserved separately.',
    )
  }
  for (let index = 0; index < text.length; index++) {
    const codeUnit = text.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(++index)
      if (next >= 0xdc00 && next <= 0xdfff) continue
    } else if (codeUnit < 0xdc00 || codeUnit > 0xdfff) {
      continue
    }
    throw new FileOperationError(
      'FILE_TEXT_INVALID',
      'Text must not contain unpaired Unicode surrogates.',
    )
  }
  if (text.includes('\0')) {
    throw new FileOperationError(
      'FILE_TEXT_INVALID',
      'Text must not contain NUL characters.',
    )
  }
  if (snapshot.lineEnding === 'crlf' && text.includes('\r')) {
    throw new FileOperationError(
      'FILE_TEXT_INVALID',
      'Use LF line endings when editing the CRLF text view.',
    )
  }
  const encoded = Buffer.from(
    snapshot.lineEnding === 'crlf' ? text.replace(/\n/g, '\r\n') : text,
    'utf8',
  )
  return snapshot.hasBom ? Buffer.concat([UTF8_BOM, encoded]) : encoded
}

interface FileMetadata {
  mode: number
  uid: number
  gid: number
}

async function checkVersion(
  path: string,
  expectedVersion: string | null,
  expectedMetadata?: FileMetadata,
): Promise<FileMetadata | undefined> {
  if (expectedVersion === null) {
    try {
      await lstat(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    throw new FileOperationError(
      'FILE_ALREADY_EXISTS',
      'The file already exists. Read it before replacing it.',
    )
  }
  if (expectedVersion === undefined) {
    throw new FileOperationError(
      'FILE_VERSION_REQUIRED',
      'expected_version is required. Read the file before replacing it.',
    )
  }
  if (
    typeof expectedVersion !== 'string' ||
    !VERSION_PATTERN.test(expectedVersion)
  ) {
    throw new FileOperationError(
      'FILE_VERSION_INVALID',
      'expected_version must be a SHA-256 file version or null for creation.',
    )
  }
  const snapshot = await readFileBytes(path)
  if (
    expectedMetadata &&
    (snapshot.mode !== expectedMetadata.mode ||
      snapshot.uid !== expectedMetadata.uid ||
      snapshot.gid !== expectedMetadata.gid)
  ) {
    throw new FileOperationError(
      'FILE_STALE_VERSION',
      'The file permissions or ownership changed before publication. Read it again before editing.',
    )
  }
  if (snapshot.nlink > 1) {
    throw new FileOperationError(
      'FILE_HARDLINK_UNSUPPORTED',
      'Files with multiple hard links cannot be replaced atomically.',
    )
  }
  if (
    (snapshot.mode & 0o7000) !== 0 ||
    (process.getuid && snapshot.uid !== process.getuid())
  ) {
    throw new FileOperationError(
      'FILE_METADATA_UNSUPPORTED',
      'Atomic replacement requires ordinary permissions and a file owned by the current user.',
    )
  }
  if (fileVersion(snapshot.bytes) !== expectedVersion) {
    throw new FileOperationError(
      'FILE_STALE_VERSION',
      'The file changed since it was read. Read it again before editing.',
    )
  }
  await access(path, constants.W_OK)
  return { mode: snapshot.mode, uid: snapshot.uid, gid: snapshot.gid }
}

export async function publishFile(args: {
  path: string
  bytes: Buffer
  expectedVersion: string | null
  signal?: AbortSignal
}): Promise<{ version: string; bytesWritten: number }> {
  const { path, expectedVersion, signal } = args
  throwIfFileOperationAborted(signal)
  const bytes = Buffer.from(args.bytes)
  const metadata = await checkVersion(path, expectedVersion)
  const temporaryPath = join(dirname(path), `.ati-${randomUUID()}.tmp`)
  const handle = await open(temporaryPath, 'wx', 0o600)
  try {
    try {
      await handle.writeFile(bytes)
      if (metadata !== undefined) {
        if (process.getuid) await handle.chown(metadata.uid, metadata.gid)
        await handle.chmod(metadata.mode & 0o777)
      }
      await handle.sync()
    } finally {
      await handle.close()
    }
    throwIfFileOperationAborted(signal)
    await checkVersion(path, expectedVersion, metadata)
    throwIfFileOperationAborted(signal)
    if (expectedVersion === null) {
      try {
        await link(temporaryPath, path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new FileOperationError(
            'FILE_ALREADY_EXISTS',
            'The file was created by another operation. Read it before replacing it.',
          )
        }
        throw error
      }
    } else {
      await rename(temporaryPath, path)
    }
    return { version: fileVersion(bytes), bytesWritten: bytes.length }
  } finally {
    try {
      await rm(temporaryPath, { force: true })
    } catch (error) {
      logger.warn('file.temporary_cleanup_failed', {
        path: temporaryPath,
        error,
      })
    }
  }
}
