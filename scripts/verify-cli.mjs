/* eslint-disable @typescript-eslint/explicit-function-return-type */

import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const launcher = resolve(process.argv[2] ?? join(process.cwd(), 'scripts/run-cli.mjs'))
const root = await mkdtemp(join(tmpdir(), 'ati-cli-verify-'))
const workspace = join(root, 'workspace')
const instruction = join(root, 'instruction.md')
const config = join(root, 'config.json')
const secret = 'ati-local-provider-secret-987654321'
const largeText = 'z'.repeat(12_000)

await mkdir(workspace)
await writeFile(instruction, 'Complete this isolated local provider acceptance task.')

const verifyMainBundleLayout = async () => {
  const mainDirectory = resolve(process.cwd(), 'out', 'main')
  const entries = await readdir(mainDirectory, { withFileTypes: true })
  const mainJavaScript = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => join(mainDirectory, entry.name))
  assert.ok(mainJavaScript.some(path => path.endsWith('/index.js')), 'main bundle entry is missing')
  const sources = await Promise.all(mainJavaScript.map(path => readFile(path, 'utf8')))
  const source = sources.join('\n')
  assert.match(source, /preload\/index\.js/, 'main bundle preload path is not colocated with its entry')
  assert.match(source, /renderer\/index\.html/, 'main bundle renderer path is not colocated with its entry')
}

await verifyMainBundleLayout()

let mode = 'complete'
let activeRunName = ''
let requestCount = 0
let reasoningRequests = []
let receivedToolNames = []
let visionRequestCount = 0

/** @type {(response: import('node:http').ServerResponse, payload: object) => void} */
const writeChunk = (response, payload) => {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

/** @type {(response: import('node:http').ServerResponse, content: string, usage?: object) => void} */
const sendCompletion = (response, content, usage = {}) => {
  const base = {
    id: 'ati-cli-verify',
    object: 'chat.completion.chunk',
    model: 'local-test',
    choices: [{ index: 0, delta: { content }, finish_reason: null }]
  }
  writeChunk(response, base)
  writeChunk(response, {
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage
  })
  response.end('data: [DONE]\n\n')
}

/** @type {(response: import('node:http').ServerResponse, name: string, args: object) => void} */
const sendToolCall = (response, name, args) => {
  const base = {
    id: 'ati-cli-verify-tool',
    object: 'chat.completion.chunk',
    model: 'local-test',
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          id: `${activeRunName}-tool-call`,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) }
        }]
      },
      finish_reason: null
    }]
  }
  writeChunk(response, base)
  writeChunk(response, {
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 }
  })
  response.end('data: [DONE]\n\n')
}

/** @type {(response: import('node:http').ServerResponse, name: string, args: object) => void} */
const sendReasoningToolCall = (response, name, args) => {
  const base = {
    id: 'ati-cli-verify-reasoning-tool',
    object: 'chat.completion.chunk',
    model: 'local-test',
    choices: [{
      index: 0,
      delta: {
        reasoning_content: 'deterministic reasoning before the workspace tool',
        tool_calls: [{
          index: 0,
          id: `${activeRunName}-reasoning-tool-call`,
          type: 'function',
          function: { name, arguments: JSON.stringify(args) }
        }]
      },
      finish_reason: null
    }]
  }
  writeChunk(response, base)
  writeChunk(response, {
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 }
  })
  response.end('data: [DONE]\n\n')
}

const server = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (body.model === 'local-vision') {
    visionRequestCount += 1
    assert.equal(request.headers.authorization, 'Bearer local-vision-secret')
    assert.ok(JSON.stringify(body.messages).includes('data:image/png;base64,'))
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ id: 'vision-response', model: 'local-vision',
      choices: [{ message: { role: 'assistant', content: 'PROFILE_VISION_OK' }, finish_reason: 'stop' }] }))
    return
  }
  requestCount += 1
  receivedToolNames = (body.tools ?? []).map(tool => tool.function.name)

  if (mode === 'reasoning') reasoningRequests.push(body)

  if (mode === 'provider-error') {
    response.writeHead(400, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: `invalid key ${secret}` } }))
    return
  }

  response.writeHead(200, { 'content-type': 'text/event-stream' })

  if (mode === 'hang') return

  const hasToolResult = Array.isArray(body.messages)
    && body.messages.some(message => message?.role === 'tool')

  if (mode === 'vision' && !hasToolResult) {
    sendToolCall(response, 'vision_analyze', {
      files: ['pixel.png'], prompt: 'Describe the image.', tool_call_reason: 'Verify configured vision capability.'
    })
    return
  }

  if (mode === 'write' && !hasToolResult) {
    sendToolCall(response, 'write', {
      file_path: `${activeRunName}.txt`,
      content: 'written by the deterministic provider',
      tool_call_reason: 'Create the acceptance fixture in the workspace.'
    })
    return
  }

  if (mode === 'reasoning' && !hasToolResult) {
    sendReasoningToolCall(response, 'write', {
      file_path: `${activeRunName}.txt`,
      content: 'written by the deterministic reasoning provider',
      tool_call_reason: 'Create the reasoning acceptance fixture in the workspace.'
    })
    return
  }

  if (mode === 'steps') {
    sendToolCall(response, 'read', {
      file_path: 'missing-for-step-budget.txt',
      tool_call_reason: 'Read the fixture to continue the acceptance task.'
    })
    return
  }

  if (mode === 'complete') {
    sendCompletion(response, largeText, {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_tokens_details: { cached_tokens: 70 }
    })
    return
  }

  sendCompletion(response, `${mode} completed`, {
    prompt_tokens: 40,
    completion_tokens: 12,
    total_tokens: 52
  })
})

await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer))
const serverPort = server.address().port
await writeFile(config, JSON.stringify({
  adapterPluginId: 'openai-chat-compatible-adapter',
  baseUrl: `http://127.0.0.1:${serverPort}/v1`,
  model: 'local-test',
  apiKeyEnv: 'ATI_CLI_VERIFY_KEY'
}))

/** @type {(name: string, extraArgs?: string[], signalOptions?: { signal?: NodeJS.Signals, afterMs?: number }) => Promise<{ name: string, output: string, stdout: string, stderr: string, code: number | null, signal: NodeJS.Signals | null }>} */
const run = (name, extraArgs = [], signalOptions = {}, configPath = config) => new Promise((resolveRun, rejectRun) => {
  activeRunName = name
  const output = join(root, name)
  const child = spawn(process.execPath, [
    launcher,
    'run',
    '--instruction-file', instruction,
    '--workspace', workspace,
    '--config', configPath,
    '--output-dir', output,
    '--profile-dir', join(root, 'profile'),
    ...extraArgs
  ], {
    env: { ...process.env, ATI_CLI_VERIFY_KEY: secret },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stdout = ''
  let stderr = ''
  let settled = false
  const deadline = setTimeout(() => {
    if (settled) return
    child.kill('SIGKILL')
    rejectRun(new Error(`${name} exceeded the verification deadline`))
  }, 20_000)
  let signalTimer
  let signalPoll
  if (signalOptions.signal) {
    const initialRequestCount = requestCount
    const startedAt = Date.now()
    /** @type {() => void} */
    const dispatchSignal = () => {
      if (settled) return
      if (requestCount > initialRequestCount || Date.now() - startedAt >= 5_000) {
        signalTimer = setTimeout(() => child.kill(signalOptions.signal), signalOptions.afterMs ?? 400)
        return
      }
      signalPoll = setTimeout(dispatchSignal, 25)
    }
    dispatchSignal()
  }

  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.once('error', error => {
    clearTimeout(deadline)
    if (signalTimer) clearTimeout(signalTimer)
    if (signalPoll) clearTimeout(signalPoll)
    rejectRun(error)
  })
  child.once('close', (code, signal) => {
    if (settled) return
    settled = true
    clearTimeout(deadline)
    if (signalTimer) clearTimeout(signalTimer)
    if (signalPoll) clearTimeout(signalPoll)
    resolveRun({ name, output, stdout, stderr, code, signal })
  })
})

/** @type {(path: string) => Promise<any>} */
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

/** @type {(directory: string) => Promise<string[]>} */
const listFiles = async directory => {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(path))
    else files.push(path)
  }
  return files
}

/** @type {(stdout: string) => any[]} */
const assertJsonlRun = stdout => {
  const events = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  assert.ok(events.length > 0, 'CLI emitted no JSONL events')
  assert.ok(events.every(event => event.schemaVersion === 1 && typeof event.runId === 'string'))
  assert.equal(events.filter(event => event.type === 'run.finished').length, 1)
  return events
}

/** @type {(output: string) => Promise<void>} */
const assertArtifacts = async output => {
  for (const name of ['events.jsonl', 'result.json', 'transcript.json']) {
    const details = await stat(join(output, name))
    assert.ok(details.isFile(), `${name} was not written`)
  }
}

try {
  const completed = await run('complete')
  assert.equal(completed.code, 0, completed.stderr)
  assertJsonlRun(completed.stdout)
  const completedResult = await readJson(join(completed.output, 'result.json'))
  assert.equal(completedResult.status, 'completed')
  for (const name of ['vision_analyze', 'plan', 'ask_user_question']) {
    assert.ok(receivedToolNames.includes(name), `Chat tool missing from CLI request: ${name}`)
    assert.ok(completedResult.tools.includes(name), `Tool missing from CLI audit: ${name}`)
  }
  assert.equal(completedResult.usage.totalTokens, 150)
  assert.equal(completedResult.usage.promptCacheHitTokens, 70)
  assert.ok(JSON.stringify(completedResult).includes(largeText), 'result text was truncated')
  assert.ok((await readFile(join(completed.output, 'transcript.json'), 'utf8')).includes(largeText), 'transcript text was truncated')
  await assertArtifacts(completed.output)

  // Seed only this temporary app profile with an auxiliary vision account.
  const profileDb = new DatabaseSync(join(root, 'profile', 'chat.db'))
  const now = Date.now()
  profileDb.prepare('INSERT INTO provider_definitions (id,display_name,adapter_plugin_id,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run('test-vision', 'Test vision', 'openai-chat-compatible-adapter', now, now)
  profileDb.prepare('INSERT INTO provider_accounts (id,provider_id,label,api_url,api_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run('test-vision', 'test-vision', 'Test vision', `http://127.0.0.1:${serverPort}/v1`, 'local-vision-secret', now, now)
  profileDb.prepare('INSERT INTO provider_models (account_id,model_id,label,type,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run('test-vision', 'local-vision', 'Test vision', 'vlm', 1, now, now)
  const appConfig = JSON.parse(profileDb.prepare("SELECT value FROM configs WHERE key='appConfig'").get().value)
  appConfig.tools.visionModel = { accountId: 'test-vision', modelId: 'local-vision' }
  profileDb.prepare("UPDATE configs SET value=? WHERE key='appConfig'").run(JSON.stringify(appConfig))
  profileDb.close()
  await writeFile(join(workspace, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1eUAAAAASUVORK5CYII=', 'base64'))
  mode = 'vision'
  const vision = await run('vision', ['--approval', 'auto'])
  assert.equal(vision.code, 0, vision.stderr)
  assert.equal(visionRequestCount, 1, 'vision tool did not use the app profile model')
  const visionTranscript = await readFile(join(vision.output, 'transcript.json'), 'utf8')
  assert.ok(visionTranscript.includes('PROFILE_VISION_OK'))
  assert.ok(!visionTranscript.includes('local-vision-secret'))
  mode = 'complete'

  const beforeInvalid = requestCount
  const invalid = await run('invalid', ['--max-steps', '0'])
  assert.equal(invalid.code, 2)
  assert.equal(requestCount, beforeInvalid, 'invalid arguments sent a provider request')

  const collision = await run('complete')
  assert.equal(collision.code, 2, 'existing output directory was accepted')
  assert.equal(requestCount, beforeInvalid, 'output collision sent a provider request')

  mode = 'write'
  const automatic = await run('tool-auto', ['--approval', 'auto'])
  assert.equal(automatic.code, 0, automatic.stderr)
  assert.equal(await readFile(join(workspace, 'tool-auto.txt'), 'utf8'), 'written by the deterministic provider')

  const denied = await run('tool-deny')
  assert.equal(denied.code, 0, denied.stderr)
  await assert.rejects(readFile(join(workspace, 'tool-deny.txt'), 'utf8'))

  mode = 'reasoning'
  const reasoningCases = [
    { name: 'thinking-enabled', thinking: { enabled: true, effort: 'high' }, includeReasoning: true },
    { name: 'thinking-disabled', thinking: { enabled: false }, includeReasoning: false },
    { name: 'thinking-omitted', thinking: undefined, includeReasoning: false },
    { name: 'thinking-enabled-default-effort', thinking: { enabled: true }, includeReasoning: true }
  ]
  const reasoningResults = []
  for (const testCase of reasoningCases) {
    reasoningRequests = []
    const reasoningConfig = join(root, `${testCase.name}.json`)
    await writeFile(reasoningConfig, JSON.stringify({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: `http://127.0.0.1:${serverPort}/v1`,
      model: 'local-test',
      apiKeyEnv: 'ATI_CLI_VERIFY_KEY',
      ...(testCase.thinking ? { options: { thinking: testCase.thinking } } : {})
    }))
    const reasoningRun = await run(testCase.name, ['--approval', 'auto'], {}, reasoningConfig)
    assert.equal(reasoningRun.code, 0, reasoningRun.stderr)
    assert.equal(reasoningRequests.length, 2, `${testCase.name} did not make exactly two provider requests`)
    const secondMessages = reasoningRequests[1].messages
    const assistant = secondMessages.find(message => message?.role === 'assistant' && Array.isArray(message.tool_calls))
    const tool = secondMessages.find(message => message?.role === 'tool')
    assert.ok(assistant, `${testCase.name} second request omitted the assistant tool call`)
    assert.ok(tool, `${testCase.name} second request omitted the tool result`)
    assert.equal(assistant.tool_calls[0].id, `${testCase.name}-reasoning-tool-call`)
    assert.equal(tool.tool_call_id, `${testCase.name}-reasoning-tool-call`)
    if (testCase.includeReasoning) {
      assert.equal(assistant.reasoning_content, 'deterministic reasoning before the workspace tool')
      assert.equal(reasoningRequests[1].reasoning_effort, testCase.thinking.effort)
    } else {
      assert.ok(!Object.prototype.hasOwnProperty.call(assistant, 'reasoning_content'))
      assert.ok(!Object.prototype.hasOwnProperty.call(reasoningRequests[1], 'reasoning_effort'))
    }
    const result = await readJson(join(reasoningRun.output, 'result.json'))
    assert.deepEqual(result.thinking, testCase.thinking)
    assert.equal(
      await readFile(join(workspace, `${testCase.name}.txt`), 'utf8'),
      'written by the deterministic reasoning provider'
    )
    reasoningResults.push(result)
  }
  assert.notEqual(
    reasoningResults[0].profile.modelConfigSha256,
    reasoningResults[1].profile.modelConfigSha256,
    'thinking enabled and disabled runs share a configuration fingerprint'
  )

  mode = 'steps'
  const exhausted = await run('steps', ['--max-steps', '1'])
  assert.equal(exhausted.code, 1, exhausted.stderr)
  const exhaustedResult = await readJson(join(exhausted.output, 'result.json'))
  assert.equal(exhaustedResult.status, 'failed')
  assert.match(exhaustedResult.failure.message, /exceeded maxSteps/)

  mode = 'hang'
  const timedOut = await run('timeout', ['--timeout-seconds', '1'])
  assert.equal(timedOut.code, 124, timedOut.stderr)
  assert.equal((await readJson(join(timedOut.output, 'result.json'))).status, 'aborted')

  const interrupted = await run('sigint', [], { signal: 'SIGINT' })
  assert.equal(interrupted.code, 130, interrupted.stdout + interrupted.stderr)
  assert.equal((await readJson(join(interrupted.output, 'result.json'))).status, 'aborted')

  mode = 'provider-error'
  const failed = await run('provider-error')
  assert.equal(failed.code, 1, failed.stderr)
  assert.ok(!failed.stdout.includes(secret), 'stdout leaked provider key')
  assert.ok(!failed.stderr.includes(secret), 'stderr leaked provider key')
  for (const path of await listFiles(failed.output)) {
    if (/\.(json|jsonl|log)$/.test(path)) {
      assert.ok(!(await readFile(path, 'utf8')).includes(secret), `provider key leaked in ${path}`)
    }
  }

  console.log(JSON.stringify({
    status: 'passed',
    root,
    cases: [
      'long transcript and usage',
      'Chat tool declarations and configured vision request',
      'invalid arguments and output collision',
      'file tool auto and deny approval',
      'two-round reasoning replay for enabled, disabled, and omitted thinking',
      'step exhaustion',
      'timeout and SIGINT',
      'provider error redaction'
    ]
  }))
} finally {
  server.closeAllConnections()
  await new Promise(resolveServer => server.close(resolveServer))
}
