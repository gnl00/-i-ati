import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'
import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import YAML from 'yaml'

const { searchMock, reindexMock, getStatusMock } = vi.hoisted(() => ({
  searchMock: vi.fn<(...args: any[]) => Promise<any[]>>(),
  reindexMock: vi.fn<(...args: any[]) => Promise<{ success: boolean }>>(),
  getStatusMock: vi.fn<() => { state: string }>()
}))

vi.mock('@main/services/knowledgebase/KnowledgebaseService', () => ({
  knowledgebaseService: {
    search: searchMock,
    reindex: reindexMock,
    getStatus: getStatusMock
  }
}))

import {
  __resetWikiIndexRefreshSchedulersForTests,
  processWikiDelete,
  processWikiList,
  processWikiRead,
  processWikiSearch,
  processWikiWrite
} from '../WikiToolsProcessor'

type ReadmeIndexEntryFixture = {
  name: string
  title: string
  type: string
  tags: string[]
  created: string
  updated: string
  source: string
  summary: string
}

let wikiRoot = ''

describe('WikiToolsProcessor', () => {
  beforeEach(async () => {
    wikiRoot = await mkdtemp(path.join(tmpdir(), 'ati-wiki-'))
    process.env.ATI_WIKI_ROOT = wikiRoot
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-29T10:00:00.000Z'))
    searchMock.mockReset()
    reindexMock.mockReset()
    reindexMock.mockResolvedValue({ success: true })
    getStatusMock.mockReset()
    getStatusMock.mockReturnValue({ state: 'idle' })
  })

  afterEach(async () => {
    __resetWikiIndexRefreshSchedulersForTests()
    vi.clearAllTimers()
    vi.useRealTimers()
    delete process.env.ATI_WIKI_ROOT
    await rm(wikiRoot, { recursive: true, force: true })
  })

  it('rejects parent and absolute path escape attempts', async () => {
    const outsidePath = path.join(path.dirname(wikiRoot), 'escape.md')

    const parentResult = await processWikiWrite({
      name: '../escape',
      content: 'escaped'
    })
    const absoluteResult = await processWikiRead({
      name: path.join(wikiRoot, 'absolute')
    })

    expect(parentResult.success).toBe(false)
    expect(parentResult.message).toContain('Invalid wiki entry name')
    expect(absoluteResult.success).toBe(false)
    expect(absoluteResult.message).toContain('Invalid wiki entry name')
    await expect(stat(outsidePath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(reindexMock).not.toHaveBeenCalled()
  })

  it('rejects entry symlinks for read, write, and delete without touching the target', async () => {
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'ati-wiki-outside-'))
    const outsidePath = path.join(outsideRoot, 'outside.md')
    await writeFile(outsidePath, 'outside original', 'utf-8')
    await mkdir(wikiRoot, { recursive: true })

    try {
      const linked = await tryCreateSymlink(outsidePath, path.join(wikiRoot, 'linked.md'))
      if (!linked) {
        return
      }

      const readResult = await processWikiRead({ name: 'linked' })
      const writeResult = await processWikiWrite({
        name: 'linked',
        content: 'replacement'
      })
      const deleteResult = await processWikiDelete({ name: 'linked' })

      expect(readResult.success).toBe(false)
      expect(readResult.message).toContain('symbolic link')
      expect(writeResult.success).toBe(false)
      expect(writeResult.message).toContain('symbolic link')
      expect(deleteResult.success).toBe(false)
      expect(deleteResult.message).toContain('symbolic link')
      await expect(readFile(outsidePath, 'utf-8')).resolves.toBe('outside original')
    } finally {
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })

  it('rejects parent directory symlinks for read, write, and delete without touching the target', async () => {
    const outsideRoot = await mkdtemp(path.join(tmpdir(), 'ati-wiki-outside-dir-'))
    const outsidePath = path.join(outsideRoot, 'target.md')
    await writeFile(outsidePath, 'parent symlink target', 'utf-8')
    await mkdir(wikiRoot, { recursive: true })

    try {
      const linked = await tryCreateSymlink(outsideRoot, path.join(wikiRoot, 'linked-dir'), 'dir')
      if (!linked) {
        return
      }

      const readResult = await processWikiRead({ name: 'linked-dir/target' })
      const writeResult = await processWikiWrite({
        name: 'linked-dir/target',
        content: 'replacement'
      })
      const deleteResult = await processWikiDelete({ name: 'linked-dir/target' })

      expect(readResult.success).toBe(false)
      expect(readResult.message).toContain('symbolic link')
      expect(writeResult.success).toBe(false)
      expect(writeResult.message).toContain('symbolic link')
      expect(deleteResult.success).toBe(false)
      expect(deleteResult.message).toContain('symbolic link')
      await expect(readFile(outsidePath, 'utf-8')).resolves.toBe('parent symlink target')
    } finally {
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })

  it('reserves root README names for the managed index', async () => {
    const result = await processWikiWrite({
      name: 'readme',
      content: 'Manual readme overwrite'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('README.md is reserved')
    await expect(stat(path.join(wikiRoot, 'README.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(reindexMock).not.toHaveBeenCalled()
  })

  it('creates and updates YAML frontmatter while preserving created', async () => {
    const createResult = await processWikiWrite({
      name: 'notes/my-entry',
      content: '# Initial body\n\nFirst paragraph.'
    })

    expect(createResult.success).toBe(true)
    expect(createResult.name).toBe('notes/my-entry')
    expect(createResult.index_status).toBe('queued')

    const createdRaw = await readFile(path.join(wikiRoot, 'notes', 'my-entry.md'), 'utf-8')
    const createdParsed = parseWikiFile(createdRaw)
    expect(createdParsed.metadata).toEqual({
      title: 'My Entry',
      type: 'note',
      tags: [],
      created: '2026-06-29',
      updated: '2026-06-29',
      source: 'user'
    })
    expect(createdParsed.body).toBe('# Initial body\n\nFirst paragraph.')

    vi.setSystemTime(new Date('2026-07-03T10:00:00.000Z'))
    const updateResult = await processWikiWrite({
      name: 'notes/my-entry.md',
      content: [
        '---',
        'title: Updated Title',
        'tags: [release, notes]',
        'created: 1999-01-01',
        'updated: 1999-01-02',
        'source: import',
        '---',
        '',
        'Updated body.'
      ].join('\n')
    })

    expect(updateResult.success).toBe(true)
    expect(updateResult.title).toBe('Updated Title')

    const updatedRaw = await readFile(path.join(wikiRoot, 'notes', 'my-entry.md'), 'utf-8')
    const updatedParsed = parseWikiFile(updatedRaw)
    expect(updatedParsed.metadata).toEqual({
      title: 'Updated Title',
      type: 'note',
      tags: ['release', 'notes'],
      created: '2026-06-29',
      updated: '2026-07-03',
      source: 'import'
    })
    expect(updatedParsed.body).toBe('Updated body.')
    await runScheduledWikiRefresh()
    expect(reindexMock).toHaveBeenLastCalledWith({
      force: false,
      configOverride: {
        enabled: true,
        folders: [wikiRoot],
        chunkSize: 1200,
        chunkOverlap: 200
      }
    })
  })

  it('fails create mode for existing entries without mutating files or indexes', async () => {
    await processWikiWrite({
      name: 'mode/create-guard',
      content: 'Original body.'
    })
    const filePath = path.join(wikiRoot, 'mode', 'create-guard.md')
    const rawBefore = await readFile(filePath, 'utf-8')
    const readmeBefore = await readWikiReadme()
    reindexMock.mockClear()

    vi.setSystemTime(new Date('2026-07-04T10:00:00.000Z'))
    const result = await processWikiWrite({
      name: 'mode/create-guard',
      mode: 'create',
      content: [
        '---',
        'title: Replacement',
        '---',
        '',
        'Replacement body.'
      ].join('\n')
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('already exists')
    expect(result.index_status).toBe('unknown')
    expect(result.index_message).toBe('Wiki index unchanged.')
    expect(await readFile(filePath, 'utf-8')).toBe(rawBefore)
    expect(await readWikiReadme()).toBe(readmeBefore)
    expect(reindexMock).not.toHaveBeenCalled()
  })

  it('creates a new entry in create mode', async () => {
    const result = await processWikiWrite({
      name: 'mode/create-new',
      mode: 'create',
      content: 'Create mode summary.'
    })

    expect(result.success).toBe(true)
    expect(result.title).toBe('Create New')

    const createdRaw = await readFile(path.join(wikiRoot, 'mode', 'create-new.md'), 'utf-8')
    const createdParsed = parseWikiFile(createdRaw)
    expect(createdParsed.metadata).toEqual({
      title: 'Create New',
      type: 'note',
      tags: [],
      created: '2026-06-29',
      updated: '2026-06-29',
      source: 'user'
    })
    expect(createdParsed.body).toBe('Create mode summary.')
    expect(await readWikiReadme()).toContain('| mode/create-new | Create New | note |  | 2026-06-29 | 2026-06-29 | user | Create mode summary. |')
    await runScheduledWikiRefresh()
    expect(reindexMock).toHaveBeenCalledTimes(1)
  })

  it('fails append mode when the entry is missing', async () => {
    const result = await processWikiWrite({
      name: 'mode/missing-append',
      mode: 'append',
      content: 'Append body.'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('not found')
    expect(result.index_status).toBe('unknown')
    expect(result.index_message).toBe('Wiki index unchanged.')
    await expect(stat(path.join(wikiRoot, 'mode', 'missing-append.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(path.join(wikiRoot, 'README.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(reindexMock).not.toHaveBeenCalled()
  })

  it('appends body content while preserving original frontmatter metadata', async () => {
    await processWikiWrite({
      name: 'mode/append-target',
      content: [
        '---',
        'title: Original Title',
        'type: concept',
        'tags: [alpha]',
        'created: 2026-06-01',
        'source: imported',
        '---',
        '',
        'Original summary.',
        '',
        'Original detail.'
      ].join('\n')
    })
    const initialReadmeChecksum = extractReadmeIndexChecksum(await readWikiReadme())
    reindexMock.mockClear()

    vi.setSystemTime(new Date('2026-07-04T10:00:00.000Z'))
    const result = await processWikiWrite({
      name: 'mode/append-target',
      mode: 'append',
      content: [
        '---',
        'title: Incoming Title',
        'type: guide',
        'tags: [incoming]',
        'created: 1999-01-01',
        'source: incoming',
        '---',
        '',
        'Appended section.',
        '',
        'More appended.'
      ].join('\n')
    })

    expect(result.success).toBe(true)
    expect(result.title).toBe('Original Title')

    const appendedRaw = await readFile(path.join(wikiRoot, 'mode', 'append-target.md'), 'utf-8')
    const appendedParsed = parseWikiFile(appendedRaw)
    expect(appendedParsed.metadata).toEqual({
      title: 'Original Title',
      type: 'concept',
      tags: ['alpha'],
      created: '2026-06-01',
      updated: '2026-07-04',
      source: 'imported'
    })
    expect(appendedParsed.body).toBe([
      'Original summary.',
      '',
      'Original detail.',
      '',
      'Appended section.',
      '',
      'More appended.'
    ].join('\n'))

    const readme = await readWikiReadme()
    expect(extractReadmeIndexChecksum(readme)).not.toBe(initialReadmeChecksum)
    expect(readme).toContain('| mode/append-target | Original Title | concept | alpha | 2026-06-01 | 2026-07-04 | imported | Original summary. |')
    expect(readme).not.toContain('Appended section.')
    await runScheduledWikiRefresh()
    expect(reindexMock).toHaveBeenCalledTimes(1)
  })

  it('fails append mode with empty body without mutating files or indexes', async () => {
    await processWikiWrite({
      name: 'mode/append-empty',
      content: 'Original summary.'
    })
    const filePath = path.join(wikiRoot, 'mode', 'append-empty.md')
    const rawBefore = await readFile(filePath, 'utf-8')
    const readmeBefore = await readWikiReadme()
    reindexMock.mockClear()

    const result = await processWikiWrite({
      name: 'mode/append-empty',
      mode: 'append',
      content: [
        '---',
        'title: Empty Append',
        '---',
        '',
        '   '
      ].join('\n')
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('append mode requires non-empty body content')
    expect(result.index_status).toBe('unknown')
    expect(result.index_message).toBe('Wiki index unchanged.')
    expect(await readFile(filePath, 'utf-8')).toBe(rawBefore)
    expect(await readWikiReadme()).toBe(readmeBefore)
    expect(reindexMock).not.toHaveBeenCalled()
  })

  it('replaces an existing entry body and metadata while preserving created', async () => {
    await processWikiWrite({
      name: 'mode/replace-target',
      content: [
        '---',
        'title: Original Replace',
        'type: note',
        'tags: [old]',
        'created: 2026-05-01',
        'source: original',
        '---',
        '',
        'Original body.'
      ].join('\n')
    })

    vi.setSystemTime(new Date('2026-07-05T10:00:00.000Z'))
    const result = await processWikiWrite({
      name: 'mode/replace-target',
      mode: 'replace',
      content: [
        '---',
        'title: Replaced Title',
        'type: guide',
        'tags: [new, final]',
        'created: 1999-01-01',
        'updated: 1999-01-02',
        'source: replacement',
        '---',
        '',
        'Replaced body.'
      ].join('\n')
    })

    expect(result.success).toBe(true)
    expect(result.title).toBe('Replaced Title')

    const replacedRaw = await readFile(path.join(wikiRoot, 'mode', 'replace-target.md'), 'utf-8')
    const replacedParsed = parseWikiFile(replacedRaw)
    expect(replacedParsed.metadata).toEqual({
      title: 'Replaced Title',
      type: 'guide',
      tags: ['new', 'final'],
      created: '2026-05-01',
      updated: '2026-07-05',
      source: 'replacement'
    })
    expect(replacedParsed.body).toBe('Replaced body.')
    expect(await readWikiReadme()).toContain('| mode/replace-target | Replaced Title | guide | new, final | 2026-05-01 | 2026-07-05 | replacement | Replaced body. |')
  })

  it('creates a missing entry in replace mode', async () => {
    const result = await processWikiWrite({
      name: 'mode/replace-new',
      mode: 'replace',
      content: [
        '---',
        'title: Replace New',
        'tags: [replace]',
        'source: replacement',
        '---',
        '',
        'Replace-created summary.'
      ].join('\n')
    })

    expect(result.success).toBe(true)

    const createdRaw = await readFile(path.join(wikiRoot, 'mode', 'replace-new.md'), 'utf-8')
    const createdParsed = parseWikiFile(createdRaw)
    expect(createdParsed.metadata).toEqual({
      title: 'Replace New',
      type: 'note',
      tags: ['replace'],
      created: '2026-06-29',
      updated: '2026-06-29',
      source: 'replacement'
    })
    expect(createdParsed.body).toBe('Replace-created summary.')
  })

  it('creates the README managed index after wiki_write', async () => {
    const result = await processWikiWrite({
      name: 'guides/alpha',
      content: [
        '---',
        'title: Alpha Guide',
        'type: guide',
        'tags: [alpha, release]',
        'source: imported',
        '---',
        '',
        'Alpha summary line.',
        '',
        'More detail.'
      ].join('\n')
    })

    expect(result.success).toBe(true)

    const readme = await readWikiReadme()
    const expectedChecksum = calculateTestReadmeIndexChecksum([
      makeReadmeIndexEntry({
        name: 'guides/alpha',
        title: 'Alpha Guide',
        type: 'guide',
        tags: ['alpha', 'release'],
        created: '2026-06-29',
        updated: '2026-06-29',
        source: 'imported',
        summary: 'Alpha summary line.'
      })
    ])
    expect(readme).toContain('<!-- ati-wiki-index:start -->')
    expect(readme).toContain(`<!-- ati-wiki-index:checksum=v1:sha256:${expectedChecksum} -->`)
    expect(readme).toContain('| Entry | Title | Type | Tags | Created | Updated | Source | Summary |')
    expect(readme).toContain('| guides/alpha | Alpha Guide | guide | alpha, release | 2026-06-29 | 2026-06-29 | imported | Alpha summary line. |')
    expect(readme).not.toContain('guides/alpha.md')
  })

  it('calculates the README checksum from name, title, type, updated, and summary', async () => {
    await processWikiWrite({
      name: 'checksum-fields',
      content: [
        '---',
        'title: Checksum Fields',
        'type: reference',
        'tags: [alpha]',
        'source: import',
        '---',
        '',
        'Checksum summary.'
      ].join('\n')
    })

    const readme = await readWikiReadme()
    const actualChecksum = extractReadmeIndexChecksum(readme)
    const baseEntry = makeReadmeIndexEntry({
      name: 'checksum-fields',
      title: 'Checksum Fields',
      type: 'reference',
      tags: ['alpha'],
      created: '2026-06-29',
      updated: '2026-06-29',
      source: 'import',
      summary: 'Checksum summary.'
    })

    expect(actualChecksum).toBe(calculateTestReadmeIndexChecksum([baseEntry]))
    expect(actualChecksum).toBe(calculateTestReadmeIndexChecksum([
      {
        ...baseEntry,
        tags: ['changed'],
        created: '1999-01-01',
        source: 'manual'
      }
    ]))
    expect(calculateTestReadmeIndexChecksum([{ ...baseEntry, name: 'renamed-fields' }])).not.toBe(actualChecksum)
    expect(calculateTestReadmeIndexChecksum([{ ...baseEntry, title: 'Changed Title' }])).not.toBe(actualChecksum)
    expect(calculateTestReadmeIndexChecksum([{ ...baseEntry, type: 'note' }])).not.toBe(actualChecksum)
    expect(calculateTestReadmeIndexChecksum([{ ...baseEntry, updated: '2026-07-01' }])).not.toBe(actualChecksum)
    expect(calculateTestReadmeIndexChecksum([{ ...baseEntry, summary: 'Changed summary.' }])).not.toBe(actualChecksum)
  })

  it('keeps using README index when only tags, created, and source cells change', async () => {
    await processWikiWrite({
      name: 'ignored-fields',
      content: [
        '---',
        'tags: [alpha]',
        '---',
        '',
        'Ignored field summary.'
      ].join('\n')
    })

    const originalReadme = await readWikiReadme()
    const editedReadme = originalReadme.replace(
      '| ignored-fields | Ignored Fields | note | alpha | 2026-06-29 | 2026-06-29 | user | Ignored field summary. |',
      '| ignored-fields | Ignored Fields | note | beta, manual | 1999-01-01 | 2026-06-29 | import | Ignored field summary. |'
    )
    await writeFile(path.join(wikiRoot, 'README.md'), editedReadme, 'utf-8')

    const result = await processWikiList()

    expect(result.success).toBe(true)
    expect(result.message).toBe('Found 1 wiki entries.')
    expect(result.index_source).toBe('readme')
    expect(result.entries[0]).toEqual({
      name: 'ignored-fields',
      title: 'Ignored Fields',
      type: 'note',
      tags: ['beta', 'manual'],
      created: '1999-01-01',
      updated: '2026-06-29',
      source: 'import',
      summary: 'Ignored field summary.'
    })
    expect(await readWikiReadme()).toBe(editedReadme)
  })

  it('updates an existing README index entry summary and updated date after wiki_write', async () => {
    await processWikiWrite({
      name: 'notes/changing',
      content: 'Old summary line.'
    })
    const initialChecksum = extractReadmeIndexChecksum(await readWikiReadme())

    vi.setSystemTime(new Date('2026-07-03T10:00:00.000Z'))
    const result = await processWikiWrite({
      name: 'notes/changing',
      content: [
        '---',
        'title: Changed Entry',
        'tags: [new]',
        '---',
        '',
        'New summary line.'
      ].join('\n')
    })

    expect(result.success).toBe(true)

    const readme = await readWikiReadme()
    expect(readme).toContain('| notes/changing | Changed Entry | note | new | 2026-06-29 | 2026-07-03 | user | New summary line. |')
    expect(readme).not.toContain('Old summary line.')
    expect(extractReadmeIndexChecksum(readme)).not.toBe(initialChecksum)
  })

  it('scans entries without rewriting README when checksum does not match covered table fields', async () => {
    await processWikiWrite({
      name: 'covered-mismatch',
      content: [
        '---',
        'title: File Title',
        '---',
        '',
        'File summary.'
      ].join('\n')
    })
    const staleReadme = (await readWikiReadme()).replace('File Title', 'Stale Title')
    await writeFile(path.join(wikiRoot, 'README.md'), staleReadme, 'utf-8')

    const result = await processWikiList()

    expect(result.success).toBe(true)
    expect(result.message).toContain('README index needs repair')
    expect(result.index_source).toBe('scan')
    expect(result.entries).toEqual([
      expect.objectContaining({
        name: 'covered-mismatch',
        title: 'File Title',
        summary: 'File summary.'
      })
    ])
    await expect(readWikiReadme()).resolves.toBe(staleReadme)
  })

  it('scans entries without rewriting README when checksum is missing', async () => {
    await processWikiWrite({
      name: 'missing-checksum',
      content: 'Checksum missing summary.'
    })
    const readmeWithoutChecksum = (await readWikiReadme()).replace(
      /<!-- ati-wiki-index:checksum=v1:sha256:[a-f0-9]{64} -->\n/,
      ''
    )
    await writeFile(path.join(wikiRoot, 'README.md'), readmeWithoutChecksum, 'utf-8')

    const result = await processWikiList()

    expect(result.success).toBe(true)
    expect(result.index_source).toBe('scan')
    expect(result.message).toContain('README index needs repair')
    await expect(readWikiReadme()).resolves.toBe(readmeWithoutChecksum)
  })

  it('scans entries without rewriting README when checksum format is invalid', async () => {
    await processWikiWrite({
      name: 'invalid-checksum',
      content: 'Checksum invalid summary.'
    })
    const readmeWithInvalidChecksum = (await readWikiReadme()).replace(
      /<!-- ati-wiki-index:checksum=v1:sha256:[a-f0-9]{64} -->/,
      '<!-- ati-wiki-index:checksum=v1:sha256:invalid -->'
    )
    await writeFile(path.join(wikiRoot, 'README.md'), readmeWithInvalidChecksum, 'utf-8')

    const result = await processWikiList()

    expect(result.success).toBe(true)
    expect(result.index_source).toBe('scan')
    expect(result.message).toContain('README index needs repair')
    await expect(readWikiReadme()).resolves.toBe(readmeWithInvalidChecksum)
  })

  it('deletes an entry and refreshes the wiki index', async () => {
    await processWikiWrite({
      name: 'delete-me',
      content: 'Temporary note'
    })
    await runScheduledWikiRefresh()
    reindexMock.mockClear()

    const result = await processWikiDelete({ name: 'delete-me' })

    expect(result.success).toBe(true)
    expect(result.index_status).toBe('queued')
    await expect(stat(path.join(wikiRoot, 'delete-me.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await runScheduledWikiRefresh()
    expect(reindexMock).toHaveBeenCalledWith({
      force: false,
      configOverride: expect.objectContaining({
        enabled: true,
        folders: [wikiRoot]
      })
    })
  })

  it('removes the README index entry after wiki_delete', async () => {
    await processWikiWrite({
      name: 'delete-me',
      content: 'Temporary note'
    })
    await processWikiWrite({
      name: 'keep-me',
      content: 'Keep note'
    })
    const checksumBeforeDelete = extractReadmeIndexChecksum(await readWikiReadme())

    const result = await processWikiDelete({ name: 'delete-me' })

    expect(result.success).toBe(true)

    const readme = await readWikiReadme()
    expect(readme).not.toContain('| delete-me |')
    expect(readme).toContain('| keep-me | Keep Me | note |')
    expect(extractReadmeIndexChecksum(readme)).not.toBe(checksumBeforeDelete)
  })

  it('serializes concurrent wiki_write README updates for the same root', async () => {
    const writes = Array.from({ length: 8 }, (_, index) =>
      processWikiWrite({
        name: `concurrent/write-${index}`,
        content: `Concurrent write ${index} summary.`
      })
    )

    const results = await Promise.all(writes)

    expect(results.every(result => result.success)).toBe(true)
    const readme = await readWikiReadme()
    expect(extractReadmeIndexChecksum(readme)).toMatch(/^[a-f0-9]{64}$/)
    for (let index = 0; index < 8; index += 1) {
      expect(readme).toContain(`| concurrent/write-${index} | Write ${index} | note |`)
    }

    const listResult = await processWikiList()
    expect(listResult.success).toBe(true)
    expect(listResult.index_source).toBe('readme')
    expect(listResult.entries.map(entry => entry.name).sort()).toEqual(
      Array.from({ length: 8 }, (_, index) => `concurrent/write-${index}`)
    )
  })

  it('serializes concurrent wiki_write and wiki_delete README updates for the same root', async () => {
    await processWikiWrite({
      name: 'concurrent/keep',
      content: 'Keep summary.'
    })
    await Promise.all(Array.from({ length: 5 }, (_, index) =>
      processWikiWrite({
        name: `concurrent/delete-${index}`,
        content: `Delete ${index} summary.`
      })
    ))

    const mutations = [
      ...Array.from({ length: 5 }, (_, index) =>
        processWikiWrite({
          name: `concurrent/new-${index}`,
          content: `New ${index} summary.`
        })
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        processWikiDelete({ name: `concurrent/delete-${index}` })
      )
    ]

    const results = await Promise.all(mutations)

    expect(results.every(result => result.success)).toBe(true)
    const readme = await readWikiReadme()
    expect(extractReadmeIndexChecksum(readme)).toMatch(/^[a-f0-9]{64}$/)

    const listResult = await processWikiList()
    expect(listResult.success).toBe(true)
    expect(listResult.index_source).toBe('readme')
    expect(listResult.entries.map(entry => entry.name).sort()).toEqual([
      'concurrent/keep',
      'concurrent/new-0',
      'concurrent/new-1',
      'concurrent/new-2',
      'concurrent/new-3',
      'concurrent/new-4'
    ])
  })

  it('reports unchanged index state when deleting a missing entry', async () => {
    const result = await processWikiDelete({ name: 'missing-delete' })

    expect(result.success).toBe(false)
    expect(result.name).toBe('missing-delete')
    expect(result.index_status).toBe('unknown')
    expect(result.index_message).toBe('Wiki index unchanged.')
    expect(result.message).toContain('not found')
  })

  it('coalesces burst writes into one scheduled incremental reindex', async () => {
    const firstResult = await processWikiWrite({
      name: 'burst/one',
      content: 'First burst note.'
    })
    const secondResult = await processWikiWrite({
      name: 'burst/two',
      content: 'Second burst note.'
    })

    expect(firstResult.index_status).toBe('queued')
    expect(secondResult.index_status).toBe('queued')
    expect(reindexMock).not.toHaveBeenCalled()

    await runScheduledWikiRefresh()

    expect(reindexMock).toHaveBeenCalledTimes(1)
    expect(reindexMock).toHaveBeenCalledWith({
      force: false,
      configOverride: {
        enabled: true,
        folders: [wikiRoot],
        chunkSize: 1200,
        chunkOverlap: 200
      }
    })
  })

  it('runs a wiki refresh after joining an older active knowledgebase job', async () => {
    getStatusMock
      .mockReturnValueOnce({ state: 'embedding' })
      .mockReturnValue({ state: 'completed' })

    const result = await processWikiWrite({
      name: 'busy-service',
      content: 'Busy service note.'
    })

    expect(result.index_status).toBe('queued')

    await runScheduledWikiRefresh()

    expect(reindexMock).toHaveBeenCalledTimes(2)
    expect(reindexMock).toHaveBeenNthCalledWith(1, {
      force: false,
      configOverride: expect.objectContaining({
        folders: [wikiRoot]
      })
    })
    expect(reindexMock).toHaveBeenNthCalledWith(2, {
      force: false,
      configOverride: expect.objectContaining({
        folders: [wikiRoot]
      })
    })
  })

  it('schedules a follow-up refresh for a mutation during an active reindex', async () => {
    const firstRefresh = createDeferred<{ success: boolean }>()
    const secondRefresh = createDeferred<{ success: boolean }>()
    reindexMock
      .mockReset()
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise)

    await processWikiWrite({
      name: 'active/one',
      content: 'First active note.'
    })
    await vi.advanceTimersByTimeAsync(50)

    expect(reindexMock).toHaveBeenCalledTimes(1)

    const secondResult = await processWikiWrite({
      name: 'active/two',
      content: 'Second active note.'
    })

    expect(secondResult.success).toBe(true)
    expect(secondResult.index_status).toBe('running')
    expect(secondResult.index_message).toContain('will refresh after it settles')
    expect(reindexMock).toHaveBeenCalledTimes(1)

    firstRefresh.resolve({ success: true })
    await settlePromises()
    expect(reindexMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(50)
    expect(reindexMock).toHaveBeenCalledTimes(2)
    expect(reindexMock).toHaveBeenLastCalledWith({
      force: false,
      configOverride: {
        enabled: true,
        folders: [wikiRoot],
        chunkSize: 1200,
        chunkOverlap: 200
      }
    })

    secondRefresh.resolve({ success: true })
    await settlePromises()
  })

  it('reports queued and running index state in wiki_search', async () => {
    const refresh = createDeferred<{ success: boolean }>()
    reindexMock
      .mockReset()
      .mockReturnValueOnce(refresh.promise)
    searchMock.mockResolvedValue([])

    await processWikiWrite({
      name: 'state-target',
      content: 'Search state summary.'
    })

    const queuedResult = await processWikiSearch({
      query: 'state target',
      localized_query: 'state target'
    })

    expect(queuedResult.index_status).toBe('queued')
    expect(queuedResult.index_message).toContain('queued')

    await vi.advanceTimersByTimeAsync(50)

    const runningResult = await processWikiSearch({
      query: 'state target',
      localized_query: 'state target'
    })

    expect(runningResult.index_status).toBe('running')
    expect(runningResult.index_message).toContain('running')

    refresh.resolve({ success: true })
    await settlePromises()
  })

  it('keeps a successful write and reports stale after scheduled index refresh fails', async () => {
    reindexMock.mockRejectedValueOnce(new Error('embedding unavailable'))

    const result = await processWikiWrite({
      name: 'index-failure',
      content: 'Saved content'
    })

    expect(result.success).toBe(true)
    expect(result.index_status).toBe('queued')
    const raw = await readFile(path.join(wikiRoot, 'index-failure.md'), 'utf-8')
    expect(raw).toContain('Saved content')
    expect(await readWikiReadme()).toContain('| index-failure | Index Failure | note |')

    await runScheduledWikiRefresh()
    searchMock.mockResolvedValue([])

    const searchResult = await processWikiSearch({
      query: 'index failure',
      localized_query: 'index failure'
    })

    expect(searchResult.index_status).toBe('stale')
    expect(searchResult.index_message).toContain('embedding unavailable')
    expect(searchResult.message).toContain('Index status: stale')
  })

  it('scans markdown files without creating README when README is missing', async () => {
    await mkdir(wikiRoot, { recursive: true })
    await writeFile(
      path.join(wikiRoot, 'summary.md'),
      [
        '---',
        'title: Frontmatter Title',
        'type: note',
        'tags: [wiki]',
        'created: 2026-01-01',
        'updated: 2026-01-02',
        'source: user',
        '---',
        '',
        'First body line.',
        'Second body line.'
      ].join('\n'),
      'utf-8'
    )

    const result = await processWikiList()

    expect(result.success).toBe(true)
    expect(result.index_source).toBe('scan')
    expect(result.message).toContain('README index needs repair')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toEqual(expect.objectContaining({
      name: 'summary',
      title: 'Frontmatter Title',
      summary: 'First body line.'
    }))
    await expect(stat(path.join(wikiRoot, 'README.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('scans entries without rewriting README when the managed block is missing', async () => {
    await mkdir(wikiRoot, { recursive: true })
    const manualReadme = '# Manual Wiki\n\nManual intro.\n'
    await writeFile(path.join(wikiRoot, 'README.md'), manualReadme, 'utf-8')
    await writeFile(
      path.join(wikiRoot, 'from-file.md'),
      [
        '---',
        'title: From File',
        'created: 2026-02-01',
        'updated: 2026-02-02',
        '---',
        '',
        'From file summary.'
      ].join('\n'),
      'utf-8'
    )

    const result = await processWikiList()

    expect(result.success).toBe(true)
    expect(result.index_source).toBe('scan')
    expect(result.message).toContain('README index needs repair')
    expect(result.entries).toEqual([
      expect.objectContaining({
        name: 'from-file',
        title: 'From File',
        summary: 'From file summary.'
      })
    ])
    await expect(readWikiReadme()).resolves.toBe(manualReadme)
  })

  it('scans entries without rewriting README when an indexed entry file is missing', async () => {
    await mkdir(wikiRoot, { recursive: true })
    await writeFile(
      path.join(wikiRoot, 'real.md'),
      [
        '---',
        'title: Real Entry',
        'created: 2026-03-01',
        'updated: 2026-03-02',
        '---',
        '',
        'Real summary.'
      ].join('\n'),
      'utf-8'
    )
    const staleReadme = renderTestReadmeIndex([
      makeReadmeIndexEntry({
        name: 'missing',
        title: 'Missing Entry',
        created: '2026-01-01',
        updated: '2026-01-02',
        summary: 'Missing summary.'
      })
    ])
    await writeFile(path.join(wikiRoot, 'README.md'), staleReadme, 'utf-8')

    const result = await processWikiList()

    expect(result.success).toBe(true)
    expect(result.index_source).toBe('scan')
    expect(result.message).toContain('README index needs repair')
    expect(result.entries).toEqual([
      expect.objectContaining({
        name: 'real',
        title: 'Real Entry',
        summary: 'Real summary.'
      })
    ])
    await expect(readWikiReadme()).resolves.toBe(staleReadme)
  })

  it('lists entries from README index without reading entry files', async () => {
    await mkdir(wikiRoot, { recursive: true })
    const entryPath = path.join(wikiRoot, 'indexed.md')
    await writeFile(
      entryPath,
      [
        '---',
        'title: File Title',
        '---',
        '',
        'File summary.'
      ].join('\n'),
      'utf-8'
    )
    await writeFile(
      path.join(wikiRoot, 'README.md'),
      renderTestReadmeIndex([
        makeReadmeIndexEntry({
          name: 'indexed',
          title: 'Indexed Title',
          type: 'concept',
          tags: ['alpha', 'beta'],
          created: '2026-01-01',
          updated: '2026-01-02',
          source: 'import',
          summary: 'Indexed summary.'
        })
      ]),
      'utf-8'
    )
    await chmod(entryPath, 0o000)

    try {
      const result = await processWikiList()

      expect(result.success).toBe(true)
      expect(result.entries).toEqual([
        {
          name: 'indexed',
          title: 'Indexed Title',
          type: 'concept',
          tags: ['alpha', 'beta'],
          created: '2026-01-01',
          updated: '2026-01-02',
          source: 'import',
          summary: 'Indexed summary.'
        }
      ])
    } finally {
      await chmod(entryPath, 0o600)
    }
  })

  it('scans entries without rewriting README when the managed table is damaged', async () => {
    await mkdir(wikiRoot, { recursive: true })
    await writeFile(
      path.join(wikiRoot, 'rebuilt.md'),
      [
        '---',
        'title: Rebuilt Entry',
        'type: note',
        'created: 2026-01-01',
        'updated: 2026-01-03',
        'source: user',
        '---',
        '',
        'Rebuilt summary.'
      ].join('\n'),
      'utf-8'
    )
    const damagedReadme = [
      '# Manual heading',
      '',
      '<!-- ati-wiki-index:start -->',
      `<!-- ati-wiki-index:checksum=v1:sha256:${calculateTestReadmeIndexChecksum([
        makeReadmeIndexEntry({ name: 'missing', summary: 'row' })
      ])} -->`,
      '| Entry | Broken |',
      '| --- | --- |',
      '| missing | row |',
      '<!-- ati-wiki-index:end -->',
      '',
      'Manual footer.'
    ].join('\n')
    await writeFile(path.join(wikiRoot, 'README.md'), damagedReadme, 'utf-8')

    const result = await processWikiList()

    expect(result.success).toBe(true)
    expect(result.index_source).toBe('scan')
    expect(result.message).toContain('README index needs repair')
    expect(result.entries).toEqual([
      expect.objectContaining({
        name: 'rebuilt',
        title: 'Rebuilt Entry',
        summary: 'Rebuilt summary.'
      })
    ])
    await expect(readWikiReadme()).resolves.toBe(damagedReadme)
  })

  it('preserves README content outside the managed block on index updates', async () => {
    await mkdir(wikiRoot, { recursive: true })
    await writeFile(
      path.join(wikiRoot, 'README.md'),
      [
        '# Team Wiki',
        '',
        'Manual intro.',
        '',
        '<!-- ati-wiki-index:start -->',
        `<!-- ati-wiki-index:checksum=v1:sha256:${calculateTestReadmeIndexChecksum([])} -->`,
        '| Entry | Title | Type | Tags | Created | Updated | Source | Summary |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        '<!-- ati-wiki-index:end -->',
        '',
        'Manual footer.'
      ].join('\n'),
      'utf-8'
    )

    await processWikiWrite({
      name: 'new-entry',
      content: 'New entry summary.'
    })

    const readme = await readWikiReadme()
    expect(readme).toContain('# Team Wiki')
    expect(readme).toContain('Manual intro.')
    expect(readme).toContain('Manual footer.')
    expect(readme).toContain('| new-entry | New Entry | note |')
  })

  it('uses knowledgebase search with query fusion and wiki filters', async () => {
    searchMock
      .mockResolvedValueOnce([
        makeSearchItem({ chunkId: 'chunk-1', text: 'first chunk low score', score: 0.7, similarity: 0.6, chunkIndex: 2 })
      ])
      .mockResolvedValueOnce([
        makeSearchItem({ chunkId: 'chunk-2', text: 'second chunk', score: 0.8, similarity: 0.7, chunkIndex: 1 }),
        makeSearchItem({ chunkId: 'chunk-1', text: 'first chunk high score', score: 0.9, similarity: 0.8, chunkIndex: 2 })
      ])

    const result = await processWikiSearch({
      query: 'distributed lock',
      localized_query: '分布式锁',
      top_k: 99,
      threshold: -1
    })

    expect(searchMock).toHaveBeenNthCalledWith(1, 'distributed lock', {
      topK: 20,
      threshold: 0,
      folders: [wikiRoot],
      extensions: ['.md']
    })
    expect(searchMock).toHaveBeenNthCalledWith(2, '分布式锁', {
      topK: 20,
      threshold: 0,
      folders: [wikiRoot],
      extensions: ['.md']
    })
    expect(result.success).toBe(true)
    expect(result.results.map(item => item.text)).toEqual(['first chunk high score', 'second chunk'])
    expect(result.results.map(item => item.score)).toEqual([0.9, 0.8])
    expect(result.results[0]).toEqual(expect.objectContaining({
      entry_name: 'entry',
      title: 'entry',
      match_source: 'vector',
      match_reason: 'Vector chunk match'
    }))
    expectWikiSearchResultShape(result.results[0])
  })

  it('deduplicates identical query and localized_query candidates', async () => {
    searchMock.mockResolvedValueOnce([])

    const result = await processWikiSearch({
      query: 'same query',
      localized_query: 'same query'
    })

    expect(result.success).toBe(true)
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock).toHaveBeenCalledWith('same query', {
      topK: 10,
      threshold: undefined,
      folders: [wikiRoot],
      extensions: ['.md']
    })
  })

  it('returns README fallback results when vector search has no matching chunks', async () => {
    await writeFile(
      path.join(wikiRoot, 'distributed-lock.md'),
      [
        '---',
        'title: Distributed Lock Guide',
        'type: guide',
        'tags: [locking, concurrency]',
        'created: 2026-06-28',
        'updated: 2026-06-29',
        'source: user',
        '---',
        '',
        'Use Redis SET NX with expirations for simple distributed locks.'
      ].join('\n'),
      'utf-8'
    )
    await writeFile(
      path.join(wikiRoot, 'README.md'),
      renderTestReadmeIndex([
        makeReadmeIndexEntry({
          name: 'distributed-lock',
          title: 'Distributed Lock Guide',
          type: 'guide',
          tags: ['locking', 'concurrency'],
          summary: 'Use Redis SET NX with expirations for simple distributed locks.'
        })
      ]),
      'utf-8'
    )
    searchMock.mockResolvedValue([])

    const result = await processWikiSearch({
      query: 'lock guide',
      localized_query: '锁指南'
    })

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toEqual(expect.objectContaining({
      entry_name: 'distributed-lock',
      title: 'Distributed Lock Guide',
      summary: 'Use Redis SET NX with expirations for simple distributed locks.',
      match_source: 'readme'
    }))
    expect(result.results[0].match_reason).toContain('README')
    expect(result.results[0].text).toContain('Use wiki_read with name "distributed-lock"')
    expectWikiSearchResultShape(result.results[0])
    expect(result.message).toContain('README index matches may need wiki_read')
  })

  it('boosts vector results with README title matches and enriches response metadata', async () => {
    await writeFile(path.join(wikiRoot, 'distributed-lock.md'), 'Distributed lock body.', 'utf-8')
    await writeFile(
      path.join(wikiRoot, 'README.md'),
      renderTestReadmeIndex([
        makeReadmeIndexEntry({
          name: 'distributed-lock',
          title: 'Distributed Lock Guide',
          type: 'guide',
          tags: ['locking'],
          summary: 'Use Redis SET NX with expirations for simple distributed locks.'
        })
      ]),
      'utf-8'
    )
    searchMock.mockResolvedValueOnce([
      makeSearchItem({
        chunkId: 'other',
        filePath: path.join(wikiRoot, 'other.md'),
        fileName: 'other.md',
        text: 'Other wiki chunk.',
        score: 0.8,
        similarity: 0.8
      }),
      makeSearchItem({
        chunkId: 'target',
        filePath: path.join(wikiRoot, 'distributed-lock.md'),
        fileName: 'distributed-lock.md',
        text: 'Target wiki chunk.',
        score: 0.7,
        similarity: 0.7
      })
    ])

    const result = await processWikiSearch({
      query: 'distributed lock guide',
      localized_query: 'distributed lock guide'
    })

    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(result.results.map(item => item.text)).toEqual(['Target wiki chunk.', 'Other wiki chunk.'])
    expect(result.results[0]).toEqual(expect.objectContaining({
      entry_name: 'distributed-lock',
      title: 'Distributed Lock Guide',
      summary: 'Use Redis SET NX with expirations for simple distributed locks.',
      match_source: 'hybrid'
    }))
    expect(result.results[0].score).toBeGreaterThan(0.8)
    expect(result.results[0].match_reason).toContain('Vector chunk match')
    expectWikiSearchResultShape(result.results[0])
  })

  it('filters the root README vector result from wiki search entries', async () => {
    await mkdir(wikiRoot, { recursive: true })
    await writeFile(path.join(wikiRoot, 'pollution-entry.md'), 'Entry body for vector search.', 'utf-8')
    await writeFile(
      path.join(wikiRoot, 'README.md'),
      renderTestReadmeIndex([
        makeReadmeIndexEntry({
          name: 'pollution-entry',
          title: 'Pollution Entry',
          summary: 'Entry summary.'
        })
      ]),
      'utf-8'
    )
    searchMock.mockResolvedValueOnce([
      makeSearchItem({
        chunkId: 'readme-root',
        filePath: path.join(wikiRoot, 'README.md'),
        fileName: 'README.md',
        score: 0.99,
        similarity: 0.99
      }),
      makeSearchItem({
        chunkId: 'entry-chunk',
        filePath: path.join(wikiRoot, 'pollution-entry.md'),
        fileName: 'pollution-entry.md',
        score: 0.6,
        similarity: 0.6
      })
    ])

    const result = await processWikiSearch({
      query: 'opaque vector phrase',
      localized_query: 'opaque vector phrase'
    })

    expect(result.success).toBe(true)
    expect(result.results.map(item => item.entry_name)).toEqual(['pollution-entry'])
    expect(result.results[0]).toEqual(expect.objectContaining({
      entry_name: 'pollution-entry',
      match_source: 'vector'
    }))
    expectWikiSearchResultShape(result.results[0])
  })

  it('uses scanned entries for README fallback without rewriting a damaged README during search', async () => {
    await writeFile(
      path.join(wikiRoot, 'recoverable.md'),
      [
        '---',
        'title: Recoverable Search Note',
        'type: note',
        'tags: [search]',
        'created: 2026-06-28',
        'updated: 2026-06-29',
        'source: user',
        '---',
        '',
        'Recoverable summary from file body.'
      ].join('\n'),
      'utf-8'
    )
    const damagedReadme = [
      '# Manual Wiki',
      '',
      '<!-- ati-wiki-index:start -->',
      '<!-- ati-wiki-index:checksum=v1:sha256:0000000000000000000000000000000000000000000000000000000000000000 -->',
      '| Entry | Title | Type | Tags | Created | Updated | Source | Summary |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      '| stale | Stale | note |  | 2026-01-01 | 2026-01-01 | user | stale |',
      '<!-- ati-wiki-index:end -->',
      ''
    ].join('\n')
    await writeFile(path.join(wikiRoot, 'README.md'), damagedReadme, 'utf-8')
    searchMock.mockResolvedValue([])

    const result = await processWikiSearch({
      query: 'recoverable search',
      localized_query: 'recoverable search'
    })

    expect(result.success).toBe(true)
    expect(result.results[0]).toEqual(expect.objectContaining({
      entry_name: 'recoverable',
      title: 'Recoverable Search Note',
      match_source: 'readme'
    }))
    expectWikiSearchResultShape(result.results[0])
    await expect(readWikiReadme()).resolves.toBe(damagedReadme)
  })
})

function expectWikiSearchResultShape(result: object): void {
  expect(result).not.toHaveProperty('chunk_id')
  expect(result).not.toHaveProperty('document_id')
  expect(result).not.toHaveProperty('file_path')
  expect(result).not.toHaveProperty('folder_path')
  expect(result).not.toHaveProperty('ext')
  expect(result).not.toHaveProperty('chunk_index')
  expect(result).not.toHaveProperty('char_start')
  expect(result).not.toHaveProperty('char_end')
  expect(result).not.toHaveProperty('token_estimate')
}

async function runScheduledWikiRefresh(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50)
  await settlePromises()
}

async function settlePromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

async function readWikiReadme(): Promise<string> {
  return readFile(path.join(wikiRoot, 'README.md'), 'utf-8')
}

async function tryCreateSymlink(target: string, linkPath: string, type?: 'dir' | 'file'): Promise<boolean> {
  try {
    await symlink(target, linkPath, type)
    return true
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: string }).code
      : undefined
    if (code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP') {
      return false
    }
    throw error
  }
}

function makeReadmeIndexEntry(overrides: Partial<ReadmeIndexEntryFixture> = {}): ReadmeIndexEntryFixture {
  return {
    name: 'entry',
    title: 'Entry',
    type: 'note',
    tags: [],
    created: '2026-01-01',
    updated: '2026-01-02',
    source: 'user',
    summary: 'Entry summary.',
    ...overrides
  }
}

function calculateTestReadmeIndexChecksum(entries: ReadmeIndexEntryFixture[]): string {
  const normalized = entries
    .map(entry => ({
      name: entry.name.trim(),
      title: entry.title.trim(),
      type: entry.type.trim(),
      updated: entry.updated.trim(),
      summary: entry.summary.trim()
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
}

function extractReadmeIndexChecksum(readme: string): string {
  const match = readme.match(/<!-- ati-wiki-index:checksum=v1:sha256:([a-f0-9]{64}) -->/)
  if (!match) {
    throw new Error('Missing README index checksum')
  }
  return match[1]
}

function renderTestReadmeIndex(entries: ReadmeIndexEntryFixture[], options: {
  heading?: string
  footer?: string
  checksumLine?: string | null
} = {}): string {
  const checksumLine = options.checksumLine === undefined
    ? `<!-- ati-wiki-index:checksum=v1:sha256:${calculateTestReadmeIndexChecksum(entries)} -->`
    : options.checksumLine

  const lines = [
    options.heading ?? '# Manual Wiki',
    '',
    '<!-- ati-wiki-index:start -->'
  ]

  if (checksumLine !== null) {
    lines.push(checksumLine)
  }

  lines.push(
    '| Entry | Title | Type | Tags | Created | Updated | Source | Summary |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...entries.map(entry => `| ${entry.name} | ${entry.title} | ${entry.type} | ${entry.tags.join(', ')} | ${entry.created} | ${entry.updated} | ${entry.source} | ${entry.summary} |`),
    '<!-- ati-wiki-index:end -->'
  )

  if (options.footer) {
    lines.push('', options.footer)
  }

  return `${lines.join('\n')}\n`
}

function parseWikiFile(raw: string): { metadata: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/)
  if (!match) {
    throw new Error('Missing frontmatter')
  }
  return {
    metadata: YAML.parse(match[1]),
    body: match[2].trim()
  }
}

function makeSearchItem(overrides: Partial<{
  chunkId: string
  documentId: string
  filePath: string
  fileName: string
  folderPath: string
  ext: string
  text: string
  chunkIndex: number
  score: number
  similarity: number
  charStart: number
  charEnd: number
  tokenEstimate: number
}> = {}) {
  return {
    chunkId: 'chunk',
    documentId: 'doc',
    filePath: path.join(wikiRoot, 'entry.md'),
    fileName: 'entry.md',
    folderPath: wikiRoot,
    ext: '.md',
    text: 'retrieved wiki text',
    chunkIndex: 0,
    score: 0.5,
    similarity: 0.5,
    charStart: 0,
    charEnd: 20,
    tokenEstimate: 5,
    ...overrides
  }
}
