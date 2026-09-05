import {
  computerUseActions,
  type ComputerUseAction
} from '@tools/computerUse/actions'
import type {
  ComputerUseClickCoordinateArgs,
  ComputerUseClickElementArgs,
  ComputerUseDragArgs,
  ComputerUseListWindowsArgs,
  ComputerUseOpenAppArgs,
  ComputerUsePressKeyArgs,
  ComputerUseResultResponse,
  ComputerUseScrollArgs,
  ComputerUseSetValueArgs,
  ComputerUseStateArgs,
  ComputerUseTypeTextArgs
} from '@tools/computerUse/index.d'
import {
  resolveComputerUseBackend,
  type ComputerUseBackendFactoryOptions,
  type ComputerUseBackendKind
} from './ComputerUseBackendFactory'
import type { ComputerUseBackend } from '@main/services/computerUse'

const asObject = (args: unknown): Record<string, unknown> =>
  args && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {}

const requiredString = (args: unknown, key: string): string => {
  const value = asObject(args)[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`)
  }
  return value
}

const optionalString = (args: unknown, key: string): string | undefined => {
  const value = asObject(args)[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`)
  }
  return value
}

const requiredNumber = (args: unknown, key: string): number => {
  const value = asObject(args)[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number`)
  }
  return value
}

const optionalNumber = (args: unknown, key: string): number | undefined => {
  const value = asObject(args)[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number`)
  }
  return value
}

const optionalBoolean = (args: unknown, key: string): boolean | undefined => {
  const value = asObject(args)[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean`)
  }
  return value
}

const optionalScreenshotAfter = (
  args: unknown
): { includeScreenshotAfter?: boolean } => ({
  includeScreenshotAfter: optionalBoolean(args, 'includeScreenshotAfter')
})

const toResponse = async (input: {
  kind: ComputerUseBackendKind
  action: () => Promise<unknown>
}): Promise<ComputerUseResultResponse> => {
  try {
    return {
      success: true,
      backend: input.kind,
      result: await input.action()
    }
  } catch (error) {
    return {
      success: false,
      backend: input.kind,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export class ComputerUseToolsProcessor {
  private readonly backend: ComputerUseBackend
  private readonly backendKind: ComputerUseBackendKind

  constructor(options: ComputerUseBackendFactoryOptions = {}) {
    const resolved = resolveComputerUseBackend(options)
    this.backend = resolved.backend
    this.backendKind = resolved.kind
  }

  async execute(args: unknown): Promise<ComputerUseResultResponse> {
    const raw = asObject(args)
    const action = typeof raw.action === 'string' ? raw.action : undefined
    try {
      requiredString(args, 'action')
      if (!action || !Object.hasOwn(computerUseActions, action)) {
        throw new Error(`Unsupported computer_use action: ${action}`)
      }
      const contract = computerUseActions[action as ComputerUseAction]
      const allowed = new Set<string>([
        'action',
        'chat_uuid', // Injected by ToolExecutor; backend inputs remain action-specific.
        ...contract.required,
        ...contract.optional
      ])
      for (const key of Object.keys(raw)) {
        if (!allowed.has(key))
          throw new Error(`${key} is not supported for action ${action}`)
      }
      for (const key of contract.required) {
        if (raw[key] === undefined || raw[key] === null) {
          throw new Error(`${key} is required for action ${action}`)
        }
      }
      let response: ComputerUseResultResponse
      switch (action as ComputerUseAction) {
        case 'status':
          response = await this.status()
          break
        case 'request_permissions':
          response = await this.requestPermissions()
          break
        case 'apps':
          response = await this.listApps()
          break
        case 'running_apps':
          response = await this.runningApps()
          break
        case 'open_app':
          response = await this.openApp(raw)
          break
        case 'windows':
          response = await this.listWindows(raw)
          break
        case 'state':
          response = await this.state(raw)
          break
        case 'click_element':
          response = await this.clickElement(raw)
          break
        case 'click_coordinate':
          response = await this.clickCoordinate(raw)
          break
        case 'type_text':
          response = await this.typeText(raw)
          break
        case 'set_value':
          response = await this.setValue(raw)
          break
        case 'press_key':
          response = await this.pressKey(raw)
          break
        case 'scroll':
          response = await this.scroll(raw)
          break
        case 'drag':
          response = await this.drag(raw)
          break
        case 'finish':
          response = await this.finish()
          break
      }
      return { ...response, action }
    } catch (error) {
      return {
        success: false,
        backend: this.backendKind,
        action,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  status(): Promise<ComputerUseResultResponse> {
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.diagnostics()
    })
  }

  requestPermissions(): Promise<ComputerUseResultResponse> {
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.requestPermissions()
    })
  }

  listApps(): Promise<ComputerUseResultResponse> {
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.listApps()
    })
  }

  runningApps(): Promise<ComputerUseResultResponse> {
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.runningApps()
    })
  }

  openApp(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUseOpenAppArgs = {
      app: requiredString(args, 'app')
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.openApp(input)
    })
  }

  listWindows(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUseListWindowsArgs = {
      app: requiredString(args, 'app')
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.listWindows(input)
    })
  }

  state(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUseStateArgs = {
      app: requiredString(args, 'app'),
      windowTitle: optionalString(args, 'windowTitle'),
      windowId: optionalNumber(args, 'windowId'),
      includeScreenshot: optionalBoolean(args, 'includeScreenshot')
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.state(input)
    })
  }

  clickElement(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUseClickElementArgs = {
      snapshotId: requiredString(args, 'snapshotId'),
      elementIndex: requiredNumber(args, 'elementIndex'),
      ...optionalScreenshotAfter(args)
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.clickElement(input)
    })
  }

  clickCoordinate(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUseClickCoordinateArgs = {
      snapshotId: requiredString(args, 'snapshotId'),
      x: requiredNumber(args, 'x'),
      y: requiredNumber(args, 'y'),
      ...optionalScreenshotAfter(args)
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.clickCoordinate(input)
    })
  }

  typeText(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUseTypeTextArgs = {
      snapshotId: requiredString(args, 'snapshotId'),
      text: requiredString(args, 'text'),
      elementIndex: optionalNumber(args, 'elementIndex'),
      ...optionalScreenshotAfter(args)
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.typeText(input)
    })
  }

  setValue(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUseSetValueArgs = {
      snapshotId: requiredString(args, 'snapshotId'),
      elementIndex: requiredNumber(args, 'elementIndex'),
      value: requiredString(args, 'value'),
      ...optionalScreenshotAfter(args)
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.setValue(input)
    })
  }

  pressKey(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUsePressKeyArgs = {
      snapshotId: requiredString(args, 'snapshotId'),
      key: requiredString(args, 'key'),
      ...optionalScreenshotAfter(args)
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.pressKey(input)
    })
  }

  scroll(args: unknown): Promise<ComputerUseResultResponse> {
    const direction = requiredString(args, 'direction')
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      throw new Error('direction must be one of up, down, left, right')
    }

    const input: ComputerUseScrollArgs = {
      snapshotId: requiredString(args, 'snapshotId'),
      elementIndex: requiredNumber(args, 'elementIndex'),
      direction: direction as ComputerUseScrollArgs['direction'],
      pages: optionalNumber(args, 'pages'),
      ...optionalScreenshotAfter(args)
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.scroll(input)
    })
  }

  drag(args: unknown): Promise<ComputerUseResultResponse> {
    const input: ComputerUseDragArgs = {
      snapshotId: requiredString(args, 'snapshotId'),
      fromX: requiredNumber(args, 'fromX'),
      fromY: requiredNumber(args, 'fromY'),
      toX: requiredNumber(args, 'toX'),
      toY: requiredNumber(args, 'toY'),
      ...optionalScreenshotAfter(args)
    }
    return toResponse({
      kind: this.backendKind,
      action: () => this.backend.drag(input)
    })
  }

  finish(): Promise<ComputerUseResultResponse> {
    return toResponse({
      kind: this.backendKind,
      action: async () => {
        await this.backend.finish()
        return { finished: true }
      }
    })
  }
}

const defaultProcessor = new ComputerUseToolsProcessor()

export const processComputerUse = (
  args: unknown
): Promise<ComputerUseResultResponse> => defaultProcessor.execute(args)
