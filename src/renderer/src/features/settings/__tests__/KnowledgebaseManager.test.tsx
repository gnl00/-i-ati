// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import KnowledgebaseManager from '../KnowledgebaseManager'
import { toast } from 'sonner'

const mocks = vi.hoisted(() => ({
  config: {
    knowledgebase: {
      enabled: true,
      folders: ['/docs'],
      retrievalMode: 'tool-first' as const,
      autoIndexOnStartup: true,
      chunkSize: 1200,
      chunkOverlap: 200,
      maxResults: 8
    }
  },
  status: vi.fn(),
  stats: vi.fn(),
  reindex: vi.fn(),
  clear: vi.fn(),
  search: vi.fn(),
  open: vi.fn(),
  select: vi.fn(),
  check: vi.fn()
}))
vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: (): { appConfig: typeof mocks.config } => ({
    appConfig: mocks.config
  })
}))
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeKnowledgebaseStatus: mocks.status,
  invokeKnowledgebaseStats: mocks.stats,
  invokeKnowledgebaseReindex: mocks.reindex,
  invokeKnowledgebaseClear: mocks.clear,
  invokeKnowledgebaseSearch: mocks.search,
  invokeOpenPath: mocks.open,
  invokeSelectDirectory: mocks.select,
  invokeCheckIsDirectory: mocks.check
}))
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    message: vi.fn()
  }
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement
let root: Root
const props = (): React.ComponentProps<typeof KnowledgebaseManager> => ({
  ...mocks.config.knowledgebase,
  setEnabled: vi.fn(),
  setFolders: vi.fn(),
  setRetrievalMode: vi.fn(),
  setAutoIndexOnStartup: vi.fn(),
  setChunkSize: vi.fn(),
  setChunkOverlap: vi.fn(),
  setMaxResults: vi.fn()
})
const render = async (overrides = {}): Promise<void> => {
  await act(async () => {
    root.render(
      <KnowledgebaseManager
        {...props()}
        retrievalMode="tool-first"
        {...overrides}
      />
    )
  })
}
const clickButton = async (text: string): Promise<void> => {
  const button = [...container.querySelectorAll('button')].find(
    (item) => item.textContent === text
  )!
  await act(async () => button.click())
}
const search = async (): Promise<void> => {
  const input = container.querySelector<HTMLInputElement>(
    '[placeholder="Search indexed documents..."]'
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, 'session')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await clickButton('Search')
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.status.mockResolvedValue({
    state: 'idle',
    totalFiles: 0,
    processedFiles: 0,
    totalChunks: 0,
    processedChunks: 0,
    updatedAt: 0
  })
  mocks.stats.mockResolvedValue({
    documentCount: 2,
    chunkCount: 4,
    indexedDocumentCount: 2
  })
  mocks.open.mockResolvedValue({ success: true })
  mocks.clear.mockResolvedValue(undefined)
  mocks.check.mockResolvedValue({ success: true, isDirectory: true })
  mocks.reindex.mockResolvedValue(undefined)
  mocks.search.mockResolvedValue({ success: true, results: [] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})
it('places sources before recall, keeps advanced controls collapsed, and indexes draft values once', async () => {
  await render({ chunkSize: 1600 })
  const text = container.textContent!
  expect(text.indexOf('Knowledge Sources')).toBeLessThan(
    text.indexOf('Knowledge Search')
  )
  expect(container.querySelector('details')?.open).toBe(false)
  expect(
    container.querySelector('[aria-label="Retrieval mode"]')
  ).not.toBeNull()
  expect(
    [...container.querySelectorAll('button')].filter(
      (button) => button.textContent === 'Update Index'
    )
  ).toHaveLength(1)
  await clickButton('Update Index')
  expect(mocks.reindex).toHaveBeenCalledExactlyOnceWith({
    force: false,
    configOverride: expect.objectContaining({ chunkSize: 1600 })
  })
})
it('blocks recall for unsaved drafts and exposes indexing errors', async () => {
  await render({ chunkSize: 1600 })
  await search()
  expect(mocks.search).not.toHaveBeenCalled()
  expect(toast.warning).toHaveBeenCalledWith(
    'Save knowledge base settings before testing recall'
  )
  mocks.reindex.mockRejectedValueOnce(new Error('Index failed'))
  await clickButton('Update Index')
  expect(toast.error).toHaveBeenCalledWith('Index failed')
})
it('shows excerpts with collapsed diagnostics and retains file opening', async () => {
  const result = {
    chunk_id: 'chunk',
    document_id: 'doc',
    file_path: '/docs/session.md',
    file_name: 'session.md',
    folder_path: '/docs',
    ext: '.md',
    text: 'Restore the session before requests.',
    chunk_index: 2,
    score: 0.9,
    similarity: 0.8,
    char_start: 10,
    char_end: 45,
    token_estimate: 12
  }
  mocks.search.mockResolvedValueOnce({ success: true, results: [result] })
  await render()
  await search()
  expect(mocks.search).toHaveBeenCalledWith(
    expect.objectContaining({ query: 'session', top_k: 8, folders: ['/docs'] })
  )
  expect(container.querySelector('pre')?.textContent).toBe(result.text)
  const details = [...container.querySelectorAll('details')].find(
    (item) => item.querySelector('summary')?.textContent === 'Details'
  )!
  expect(details.open).toBe(false)
  details.open = true
  expect(details.textContent).toContain('Similarity 0.800')
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Open /docs/session.md"]')!
      .click()
  )
  expect(mocks.open).toHaveBeenCalledWith('/docs/session.md')
  await clickButton('Clear')
  expect(
    container.querySelector<HTMLInputElement>(
      '[placeholder="Search indexed documents..."]'
    )!.value
  ).toBe('')
  expect(container.querySelector('pre')).toBeNull()
  expect(container.textContent).toContain('0 results')
  expect(container.textContent).not.toContain('Top K')
})
it('shows no-hit and failed-search feedback and disables indexing while active', async () => {
  await render()
  await search()
  expect(container.textContent).toContain('No recall result found')
  mocks.search.mockResolvedValueOnce({
    success: false,
    message: 'Search unavailable'
  })
  await search()
  expect(container.textContent).toContain('Search unavailable')
  await clickButton('Clear')
  expect(container.textContent).not.toContain('Search unavailable')
  expect(container.textContent).toContain(
    'Enter a query to inspect retrieval results'
  )
  mocks.status.mockResolvedValue({
    state: 'chunking',
    totalFiles: 10,
    processedFiles: 3,
    totalChunks: 20,
    processedChunks: 4,
    updatedAt: 1
  })
  await clickButton('Update Index')
  expect(
    [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Update Index'
    )?.disabled
  ).toBe(true)
  expect(container.textContent).toContain('Files 3/10')
})
it('validates sources, rebuilds and clears from the maintenance menu', async () => {
  await render()
  const openMenu = async (): Promise<void> => {
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Index maintenance"]')!
        .dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 0,
            pointerType: 'mouse',
            ctrlKey: false
          })
        )
    })
  }
  const select = async (label: string): Promise<void> => {
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ].find((element) => element.textContent === label)!
    expect(item).toBeDefined()
    await act(async () => item.click())
  }
  await openMenu()
  await select('Validate Sources')
  expect(mocks.check).toHaveBeenCalledTimes(2)
  await openMenu()
  await select('Rebuild Index')
  expect(mocks.reindex).toHaveBeenCalledWith(
    expect.objectContaining({ force: true })
  )
  await openMenu()
  await select('Clear Index')
  expect(mocks.clear).toHaveBeenCalledTimes(1)
})

it('uses the shared expandable search and submits with Enter', async () => {
  await render()
  const input = container.querySelector<HTMLInputElement>(
    '[placeholder="Search indexed documents..."]'
  )!
  const trigger = input.parentElement!
  await act(async () => trigger.click())
  expect(input.className).toContain('opacity-100')
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, 'session')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    )
  )
  expect(mocks.search).toHaveBeenCalledOnce()
  expect(mocks.search).toHaveBeenCalledWith(
    expect.objectContaining({ query: 'session' })
  )
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
  )
  expect(input.value).toBe('')
  expect(input.className).toContain('opacity-0')
})
