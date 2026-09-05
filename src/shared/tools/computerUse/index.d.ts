import type { ComputerUseAction } from './actions'

export interface ComputerUseBaseResponse {
  success: boolean
  backend: 'kwwk'
  message?: string
  error?: string
}

export interface ComputerUseStateArgs {
  app: string
  windowTitle?: string
  windowId?: number
  includeScreenshot?: boolean
}

export interface ComputerUseOpenAppArgs {
  app: string
}

export interface ComputerUseListWindowsArgs {
  app: string
}

export interface ComputerUseClickElementArgs {
  snapshotId: string
  elementIndex: number
  includeScreenshotAfter?: boolean
}

export interface ComputerUseClickCoordinateArgs {
  snapshotId: string
  x: number
  y: number
  includeScreenshotAfter?: boolean
}

export interface ComputerUseTypeTextArgs {
  snapshotId: string
  text: string
  elementIndex?: number
  includeScreenshotAfter?: boolean
}

export interface ComputerUseSetValueArgs {
  snapshotId: string
  elementIndex: number
  value: string
  includeScreenshotAfter?: boolean
}

export interface ComputerUsePressKeyArgs {
  snapshotId: string
  key: string
  includeScreenshotAfter?: boolean
}

export interface ComputerUseScrollArgs {
  snapshotId: string
  elementIndex: number
  direction: 'up' | 'down' | 'left' | 'right'
  pages?: number
  includeScreenshotAfter?: boolean
}

export interface ComputerUseDragArgs {
  snapshotId: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  includeScreenshotAfter?: boolean
}

export interface ComputerUseResultResponse extends ComputerUseBaseResponse {
  action?: string
  result?: unknown
}

export interface ComputerUsePermissionDiagnostics {
  accessibilityTrusted?: boolean
  screenCaptureTrusted?: boolean
}

export interface ComputerUseRuntimeDiagnostics {
  helperPath?: string
  processIdentifier?: number
  permissions?: ComputerUsePermissionDiagnostics
  codeSigning?: {
    signed?: boolean
    identifier?: string
    teamIdentifier?: string
    error?: string
  }
  transport?: {
    command?: string
    resolvedFrom?: string
  }
}

/** Flat public arguments, narrowed by action. Backend argument interfaces stay reusable. */
export type ComputerUseArgs =
  | {
      action: Extract<
        ComputerUseAction,
        'status' | 'request_permissions' | 'apps' | 'running_apps' | 'finish'
      >
    }
  | ({ action: 'open_app' } & ComputerUseOpenAppArgs)
  | ({ action: 'windows' } & ComputerUseListWindowsArgs)
  | ({ action: 'state' } & ComputerUseStateArgs)
  | ({ action: 'click_element' } & ComputerUseClickElementArgs)
  | ({ action: 'click_coordinate' } & ComputerUseClickCoordinateArgs)
  | ({ action: 'type_text' } & ComputerUseTypeTextArgs)
  | ({ action: 'set_value' } & ComputerUseSetValueArgs)
  | ({ action: 'press_key' } & ComputerUsePressKeyArgs)
  | ({ action: 'scroll' } & ComputerUseScrollArgs)
  | ({ action: 'drag' } & ComputerUseDragArgs)
