import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  invokeDbConfigSaveMock,
  invokeDbProviderAccountDeleteMock,
  invokeDbProviderAccountSaveMock,
  invokeDbProviderDefinitionDeleteMock,
  invokeDbProviderModelDeleteMock,
  invokeDbProviderModelSaveMock,
  invokeDbProviderModelSetEnabledMock,
  loggerErrorMock
} = vi.hoisted(() => ({
  invokeDbConfigSaveMock: vi.fn(),
  invokeDbProviderAccountDeleteMock: vi.fn(),
  invokeDbProviderAccountSaveMock: vi.fn(),
  invokeDbProviderDefinitionDeleteMock: vi.fn(),
  invokeDbProviderModelDeleteMock: vi.fn(),
  invokeDbProviderModelSaveMock: vi.fn(),
  invokeDbProviderModelSetEnabledMock: vi.fn(),
  loggerErrorMock: vi.fn()
}))

vi.mock('@renderer/invoker/ipcInvoker', () => ({
  invokeDbConfigGet: vi.fn(),
  invokeDbConfigSave: invokeDbConfigSaveMock,
  invokeDbConfigInit: vi.fn(),
  invokeDbProviderDefinitionsGetAll: vi.fn(),
  invokeDbProviderDefinitionSave: vi.fn(),
  invokeDbProviderDefinitionDelete: invokeDbProviderDefinitionDeleteMock,
  invokeDbProviderAccountsGetAll: vi.fn(),
  invokeDbProviderAccountSave: invokeDbProviderAccountSaveMock,
  invokeDbProviderAccountDelete: invokeDbProviderAccountDeleteMock,
  invokeDbProviderModelSave: invokeDbProviderModelSaveMock,
  invokeDbProviderModelDelete: invokeDbProviderModelDeleteMock,
  invokeDbProviderModelSetEnabled: invokeDbProviderModelSetEnabledMock,
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

const createModel = (id: string, overrides: Partial<AccountModel> = {}): AccountModel => ({
  id,
  label: id,
  type: 'mllm',
  enabled: true,
  ...overrides
})

const createAccount = (
  id: string,
  providerId: string,
  models: AccountModel[] = []
): ProviderAccount => ({
  id,
  providerId,
  label: id,
  apiUrl: 'https://example.test/v1',
  apiKey: 'key',
  models
})

const createProviderDefinition = (id: string): ProviderDefinition => ({
  id,
  displayName: id,
  adapterPluginId: 'openai-chat-compatible-adapter',
  enabled: true
})

const createSlotConfig = (ref: ModelRef): IAppConfig => ({
  version: 1,
  tools: {
    mainModel: ref,
    liteModel: ref,
    visionModel: ref,
    memoryEnabled: true
  }
})

const seedProviderSlots = async (
  account: ProviderAccount,
  definition: ProviderDefinition,
  ref: ModelRef
) => {
  const { useAppConfigStore } = await import('../appConfig')
  useAppConfigStore.setState({
    appConfig: createSlotConfig(ref),
    accounts: [account],
    providerDefinitions: [definition],
    mainModel: ref,
    liteModel: ref,
    visionModel: ref,
    providersRevision: 0
  })
  return useAppConfigStore
}

const expectSavedConfigSlots = async (
  expected: {
    mainModel?: ModelRef
    liteModel?: ModelRef
    visionModel?: ModelRef
  }
) => {
  await vi.waitFor(() => {
    expect(invokeDbConfigSaveMock).toHaveBeenCalled()
  })
  const savedConfig = invokeDbConfigSaveMock.mock.calls.at(-1)?.[0] as IAppConfig
  expect(savedConfig.tools?.mainModel).toEqual(expected.mainModel)
  expect(savedConfig.tools?.liteModel).toEqual(expected.liteModel)
  expect(savedConfig.tools?.visionModel).toEqual(expected.visionModel)
}

describe('appConfig provider persistence', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubGlobal('__APP_VERSION__', 'test')
    const { useAppConfigStore } = await import('../appConfig')
    useAppConfigStore.setState({
      appConfig: { version: 1, tools: {} },
      accounts: [],
      providerDefinitions: [],
      currentAccountId: undefined,
      providersRevision: 0,
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
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
    await vi.waitFor(() => {
      expect(invokeDbProviderAccountDeleteMock).toHaveBeenCalledWith('account-removed')
    })

    expect(loggerErrorMock).not.toHaveBeenCalled()
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
    await vi.waitFor(() => {
      expect(invokeDbProviderAccountSaveMock).toHaveBeenCalledWith(nextAccount)
    })

    expect(loggerErrorMock).not.toHaveBeenCalled()
    expect(invokeDbProviderAccountDeleteMock).not.toHaveBeenCalled()
  })

  it('cleans all model slots before removing a selected provider account', async () => {
    const ref = { accountId: 'account-1', modelId: 'model-1' }
    const account = createAccount('account-1', 'provider-1', [createModel('model-1')])
    const definition = createProviderDefinition('provider-1')
    const useAppConfigStore = await seedProviderSlots(account, definition, ref)

    useAppConfigStore.getState().removeAccount('account-1')

    expect(useAppConfigStore.getState()).toMatchObject({
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
    })
    await expectSavedConfigSlots({
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
    })
    await vi.waitFor(() => {
      expect(invokeDbProviderAccountDeleteMock).toHaveBeenCalledWith('account-1')
    })
    expect(invokeDbConfigSaveMock.mock.invocationCallOrder[0]).toBeLessThan(
      invokeDbProviderAccountDeleteMock.mock.invocationCallOrder[0]
    )
  })

  it('cleans all model slots before removing a selected provider definition', async () => {
    const ref = { accountId: 'account-1', modelId: 'model-1' }
    const account = createAccount('account-1', 'provider-1', [createModel('model-1')])
    const definition = createProviderDefinition('provider-1')
    const useAppConfigStore = await seedProviderSlots(account, definition, ref)

    useAppConfigStore.getState().setProviderDefinitions([])

    expect(useAppConfigStore.getState()).toMatchObject({
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
    })
    await expectSavedConfigSlots({
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
    })
    await vi.waitFor(() => {
      expect(invokeDbProviderDefinitionDeleteMock).toHaveBeenCalledWith('provider-1')
    })
    expect(invokeDbConfigSaveMock.mock.invocationCallOrder[0]).toBeLessThan(
      invokeDbProviderDefinitionDeleteMock.mock.invocationCallOrder[0]
    )
  })

  it('cleans all model slots before removing a selected provider model', async () => {
    const ref = { accountId: 'account-1', modelId: 'model-1' }
    const account = createAccount('account-1', 'provider-1', [createModel('model-1')])
    const definition = createProviderDefinition('provider-1')
    const useAppConfigStore = await seedProviderSlots(account, definition, ref)

    useAppConfigStore.getState().removeModel('account-1', 'model-1')

    expect(useAppConfigStore.getState()).toMatchObject({
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
    })
    await expectSavedConfigSlots({
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
    })
    await vi.waitFor(() => {
      expect(invokeDbProviderModelDeleteMock).toHaveBeenCalledWith({
        accountId: 'account-1',
        modelId: 'model-1'
      })
    })
    expect(invokeDbConfigSaveMock.mock.invocationCallOrder[0]).toBeLessThan(
      invokeDbProviderModelDeleteMock.mock.invocationCallOrder[0]
    )
  })

  it('cleans all model slots before disabling a selected provider model', async () => {
    const ref = { accountId: 'account-1', modelId: 'model-1' }
    const account = createAccount('account-1', 'provider-1', [createModel('model-1')])
    const definition = createProviderDefinition('provider-1')
    const useAppConfigStore = await seedProviderSlots(account, definition, ref)

    useAppConfigStore.getState().toggleModelEnabled('account-1', 'model-1')

    expect(useAppConfigStore.getState()).toMatchObject({
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
    })
    await expectSavedConfigSlots({
      mainModel: undefined,
      liteModel: undefined,
      visionModel: undefined
    })
    await vi.waitFor(() => {
      expect(invokeDbProviderModelSetEnabledMock).toHaveBeenCalledWith({
        accountId: 'account-1',
        modelId: 'model-1',
        enabled: false
      })
    })
    expect(invokeDbConfigSaveMock.mock.invocationCallOrder[0]).toBeLessThan(
      invokeDbProviderModelSetEnabledMock.mock.invocationCallOrder[0]
    )
  })

  it('cleans the vision slot before persisting a model update that removes vision support', async () => {
    const ref = { accountId: 'account-1', modelId: 'model-1' }
    const account = createAccount('account-1', 'provider-1', [createModel('model-1')])
    const definition = createProviderDefinition('provider-1')
    const useAppConfigStore = await seedProviderSlots(account, definition, ref)

    useAppConfigStore.getState().updateModel('account-1', 'model-1', {
      type: 'llm',
      modalities: ['text'],
      capabilities: []
    })

    expect(useAppConfigStore.getState()).toMatchObject({
      mainModel: ref,
      liteModel: ref,
      visionModel: undefined
    })
    await expectSavedConfigSlots({
      mainModel: ref,
      liteModel: ref,
      visionModel: undefined
    })
    await vi.waitFor(() => {
      expect(invokeDbProviderModelSaveMock).toHaveBeenCalledWith({
        accountId: 'account-1',
        model: expect.objectContaining({
          id: 'model-1',
          type: 'llm',
          modalities: ['text'],
          capabilities: []
        })
      })
    })
    expect(invokeDbConfigSaveMock.mock.invocationCallOrder[0]).toBeLessThan(
      invokeDbProviderModelSaveMock.mock.invocationCallOrder[0]
    )
  })
})
