import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import {
  ProviderDefinitionLoader,
  type ProviderDefinitionLoaderDeps
} from '../ProviderDefinitionLoader'

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(),
    isPackaged: false
  }
}))

const definitions: ProviderDefinition[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    adapterPluginId: 'openai-chat-compatible-adapter',
    iconKey: 'openai',
    defaultApiUrl: 'https://api.openai.com/v1'
  }
]

function createDeps(overrides: Partial<ProviderDefinitionLoaderDeps> = {}): ProviderDefinitionLoaderDeps {
  return {
    isPackaged: () => false,
    getAppPath: () => '/project',
    getResourcesPath: () => '/application/resources',
    fileExists: () => true,
    readTextFile: () => JSON.stringify(definitions),
    ...overrides
  }
}

describe('ProviderDefinitionLoader', () => {
  it('loads provider definitions from the project resources directory during development', () => {
    const fileExists = vi.fn(() => true)
    const readTextFile = vi.fn(() => JSON.stringify(definitions))
    const loader = new ProviderDefinitionLoader(createDeps({ fileExists, readTextFile }))

    expect(loader.load()).toEqual(definitions)
    const expectedPath = path.join('/project', 'resources/providers/providers.json')
    expect(fileExists).toHaveBeenCalledWith(expectedPath)
    expect(readTextFile).toHaveBeenCalledWith(expectedPath)
  })

  it('loads provider definitions from the packaged extraResources directory', () => {
    const fileExists = vi.fn(() => true)
    const readTextFile = vi.fn(() => JSON.stringify(definitions))
    const getAppPath = vi.fn(() => '/application/app.asar')
    const loader = new ProviderDefinitionLoader(createDeps({
      isPackaged: () => true,
      getAppPath,
      fileExists,
      readTextFile
    }))

    expect(loader.load()).toEqual(definitions)
    const expectedPath = path.join('/application/resources', 'providers/providers.json')
    expect(fileExists).toHaveBeenCalledWith(expectedPath)
    expect(readTextFile).toHaveBeenCalledWith(expectedPath)
    expect(getAppPath).not.toHaveBeenCalled()
  })

  it('returns an empty list when the provider definition file is missing', () => {
    const readTextFile = vi.fn(() => JSON.stringify(definitions))
    const loader = new ProviderDefinitionLoader(createDeps({
      fileExists: () => false,
      readTextFile
    }))

    expect(loader.load()).toEqual([])
    expect(readTextFile).not.toHaveBeenCalled()
  })

  it('returns an empty list when the provider definition file cannot be parsed', () => {
    const loader = new ProviderDefinitionLoader(createDeps({
      readTextFile: () => '{invalid-json'
    }))

    expect(loader.load()).toEqual([])
  })
})
