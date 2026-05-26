import {
  KwwkComputerUseBridgeClient,
  type ComputerUseBackend
} from '@main/services/computerUse'

export type ComputerUseBackendKind = 'kwwk'

export interface ComputerUseBackendFactoryOptions {
  backend?: ComputerUseBackend
  backendKind?: ComputerUseBackendKind
  kwwkCommand?: string
}

export interface ResolvedComputerUseBackend {
  kind: ComputerUseBackendKind
  backend: ComputerUseBackend
}

let cachedBackend: ResolvedComputerUseBackend | null = null

const resolveBackendKind = (value?: string): ComputerUseBackendKind => {
  const normalized = value?.trim().toLowerCase() || 'kwwk'
  if (normalized === 'kwwk') {
    return 'kwwk'
  }
  throw new Error(`Unsupported computer-use backend: ${value}`)
}

export const resolveComputerUseBackend = (
  options: ComputerUseBackendFactoryOptions = {}
): ResolvedComputerUseBackend => {
  if (options.backend) {
    return {
      kind: options.backendKind ?? 'kwwk',
      backend: options.backend
    }
  }

  if (cachedBackend) {
    return cachedBackend
  }

  const kind = resolveBackendKind(options.backendKind ?? process.env.ATI_COMPUTER_USE_BACKEND)
  if (kind === 'kwwk') {
    cachedBackend = {
      kind,
      backend: new KwwkComputerUseBridgeClient({
        command: options.kwwkCommand ?? process.env.ATI_KWWK_BRIDGE_COMMAND
      })
    }
    return cachedBackend
  }

  throw new Error(`Unsupported computer-use backend: ${kind}`)
}

export const resetComputerUseBackendForTests = (): void => {
  cachedBackend = null
}
