#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const args = process.argv.slice(2).filter((arg) => arg !== '--')

const argValue = (name) => {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  return args[index + 1]
}

const hasFlag = (name) => args.includes(name)

const errorMessage = (error) => error instanceof Error ? error.message : String(error)

const appCandidates = (scenario) => {
  const candidates = [scenario.app, ...(Array.isArray(scenario.appCandidates) ? scenario.appCandidates : [])]
    .filter((candidate) => typeof candidate === 'string' && candidate.length > 0)
  return [...new Set(candidates)]
}

const resolveHelper = () => {
  const explicit = process.env.ATI_KWWK_BRIDGE_COMMAND || argValue('--helper')
  if (explicit) return explicit

  const dev = path.join(process.cwd(), 'resources', 'native', 'kwwk-computer-use-bridge')
  if (existsSync(dev)) return dev

  return 'kwwk-computer-use-bridge'
}

const loadScenarios = () => {
  const scenariosPath = argValue('--scenarios')
  if (!scenariosPath) {
    throw new Error('Missing --scenarios <path>. Provide a JSON file with { "scenarios": [...] }.')
  }

  const parsed = JSON.parse(readFileSync(scenariosPath, 'utf8'))
  const scenarios = Array.isArray(parsed) ? parsed : parsed.scenarios
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error('Scenario file must contain a non-empty scenarios array.')
  }
  return scenarios
}

class JsonRpcClient {
  constructor(command) {
    this.command = command
    this.process = spawn(command, [], { stdio: 'pipe' })
    this.nextId = 1
    this.pending = new Map()

    readline.createInterface({ input: this.process.stdout }).on('line', (line) => {
      let response
      try {
        response = JSON.parse(line)
      } catch {
        return
      }
      const pending = this.pending.get(response.id)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pending.delete(response.id)
      if (response.error) {
        const error = new Error(response.error.message)
        error.code = response.error.code
        error.data = response.error.data
        pending.reject(error)
        return
      }
      pending.resolve(response.result)
    })

    this.process.on('exit', (code, signal) => {
      const error = new Error(`helper exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout)
        pending.reject(error)
      }
      this.pending.clear()
    })
  }

  request(method, params = {}) {
    const id = String(this.nextId++)
    const message = { jsonrpc: '2.0', id, method, params }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`request timed out: ${method}`))
      }, 30_000)
      this.pending.set(id, { resolve, reject, timeout })
      this.process.stdin.write(`${JSON.stringify(message)}\n`)
    })
  }

  async stop() {
    if (!this.process.killed) {
      try {
        await this.request('finish', {})
      } catch {
        // Continue shutdown.
      }
      this.process.kill()
    }
  }
}

const nodeText = (node, key) => {
  const value = node?.[key]
  return typeof value === 'string' ? value : ''
}

const includesExpectedText = (value, expected) => {
  if (expected === undefined) return true
  const values = Array.isArray(expected) ? expected : [expected]
  const normalizedValue = value.toLowerCase()
  return values.some((item) => (
    typeof item === 'string' && normalizedValue.includes(item.toLowerCase())
  ))
}

const matchesTarget = (node, target) => {
  if (target.elementIndex !== undefined && node.index !== target.elementIndex) return false
  if (target.role && node.role !== target.role) return false
  if (!includesExpectedText(nodeText(node, 'title'), target.titleIncludes)) return false
  if (!includesExpectedText(nodeText(node, 'description'), target.descriptionIncludes)) return false
  if (!includesExpectedText(nodeText(node, 'value'), target.valueIncludes)) return false
  if (!includesExpectedText(nodeText(node, 'identifier'), target.identifierIncludes)) return false
  return true
}

const summarizeCandidateNodes = (nodes, target) => {
  const allNodes = nodes || []
  const roleMatched = allNodes
    .filter((node) => !target?.role || node.role === target.role)
  const candidates = roleMatched.length > 0 ? roleMatched : allNodes
  return candidates
    .slice(0, 16)
    .map((node) => ({
      index: node.index,
      role: node.role,
      title: node.title,
      description: node.description,
      value: typeof node.value === 'string' ? node.value : undefined,
      identifier: node.identifier
    }))
}

const fingerprint = (state) => {
  const focused = state.nodes?.find((node) => node.focused)
  return JSON.stringify({
    snapshotId: state.metadata?.id,
    nodeCount: state.nodes?.length ?? 0,
    focusedIndex: focused?.index,
    focusedTitle: focused?.title,
    selectedText: state.selectedText
  })
}

const runScenario = async (client, scenario) => {
  const steps = []
  let resolvedApp = scenario.app
  const openErrors = []

  for (const candidate of appCandidates(scenario)) {
    try {
      await client.request('openApp', { app: candidate })
      resolvedApp = candidate
      steps.push({ name: 'open_app', status: 'passed', data: { app: candidate } })
      break
    } catch (error) {
      openErrors.push({ app: candidate, message: errorMessage(error) })
    }
  }

  if (steps.length === 0) {
    steps.push({
      name: 'open_app',
      status: 'failed',
      message: openErrors.at(-1)?.message || 'App could not be opened.',
      data: {
        appCandidates: appCandidates(scenario),
        errors: openErrors
      }
    })
    return {
      name: scenario.name,
      app: scenario.app,
      status: 'failed',
      changed: false,
      steps
    }
  }

  try {
    const before = await client.request('state', {
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
        snapshotId: before.metadata?.id,
        nodeCount: before.nodes?.length ?? 0
      }
    })

    if (scenario.action === 'state' || !scenario.target) {
      return {
        name: scenario.name,
        app: scenario.app,
        resolvedApp,
        status: 'passed',
        beforeSnapshotId: before.metadata?.id,
        beforeNodeCount: before.nodes?.length ?? 0,
        changed: false,
        steps
      }
    }

    const target = before.nodes?.find((node) => matchesTarget(node, scenario.target))
    if (!target) {
      steps.push({
        name: 'resolve_target',
        status: 'failed',
        data: {
          target: scenario.target,
          candidates: summarizeCandidateNodes(before.nodes, scenario.target || {})
        }
      })
      return {
        name: scenario.name,
        app: scenario.app,
        resolvedApp,
        status: 'failed',
        changed: false,
        steps
      }
    }
    steps.push({
      name: 'resolve_target',
      status: 'passed',
      data: { elementIndex: target.index, role: target.role, title: target.title }
    })

    await client.request('click', {
      snapshotId: before.metadata?.id,
      elementIndex: target.index,
      includeScreenshotAfter: scenario.includeScreenshot ?? true
    })
    steps.push({ name: 'click_element', status: 'passed' })

    const after = await client.request('state', {
      app: resolvedApp,
      windowTitle: scenario.windowTitle,
      windowId: scenario.windowId,
      includeScreenshot: scenario.includeScreenshot ?? true
    })
    const changed = fingerprint(before) !== fingerprint(after)
    const requiresChange = scenario.expectChange !== false
    const stateAfterPassed = changed || !requiresChange
    steps.push({
      name: 'state_after',
      status: stateAfterPassed ? 'passed' : 'failed',
      data: {
        app: resolvedApp,
        snapshotId: after.metadata?.id,
        nodeCount: after.nodes?.length ?? 0,
        changed
      }
    })

    return {
      name: scenario.name,
      app: scenario.app,
      resolvedApp,
      status: stateAfterPassed ? 'passed' : 'failed',
      selectedElementIndex: target.index,
      beforeSnapshotId: before.metadata?.id,
      afterSnapshotId: after.metadata?.id,
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
      resolvedApp,
      status: 'failed',
      changed: false,
      steps
    }
  }
}

const main = async () => {
  const helper = resolveHelper()
  const scenarios = loadScenarios()
  const client = new JsonRpcClient(helper)

  try {
    let diagnostics = await client.request('diagnostics', {})
    let permissions = diagnostics.permissions || {}
    if (
      (permissions.accessibilityTrusted === false || permissions.screenCaptureTrusted === false)
      && hasFlag('--request-permissions')
    ) {
      const requestedPermissions = await client.request('requestPermissions', {})
      diagnostics = await client.request('diagnostics', {})
      diagnostics = {
        ...diagnostics,
        requestedPermissions
      }
    }

    permissions = diagnostics.permissions || {}
    if ((permissions.accessibilityTrusted === false || permissions.screenCaptureTrusted === false) && !hasFlag('--allow-skip')) {
      console.log(JSON.stringify({
        status: 'skipped',
        reason: 'permissions_incomplete',
        diagnostics,
        hint: 'Grant Accessibility and Screen Recording permissions for this helper identity, then rerun the probe. Use --request-permissions to ask macOS for prompts.'
      }, null, 2))
      process.exitCode = 2
      return
    }

    const results = []
    for (const scenario of scenarios) {
      results.push(await runScenario(client, scenario))
    }

    const status = results.every((result) => result.status === 'passed') ? 'passed' : 'failed'
    console.log(JSON.stringify({
      status,
      diagnostics,
      scenarios: results
    }, null, 2))
    process.exitCode = status === 'passed' ? 0 : 1
  } finally {
    await client.stop()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
