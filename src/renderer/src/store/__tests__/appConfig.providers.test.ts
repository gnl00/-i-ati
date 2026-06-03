import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invokeDbProviderAccountDeleteMock,
  invokeDbProviderAccountSaveMock,
  loggerErrorMock
} = vi.hoisted(() => ({
  invokeDbProviderAccountDeleteMock: vi.fn(),
  invokeDbProviderAccountSaveMock: vi.fn(),
  loggerErrorMock: vi.fn()
}))

vi.mock('@renderer/invoker/ipcInvoker', () => ({
  invokeDbConfigGet: vi.fn(),
  invokeDbConfigSave: vi.fn(),
  invokeDbConfigInit: vi.fn(),
  invokeDbProviderDefinitionsGetAll: vi.fn(),
  invokeDbProviderDefinitionSave: vi.fn(),
  invokeDbProviderDefinitionDelete: vi.fn(),
  invokeDbProviderAccountsGetAll: vi.fn(),
  invokeDbProviderAccountSave: invokeDbProviderAccountSaveMock,
  invokeDbProviderAccountDelete: invokeDbProviderAccountDeleteMock,
  invokeDbProviderModelSave: vi.fn(),
  invokeDbProviderModelDelete: vi.fn(),
  invokeDbProviderModelSetEnabled: vi.fn(),
  subscribeConfigEvents: vi.fn(() => vi.fn()),
  subscribePluginEvents: vi.fn(() => vi.fn())
}))

vi.mock('@renderer/services/logging/rendererLogger', () => ({
  createRendererLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock
  }))
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn()
  }
}))

const createAccount = (id: string, providerId: string): ProviderAccount => ({
  id,
  providerId,
  label: id,
  apiUrl: 'https://example.test/v1',
  apiKey: 'key',
  models: []
})

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 10))
}

describe('appConfig provider persistence', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('__APP_VERSION__', 'test')
    const { useAppConfigStore } = await import('../appConfig')
    useAppConfigStore.setState({
      accounts: [],
      providerDefinitions: [],
      currentAccountId: undefined,
      providersRevision: 0
    })
  })

  it('deletes removed provider accounts without resaving unchanged accounts', async () => {
    const removedAccount = createAccount('account-removed', 'provider-removed')
    const unchangedAccount = createAccount('account-kept', 'provider-kept')
    const { useAppConfigStore } = await import('../appConfig')

    useAppConfigStore.setState({
      accounts: [removedAccount, unchangedAccount]
    })

    useAppConfigStore.getState().setAccounts([unchangedAccount])
    await flushPromises()

    expect(loggerErrorMock).not.toHaveBeenCalled()
    expect(invokeDbProviderAccountDeleteMock).toHaveBeenCalledWith('account-removed')
    expect(invokeDbProviderAccountSaveMock).not.toHaveBeenCalled()
  })

  it('saves provider accounts when their persisted content changes', async () => {
    const previousAccount = createAccount('account-kept', 'provider-kept')
    const nextAccount = {
      ...previousAccount,
      label: 'Updated account'
    }
    const { useAppConfigStore } = await import('../appConfig')

    useAppConfigStore.setState({
      accounts: [previousAccount]
    })

    useAppConfigStore.getState().setAccounts([nextAccount])
    await flushPromises()

    expect(loggerErrorMock).not.toHaveBeenCalled()
    expect(invokeDbProviderAccountDeleteMock).not.toHaveBeenCalled()
    expect(invokeDbProviderAccountSaveMock).toHaveBeenCalledWith(nextAccount)
  })
})
