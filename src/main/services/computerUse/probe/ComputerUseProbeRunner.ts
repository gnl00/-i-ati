import type {
  ComputerUseBackend,
  ComputerUseNode,
  ComputerUseRuntimeDiagnostics,
  ComputerUseState
} from '../ComputerUseBackend'

export interface ComputerUseProbeTarget {
  elementIndex?: number
  role?: string
  titleIncludes?: string | string[]
  descriptionIncludes?: string | string[]
  valueIncludes?: string | string[]
  identifierIncludes?: string | string[]
}

export interface ComputerUseProbeScenario {
  name: string
  app: string
  appCandidates?: string[]
  action?: 'state' | 'click'
  expectChange?: boolean
  windowTitle?: string
  windowId?: number
  includeScreenshot?: boolean
  target?: ComputerUseProbeTarget
}

export interface ComputerUseProbeStep {
  name: string
  status: 'passed' | 'failed'
  message?: string
  data?: unknown
}

export interface ComputerUseProbeScenarioResult {
  name: string
  app: string
  resolvedApp?: string
  status: 'passed' | 'failed' | 'skipped'
  selectedElementIndex?: number
  beforeSnapshotId?: string
  afterSnapshotId?: string
  beforeNodeCount?: number
  afterNodeCount?: number
  changed: boolean
  steps: ComputerUseProbeStep[]
}

export interface ComputerUseProbeRunResult {
  status: 'passed' | 'failed'
  diagnostics?: ComputerUseRuntimeDiagnostics
  scenarios: ComputerUseProbeScenarioResult[]
}

const getStringField = (node: ComputerUseNode, key: string): string => {
  const value = node[key]
  return typeof value === 'string' ? value : ''
}

const includesText = (value: string, expected?: string | string[]): boolean => {
  if (expected === undefined) {
    return true
  }

  const expectedValues = Array.isArray(expected) ? expected : [expected]
  const normalizedValue = value.toLowerCase()
  return expectedValues.some(item => normalizedValue.includes(item.toLowerCase()))
}

const matchesTarget = (node: ComputerUseNode, target: ComputerUseProbeTarget): boolean => {
  if (target.elementIndex !== undefined && node.index !== target.elementIndex) {
    return false
  }
  if (target.role && node.role !== target.role) {
    return false
  }
  if (!includesText(node.title || '', target.titleIncludes)) {
    return false
  }
  if (!includesText(getStringField(node, 'description'), target.descriptionIncludes)) {
    return false
  }
  if (!includesText(getStringField(node, 'value'), target.valueIncludes)) {
    return false
  }
  if (!includesText(getStringField(node, 'identifier'), target.identifierIncludes)) {
    return false
  }
  return true
}

const resolveTargetElement = (
  state: ComputerUseState,
  target: ComputerUseProbeTarget
): ComputerUseNode | null => (
  state.nodes.find(node => matchesTarget(node, target)) ?? null
)

const summarizeCandidateNodes = (
  state: ComputerUseState,
  target: ComputerUseProbeTarget
): Array<Record<string, unknown>> => (
  (state.nodes.filter(node => !target.role || node.role === target.role).length > 0
    ? state.nodes.filter(node => !target.role || node.role === target.role)
    : state.nodes)
    .slice(0, 16)
    .map(node => ({
      index: node.index,
      role: node.role,
      title: node.title,
      description: getStringField(node, 'description'),
      value: getStringField(node, 'value'),
      identifier: getStringField(node, 'identifier')
    }))
)

const stateFingerprint = (state: ComputerUseState): string => {
  const focused = state.nodes.find(node => node.focused)
  return JSON.stringify({
    snapshotId: state.metadata.id,
    nodeCount: state.nodes.length,
    focusedIndex: focused?.index,
    focusedTitle: focused?.title,
    selectedText: state.selectedText
  })
}

const hasPermissionFailure = (diagnostics?: ComputerUseRuntimeDiagnostics): boolean => (
  diagnostics?.permissions?.accessibilityTrusted === false
  || diagnostics?.permissions?.screenCaptureTrusted === false
)

const errorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
)

const getAppCandidates = (scenario: ComputerUseProbeScenario): string[] => (
  [...new Set([scenario.app, ...(scenario.appCandidates ?? [])].filter(Boolean))]
)

export class ComputerUseProbeRunner {
  constructor(private readonly backend: ComputerUseBackend) {}

  async run(scenarios: ComputerUseProbeScenario[]): Promise<ComputerUseProbeRunResult> {
    const diagnostics = await this.backend.diagnostics()
    const scenarioResults = hasPermissionFailure(diagnostics)
      ? scenarios.map(scenario => this.skippedForPermissions(scenario, diagnostics))
      : await Promise.all(scenarios.map(scenario => this.runScenario(scenario)))

    return {
      status: scenarioResults.every(result => result.status === 'passed' || result.status === 'skipped')
        ? 'passed'
        : 'failed',
      diagnostics,
      scenarios: scenarioResults
    }
  }

  private skippedForPermissions(
    scenario: ComputerUseProbeScenario,
    diagnostics: ComputerUseRuntimeDiagnostics
  ): ComputerUseProbeScenarioResult {
    return {
      name: scenario.name,
      app: scenario.app,
      status: 'skipped',
      changed: false,
      steps: [{
        name: 'permissions',
        status: 'failed',
        message: 'Computer-use permissions are incomplete.',
        data: diagnostics.permissions
      }]
    }
  }

  private async runScenario(scenario: ComputerUseProbeScenario): Promise<ComputerUseProbeScenarioResult> {
    const steps: ComputerUseProbeStep[] = []

    try {
      const resolvedApp = await this.openAppCandidate(scenario, steps)
      if (!resolvedApp) {
        return this.failedScenario(scenario, steps)
      }

      const before = await this.backend.state({
        app: resolvedApp,
        windowTitle: scenario.windowTitle,
        windowId: scenario.windowId,
        includeScreenshot: scenario.includeScreenshot ?? true
      })
      steps.push({
        name: 'state_before',
        status: 'passed',
        data: {
          app: resolvedApp,
          snapshotId: before.metadata.id,
          nodeCount: before.nodes.length
        }
      })

      if (scenario.action === 'state' || !scenario.target) {
        return {
          name: scenario.name,
          app: scenario.app,
          resolvedApp,
          status: 'passed',
          beforeSnapshotId: before.metadata.id,
          beforeNodeCount: before.nodes.length,
          changed: false,
          steps
        }
      }

      const target = resolveTargetElement(before, scenario.target)
      if (!target) {
        steps.push({
          name: 'resolve_target',
          status: 'failed',
          message: 'Target element was not found in the captured snapshot.',
          data: {
            target: scenario.target,
            candidates: summarizeCandidateNodes(before, scenario.target)
          }
        })
        return this.failedScenario(scenario, steps, before, resolvedApp)
      }
      steps.push({
        name: 'resolve_target',
        status: 'passed',
        data: {
          elementIndex: target.index,
          role: target.role,
          title: target.title
        }
      })

      await this.backend.clickElement({
        snapshotId: before.metadata.id,
        elementIndex: target.index,
        includeScreenshotAfter: scenario.includeScreenshot ?? true
      })
      steps.push({ name: 'click_element', status: 'passed' })

      const after = await this.backend.state({
        app: resolvedApp,
        windowTitle: scenario.windowTitle,
        windowId: scenario.windowId,
        includeScreenshot: scenario.includeScreenshot ?? true
      })
      const changed = stateFingerprint(before) !== stateFingerprint(after)
      const requiresChange = scenario.expectChange !== false
      const stateAfterPassed = changed || !requiresChange
      steps.push({
        name: 'state_after',
        status: stateAfterPassed ? 'passed' : 'failed',
        message: stateAfterPassed ? undefined : 'Post-click snapshot fingerprint did not change.',
        data: {
          app: resolvedApp,
          snapshotId: after.metadata.id,
          nodeCount: after.nodes.length,
          changed
        }
      })

      return {
        name: scenario.name,
        app: scenario.app,
        resolvedApp,
        status: stateAfterPassed ? 'passed' : 'failed',
        selectedElementIndex: target.index,
        beforeSnapshotId: before.metadata.id,
        afterSnapshotId: after.metadata.id,
        beforeNodeCount: before.nodes.length,
        afterNodeCount: after.nodes.length,
        changed,
        steps
      }
    } catch (error) {
      steps.push({
        name: 'exception',
        status: 'failed',
        message: errorMessage(error)
      })
      return {
        name: scenario.name,
        app: scenario.app,
        status: 'failed',
        changed: false,
        steps
      }
    }
  }

  private async openAppCandidate(
    scenario: ComputerUseProbeScenario,
    steps: ComputerUseProbeStep[]
  ): Promise<string | null> {
    const errors: Array<{ app: string, message: string }> = []

    for (const app of getAppCandidates(scenario)) {
      try {
        await this.backend.openApp({ app })
        steps.push({
          name: 'open_app',
          status: 'passed',
          data: { app }
        })
        return app
      } catch (error) {
        errors.push({ app, message: errorMessage(error) })
      }
    }

    steps.push({
      name: 'open_app',
      status: 'failed',
      message: errors.at(-1)?.message || 'App could not be opened.',
      data: {
        appCandidates: getAppCandidates(scenario),
        errors
      }
    })
    return null
  }

  private failedScenario(
    scenario: ComputerUseProbeScenario,
    steps: ComputerUseProbeStep[],
    before?: ComputerUseState,
    resolvedApp?: string
  ): ComputerUseProbeScenarioResult {
    return {
      name: scenario.name,
      app: scenario.app,
      resolvedApp,
      status: 'failed',
      beforeSnapshotId: before?.metadata.id,
      beforeNodeCount: before?.nodes.length,
      changed: false,
      steps
    }
  }
}
