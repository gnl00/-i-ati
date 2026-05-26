export interface ComputerUseAppDescriptor {
  id?: string
  name?: string
  bundleId?: string
  path?: string
  pid?: number
  running?: boolean
  [key: string]: unknown
}

export interface ComputerUseWindowDescriptor {
  windowId?: number
  title?: string
  appName?: string
  bundleId?: string
  pid?: number
  isMain?: boolean
  [key: string]: unknown
}

export interface ComputerUseNode {
  index: number
  role?: string
  title?: string
  value?: unknown
  enabled?: boolean
  frame?: {
    x: number
    y: number
    width: number
    height: number
  }
  [key: string]: unknown
}

export interface ComputerUseState {
  metadata: {
    id: string
    app?: string
    windowTitle?: string
    windowId?: number
    screenshotPath?: string
    [key: string]: unknown
  }
  nodes: ComputerUseNode[]
  screenshot?: {
    path?: string
    mimeType?: string
    width?: number
    height?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ComputerUseActionResult {
  text?: string
  metadata?: Record<string, unknown>
  state?: ComputerUseState
  [key: string]: unknown
}

export interface ComputerUseStateInput {
  app: string
  windowTitle?: string
  windowId?: number
  includeScreenshot?: boolean
}

export interface ComputerUsePermissionDiagnostics {
  accessibilityTrusted?: boolean
  screenCaptureTrusted?: boolean
  [key: string]: unknown
}

export interface ComputerUseCodeSigningDiagnostics {
  signed?: boolean
  identifier?: string
  teamIdentifier?: string
  error?: string
  [key: string]: unknown
}

export interface ComputerUseRuntimeDiagnostics {
  helperPath?: string
  processIdentifier?: number
  permissions?: ComputerUsePermissionDiagnostics
  codeSigning?: ComputerUseCodeSigningDiagnostics
  [key: string]: unknown
}

export interface ComputerUseBackend {
  diagnostics(): Promise<ComputerUseRuntimeDiagnostics>
  requestPermissions(): Promise<ComputerUsePermissionDiagnostics>
  listApps(): Promise<ComputerUseAppDescriptor[]>
  runningApps(): Promise<ComputerUseAppDescriptor[]>
  openApp(input: { app: string }): Promise<ComputerUseActionResult>
  listWindows(input: { app: string }): Promise<ComputerUseWindowDescriptor[]>
  state(input: ComputerUseStateInput): Promise<ComputerUseState>
  clickElement(input: {
    snapshotId: string
    elementIndex: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult>
  clickCoordinate(input: {
    snapshotId: string
    x: number
    y: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult>
  typeText(input: {
    snapshotId: string
    text: string
    elementIndex?: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult>
  setValue(input: {
    snapshotId: string
    elementIndex: number
    value: string
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult>
  pressKey(input: {
    snapshotId: string
    key: string
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult>
  scroll(input: {
    snapshotId: string
    elementIndex: number
    direction: 'up' | 'down' | 'left' | 'right'
    pages?: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult>
  drag(input: {
    snapshotId: string
    fromX: number
    fromY: number
    toX: number
    toY: number
    includeScreenshotAfter?: boolean
  }): Promise<ComputerUseActionResult>
  finish(): Promise<void>
}
