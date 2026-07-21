import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises'
import { realpathSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const { getPathMock, getWorkspacePathByUuidMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
  getWorkspacePathByUuidMock: vi.fn()
}))

vi.mock('electron', () => ({ app: { getPath: getPathMock } }))
vi.mock('@main/db/DatabaseService', () => ({
  default: { getWorkspacePathByUuid: getWorkspacePathByUuidMock }
}))

import {
  resolveWorkspacePath,
  resolveWorkspaceRoot,
  WorkspacePathError,
  type ResolvedWorkspacePath
} from '../WorkspacePathResolver'

describe('WorkspacePathResolver', () => {
  let userDataDir: string
  let workspaceRoot: string
  let outsideRoot: string

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'ati-path-resolver-'))
    workspaceRoot = join(userDataDir, 'workspaces', 'chat-1')
    outsideRoot = join(userDataDir, 'outside')
    await mkdir(workspaceRoot, { recursive: true })
    await mkdir(outsideRoot, { recursive: true })
    getPathMock.mockReturnValue(userDataDir)
    getWorkspacePathByUuidMock.mockReset()
    getWorkspacePathByUuidMock.mockReturnValue(undefined)
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  const resolveEmbedded = (
    path: string,
    intent: 'existing' | 'creatable' = 'existing'
  ): ResolvedWorkspacePath =>
    resolveWorkspacePath(path, { chatUuid: 'chat-1', mode: 'embedded-relative', intent })

  it.each(['/etc/passwd', 'C:\\Windows\\system.ini', 'C:relative.txt', '\\\\server\\share\\file', '\\rooted']) (
    'rejects absolute form %s for embedded tools',
    (path) => {
      expect(() => resolveEmbedded(path)).toThrowError(expect.objectContaining({ code: 'PATH_ABSOLUTE_REJECTED' }))
    }
  )

  it.each(['../secret', 'src/../secret', 'src\\..\\secret', 'src/..\\secret']) (
    'rejects raw parent segment %s',
    (path) => {
      expect(() => resolveEmbedded(path)).toThrowError(expect.objectContaining({ code: 'PATH_TRAVERSAL_REJECTED' }))
    }
  )

  it('rejects NUL and keeps dot as the workspace root', () => {
    expect(() => resolveEmbedded('file\0.txt')).toThrowError(expect.objectContaining({ code: 'PATH_INVALID_INPUT' }))
    expect(resolveEmbedded('.')).toMatchObject({ relativePath: '.', canonicalWorkspaceRoot: realpathSync(workspaceRoot) })
  })

  it('rejects external leaf and missing descendants below an external symlink', async () => {
    await writeFile(join(outsideRoot, 'secret.txt'), 'secret')
    await symlink(join(outsideRoot, 'secret.txt'), join(workspaceRoot, 'external-file'))
    await symlink(outsideRoot, join(workspaceRoot, 'external-dir'))

    expect(() => resolveEmbedded('external-file')).toThrowError(expect.objectContaining({ code: 'PATH_SYMLINK_ESCAPE' }))
    expect(() => resolveEmbedded('external-dir/new/file.txt', 'creatable'))
      .toThrowError(expect.objectContaining({ code: 'PATH_SYMLINK_ESCAPE' }))
  })

  it('uses canonicalization failure for dangling symbolic links', async () => {
    await symlink(join(outsideRoot, 'missing.txt'), join(workspaceRoot, 'dangling-external'))
    await symlink(join(workspaceRoot, 'missing.txt'), join(workspaceRoot, 'dangling-internal'))

    expect(() => resolveEmbedded('dangling-external'))
      .toThrowError(expect.objectContaining({ code: 'PATH_CANONICALIZATION_FAILED' }))
    expect(() => resolveEmbedded('dangling-internal'))
      .toThrowError(expect.objectContaining({ code: 'PATH_CANONICALIZATION_FAILED' }))
  })

  it('allows explicit access through an internal symlink', async () => {
    await mkdir(join(workspaceRoot, 'real'), { recursive: true })
    await writeFile(join(workspaceRoot, 'real', 'file.txt'), 'safe')
    await symlink(join(workspaceRoot, 'real'), join(workspaceRoot, 'internal'))

    expect(resolveEmbedded('internal/file.txt')).toMatchObject({
      relativePath: 'real/file.txt',
      canonicalPath: join(realpathSync(workspaceRoot), 'real', 'file.txt')
    })
  })

  it('uses the canonical target of a symlinked workspace root as the boundary', async () => {
    const configuredRoot = join(userDataDir, 'configured-link')
    await symlink(workspaceRoot, configuredRoot)
    getWorkspacePathByUuidMock.mockReturnValue(configuredRoot)

    expect(resolveWorkspaceRoot('chat-1')).toBe(configuredRoot)
    expect(resolveEmbedded('safe.txt', 'creatable')).toMatchObject({
      canonicalWorkspaceRoot: realpathSync(workspaceRoot),
      canonicalPath: join(realpathSync(workspaceRoot), 'safe.txt')
    })
  })

  it('accepts legacy absolute paths inside the workspace and rejects outside paths', () => {
    const inside = resolveWorkspacePath(join(workspaceRoot, 'legacy.txt'), {
      chatUuid: 'chat-1', mode: 'legacy-compatible', intent: 'creatable'
    })
    expect(inside).toMatchObject({ relativePath: 'legacy.txt', legacyInput: true })

    expect(() => resolveWorkspacePath(join(outsideRoot, 'secret.txt'), {
      chatUuid: 'chat-1', mode: 'legacy-compatible', intent: 'existing'
    })).toThrowError(expect.objectContaining({ code: 'PATH_SYMLINK_ESCAPE' }))
  })

  it('exposes stable typed errors', () => {
    try {
      resolveEmbedded('../secret')
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspacePathError)
      expect((error as WorkspacePathError).message).toContain('PATH_TRAVERSAL_REJECTED')
    }
  })
})
