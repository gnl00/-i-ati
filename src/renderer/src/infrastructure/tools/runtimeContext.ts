export interface RendererToolRuntimeContext {
  getCurrentChatUuid: () => string | undefined
  getMaxWebSearchItems: () => number | undefined
}

const defaultContext: RendererToolRuntimeContext = {
  getCurrentChatUuid: () => undefined,
  getMaxWebSearchItems: () => undefined
}

let runtimeContext = defaultContext

export const configureRendererToolRuntimeContext = (
  context: RendererToolRuntimeContext
): void => {
  runtimeContext = context
}

export const getRendererToolRuntimeContext = (): RendererToolRuntimeContext => runtimeContext
