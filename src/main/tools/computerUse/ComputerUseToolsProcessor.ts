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

const asObject = (args: unknown): Record<string, unknown> => (
  args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {}
)

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
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${key} must be a number`)
  }
  return value
}

const optionalNumber = (args: unknown, key: string): number | undefined => {
  const value = asObject(args)[key]
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
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

const optionalScreenshotAfter = (args: unknown): { includeScreenshotAfter?: boolean } => ({
  includeScreenshotAfter: optionalBoolean(args, 'includeScreenshotAfter')
})

const toResponse = async (
  input: {
    kind: ComputerUseBackendKind
    action: () => Promise<unknown>
  }
): Promise<ComputerUseResultResponse> => {
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

export const processComputerUseStatus = (): Promise<ComputerUseResultResponse> => defaultProcessor.status()
export const processComputerUseRequestPermissions = (): Promise<ComputerUseResultResponse> => defaultProcessor.requestPermissions()
export const processComputerUseApps = (): Promise<ComputerUseResultResponse> => defaultProcessor.listApps()
export const processComputerUseRunningApps = (): Promise<ComputerUseResultResponse> => defaultProcessor.runningApps()
export const processComputerUseOpenApp = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.openApp(args)
export const processComputerUseWindows = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.listWindows(args)
export const processComputerUseState = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.state(args)
export const processComputerUseClickElement = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.clickElement(args)
export const processComputerUseClickCoordinate = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.clickCoordinate(args)
export const processComputerUseTypeText = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.typeText(args)
export const processComputerUseSetValue = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.setValue(args)
export const processComputerUsePressKey = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.pressKey(args)
export const processComputerUseScroll = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.scroll(args)
export const processComputerUseDrag = (args: unknown): Promise<ComputerUseResultResponse> => defaultProcessor.drag(args)
export const processComputerUseFinish = (): Promise<ComputerUseResultResponse> => defaultProcessor.finish()
