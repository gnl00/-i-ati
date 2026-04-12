import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderRepository } from '../ProviderRepository'

const createDb = () => ({
  transaction: (fn: () => void) => fn
})

describe('ProviderRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes provider descendants through DAO lookups instead of repository-local queries', () => {
    const providerRepo = {
      getProviderAccountIdsByProviderId: vi.fn().mockReturnValue(['acct-1', 'acct-2']),
      deleteProviderModelsByAccountId: vi.fn(),
      deleteProviderAccountsByProviderId: vi.fn(),
      deleteProviderDefinition: vi.fn()
    }
    const repository = new ProviderRepository({
      hasDb: () => true,
      getDb: () => createDb() as any,
      getProviderRepo: () => providerRepo as any
    })

    repository.deleteProviderDefinition('openai')

    expect(providerRepo.getProviderAccountIdsByProviderId).toHaveBeenCalledWith('openai')
    expect(providerRepo.deleteProviderModelsByAccountId).toHaveBeenNthCalledWith(1, 'acct-1')
    expect(providerRepo.deleteProviderModelsByAccountId).toHaveBeenNthCalledWith(2, 'acct-2')
    expect(providerRepo.deleteProviderAccountsByProviderId).toHaveBeenCalledWith('openai')
    expect(providerRepo.deleteProviderDefinition).toHaveBeenCalledWith('openai')
  })

  it('syncs account models through ProviderDao helpers and stamps enable updates in repository', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000)

    const providerRepo = {
      getProviderDefinitionById: vi.fn().mockReturnValue({ id: 'openai' }),
      upsertProviderAccount: vi.fn(),
      getProviderModelIdsByAccountId: vi.fn().mockReturnValue(['gpt-4.1', 'obsolete']),
      upsertProviderModel: vi.fn(),
      deleteProviderModel: vi.fn(),
      updateProviderModelEnabled: vi.fn()
    }
    const repository = new ProviderRepository({
      hasDb: () => true,
      getDb: () => createDb() as any,
      getProviderRepo: () => providerRepo as any
    })

    repository.saveProviderAccount({
      id: 'acct-openai',
      providerId: 'openai',
      label: 'Primary',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models: [{
        id: 'gpt-4.1',
        label: 'GPT-4.1',
        type: 'chat',
        enabled: true
      }]
    } as unknown as ProviderAccount)

    repository.setProviderModelEnabled('acct-openai', 'gpt-4.1', false)

    expect(providerRepo.getProviderModelIdsByAccountId).toHaveBeenCalledWith('acct-openai')
    expect(providerRepo.deleteProviderModel).toHaveBeenCalledWith('acct-openai', 'obsolete')
    expect(providerRepo.updateProviderModelEnabled).toHaveBeenCalledWith(
      'acct-openai',
      'gpt-4.1',
      0,
      1710000000000
    )
  })
})
