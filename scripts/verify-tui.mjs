/* eslint-disable @typescript-eslint/explicit-function-return-type */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createInterface } from 'node:readline'
import { StringDecoder } from 'node:string_decoder'
import xterm from '@xterm/headless'

if (process.platform === 'win32')
  throw new Error('This PTY verifier requires macOS/Linux; verify Windows in Windows Terminal.')
const root = await mkdtemp(join(tmpdir(), 'ati-tui-verify-'))
console.log(`TUI verification artifacts: ${root}`)
const profile = join(root, 'profile')
const workspace = join(root, 'workspace')
await mkdir(workspace)
const requests = []
const auxiliaryRequests = []
let mode = 'text'
let sequence = 0
const server = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request) body += chunk
  const payload = JSON.parse(body)
  if (!payload.tools?.length) {
    auxiliaryRequests.push(payload)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        choices: [
          {
            message: { role: 'assistant', content: 'Local execution completed successfully.' },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    )
    return
  }
  requests.push(payload)
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  const send = (delta) =>
    response.write(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`
    )
  const finish = (reason = 'stop') =>
    response.end(
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: reason }], usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } })}\n\ndata: [DONE]\n\n`
    )
  const last = payload.messages.at(-1)
  if (mode === 'question' && last.role !== 'tool') {
    send({
      tool_calls: [
        {
          index: 0,
          id: `q-${++sequence}`,
          type: 'function',
          function: {
            name: 'ask_user_question',
            arguments: JSON.stringify({
              questions: [
                {
                  id: 'one',
                  prompt: '选择一种颜色',
                  type: 'single_select',
                  required: true,
                  options: [
                    { id: 'blue', label: '蓝色', recommended: true },
                    { id: 'green', label: '绿色' }
                  ]
                },
                {
                  id: 'many',
                  prompt: '选择两个水果',
                  type: 'multi_select',
                  required: true,
                  min_selections: 2,
                  options: [
                    { id: 'apple', label: '苹果', recommended: true },
                    { id: 'pear', label: '梨', recommended: true }
                  ]
                },
                {
                  id: 'text',
                  prompt: '填写备注',
                  type: 'text',
                  required: true,
                  recommended_text: '默认备注'
                }
              ]
            })
          }
        }
      ]
    })
    finish('tool_calls')
    return
  }
  if (mode === 'approval' && last.role !== 'tool') {
    send({
      tool_calls: [
        {
          index: 0,
          id: `exec-${++sequence}`,
          type: 'function',
          function: {
            name: 'exec',
            arguments: JSON.stringify({
              command: 'printf TUI_APPROVAL_OK',
              execution_reason: 'Local terminal acceptance',
              possible_risk: 'Approval UI test only',
              risk_score: 10,
              filesystem_scope: 'workspace',
              filesystem_scope_reason: 'No file access'
            })
          }
        }
      ]
    })
    finish('tool_calls')
    return
  }
  if (mode === 'slow') {
    send({ content: 'TUI_RUNNING' })
    const timer = setTimeout(() => {
      if (!response.destroyed) {
        send({ content: '\nTUI_SLOW_DONE' })
        finish()
      }
    }, 1500)
    response.on('close', () => clearTimeout(timer))
    return
  }
  if (mode === 'cancel') {
    send({ content: 'TUI_CANCEL_RUNNING' })
    return
  }
  send({ role: 'assistant', reasoning_content: '检查会话与终端状态。' })
  send({ content: '你好，ati 终端。\n\n```ts\nconst answer = 42\n```\n\n' })
  send({ content: `TUI_DONE_${requests.length}` })
  finish()
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))

let active
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(predicate, label, timeout = 15000) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`Timeout: ${label}\n${active?.screen()}`)
    await delay(25)
  }
}
function launch(resume) {
  const emulator = new xterm.Terminal({
    cols: 100,
    rows: 30,
    allowProposedApi: true,
    scrollback: 5000
  })
  const child = spawn(
    'python3',
    [
      '-u',
      resolve('scripts/lib/tui-pty.py'),
      process.execPath,
      resolve('scripts/run-cli.mjs'),
      'tui',
      '--profile-dir',
      profile,
      '--workspace',
      workspace,
      ...(resume ? ['--resume', resume] : [])
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  )
  const decoder = new StringDecoder('utf8')
  let raw = ''
  let exit
  let failure = ''
  child.stderr.on('data', (d) => {
    failure += d.toString()
  })
  createInterface({ input: child.stdout }).on('line', (line) => {
    const event = JSON.parse(line)
    if (event.data) {
      const data = decoder.write(Buffer.from(event.data, 'base64'))
      raw += data
      emulator.write(data)
    }
    if (event.exit !== undefined) exit = event.exit
  })
  child.on('error', (error) => {
    failure = error.message
  })
  const screen = () =>
    Array.from(
      { length: emulator.buffer.active.length },
      (_, i) => emulator.buffer.active.getLine(i)?.translateToString(true) ?? ''
    ).join('\n')
  active = {
    child,
    emulator,
    screen,
    send: (write) => child.stdin.write(`${JSON.stringify({ write })}\n`),
    resize: (cols, rows) => {
      emulator.resize(cols, rows)
      child.stdin.write(`${JSON.stringify({ resize: [rows, cols] })}\n`)
    },
    get raw() {
      return raw
    },
    get exit() {
      return exit
    },
    get failure() {
      return failure
    }
  }
  return active
}
async function quit(tui) {
  tui.send('/quit\r')
  await waitFor(() => tui.exit !== undefined, 'terminal exit')
  assert.equal(tui.exit, 0, tui.failure)
  assert.ok(tui.raw.includes('\x1b[?2004l'), 'bracketed paste not restored')
  assert.ok(tui.raw.includes('\x1b[?25h'), 'cursor not restored')
  await writeFile(join(root, `terminal-${sequence++}.ansi`), tui.raw)
}
async function snapshot(tui, name, light = false) {
  await delay(100)
  const escape = (text) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const buffer = tui.emulator.buffer.active
  const palette = [
    '#000000',
    '#cc5555',
    '#55aa55',
    '#aa8800',
    '#4477cc',
    '#aa55aa',
    '#339999',
    '#cccccc',
    '#777777',
    '#ff6666',
    '#77cc77',
    '#ddbb44',
    '#7799ee',
    '#cc88cc',
    '#77cccc',
    '#ffffff'
  ]
  const cssColor = (value, rgb) => {
    if (rgb) return `#${value.toString(16).padStart(6, '0')}`
    if (value < 16) return palette[value]
    if (value >= 232) {
      const gray = 8 + (value - 232) * 10
      return `rgb(${gray},${gray},${gray})`
    }
    const level = [0, 95, 135, 175, 215, 255],
      n = value - 16
    return `rgb(${level[Math.floor(n / 36)]},${level[Math.floor(n / 6) % 6]},${level[n % 6]})`
  }
  const lines = []
  const textLines = []
  for (let y = buffer.baseY; y < buffer.baseY + tui.emulator.rows; y++) {
    const line = buffer.getLine(y)
    textLines.push(line?.translateToString(true) ?? '')
    let html = ''
    for (let x = 0; x < tui.emulator.cols; x++) {
      const cell = line?.getCell(x)
      if (!cell || cell.getWidth() === 0) continue
      const styles = []
      if (!cell.isFgDefault()) styles.push(`color:${cssColor(cell.getFgColor(), cell.isFgRGB())}`)
      if (!cell.isBgDefault())
        styles.push(`background:${cssColor(cell.getBgColor(), cell.isBgRGB())}`)
      if (cell.isBold()) styles.push('font-weight:bold')
      if (cell.isDim()) styles.push('opacity:.7')
      html += `<span style="${styles.join(';')}">${escape(cell.getChars() || ' ')}</span>`
    }
    lines.push(html)
  }
  await writeFile(join(root, `${name}.txt`), textLines.join('\n'))
  await writeFile(
    join(root, `${name}.html`),
    `<!doctype html><meta charset="utf-8"><title>ati TUI actual PTY capture</title><style>body{margin:0;background:${light ? '#f9f9f9' : '#202126'};color:${light ? '#24272c' : '#dde0e5'};padding:24px}pre{margin:0;font:14px/1.5 Menlo,monospace;white-space:pre}</style><pre>${lines.join('\n')}</pre>`
  )
}
try {
  let tui = launch()
  await waitFor(() => tui.screen().includes('No model selected'), 'initial profile startup')
  await quit(tui)
  const db = new DatabaseSync(join(profile, 'chat.db'))
  const now = Date.now()
  db.prepare(
    'INSERT INTO provider_definitions (id,display_name,adapter_plugin_id,created_at,updated_at) VALUES (?,?,?,?,?)'
  ).run('local', 'Local', 'openai-chat-compatible-adapter', now, now)
  db.prepare(
    'INSERT INTO provider_accounts (id,provider_id,label,api_url,api_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
  ).run(
    'local',
    'local',
    'Local',
    `http://127.0.0.1:${server.address().port}/v1`,
    'local-tui-secret',
    now,
    now
  )
  db.prepare(
    'INSERT INTO provider_models (account_id,model_id,label,type,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
  ).run('local', 'local-model', 'Local Model', 'llm', 1, now, now)
  const config = JSON.parse(
    db.prepare("SELECT value FROM configs WHERE key='appConfig'").get().value
  )
  config.tools = {
    ...config.tools,
    mainModel: { accountId: 'local', modelId: 'local-model' },
    memoryEnabled: false
  }
  config.compression = { ...config.compression, enabled: false }
  db.prepare("UPDATE configs SET value=? WHERE key='appConfig'").run(JSON.stringify(config))
  db.close()
  tui = launch()
  await waitFor(() => tui.screen().includes('local-model'), 'configured model')
  await snapshot(tui, 'welcome-dark')
  tui.send('/model\r')
  await waitFor(() => tui.screen().includes('Type to filter'), 'searchable model picker')
  tui.send('Local')
  await snapshot(tui, 'model-picker-dark')
  tui.send('\r')
  await delay(100)
  tui.send('/help\r')
  await waitFor(() => tui.screen().includes('Commands and shortcuts'), 'command palette')
  await snapshot(tui, 'help-dark')
  tui.send('\x1b')
  await delay(100)
  tui.send('记住代号青松\r')
  await waitFor(
    () => tui.screen().includes('TUI_DONE_1') && tui.screen().includes('Completed'),
    'first turn'
  )
  tui.send('代号是什么？\r')
  await waitFor(() => tui.screen().includes('TUI_DONE_2'), 'second turn')
  assert.ok(requests[1].messages.some((m) => m.role === 'user' && m.content === '记住代号青松'))
  assert.ok(
    requests[1].messages.some((m) => m.role === 'assistant' && m.content.includes('TUI_DONE_1'))
  )
  assert.ok(requests[1].tools.some((t) => t.function.name === 'ask_user_question'))
  mode = 'question'
  tui.send('提出问题\r')
  await waitFor(() => tui.screen().includes('选择一种颜色'), 'single select question')
  await snapshot(tui, 'question-dark')
  tui.send('2\r')
  await waitFor(() => tui.screen().includes('选择两个水果'), 'multi select question')
  tui.send('1,2\r')
  await waitFor(() => tui.screen().includes('填写备注'), 'text question')
  tui.send('中文备注\r')
  await waitFor(() => requests.at(-1).messages.at(-1).role === 'tool', 'question response')
  assert.ok(JSON.stringify(requests.at(-1).messages.at(-1)).includes('中文备注'))
  await waitFor(() => tui.screen().includes(`TUI_DONE_${requests.length}`), 'question completed')
  mode = 'approval'
  tui.send('请求批准\r')
  await waitFor(() => tui.screen().includes('Allow this action'), 'manual approval')
  await snapshot(tui, 'approval-dark')
  tui.send('\x1b[B\r')
  await waitFor(
    () =>
      requests
        .at(-1)
        .messages.some(
          (m) => m.role === 'tool' && JSON.stringify(m.content).includes('TUI_APPROVAL_OK')
        ),
    'approved command result'
  )
  assert.ok(
    requests
      .at(-1)
      .messages.some(
        (m) => m.role === 'tool' && JSON.stringify(m.content).includes('TUI_APPROVAL_OK')
      )
  )
  await waitFor(() => tui.screen().includes(`TUI_DONE_${requests.length}`), 'approval completed')
  await snapshot(tui, 'dark-wide')
  tui.send('/theme\r')
  tui.resize(45, 24)
  await delay(250)
  await snapshot(tui, 'light-narrow', true)
  assert.ok(!tui.screen().includes('�'), 'PTY capture contains broken UTF-8')
  tui.resize(100, 30)
  const beforeQueue = requests.length
  mode = 'slow'
  tui.send('TUI_SLOW_START\r')
  await waitFor(() => tui.screen().includes('TUI_RUNNING'), 'stream before steering')
  tui.send('TUI_STEER_INPUT\r')
  tui.send('TUI_FOLLOW_INPUT\x1b\r')
  await waitFor(() => requests.length >= beforeQueue + 3, 'steering and follow-up delivery')
  assert.ok(
    requests[beforeQueue + 1].messages.some(
      (m) => m.role === 'user' && JSON.stringify(m.content).includes('TUI_STEER_INPUT')
    )
  )
  assert.ok(
    requests[beforeQueue + 2].messages.some(
      (m) => m.role === 'user' && JSON.stringify(m.content).includes('TUI_FOLLOW_INPUT')
    )
  )
  await waitFor(() => /^\s*Completed\s*$/m.test(tui.screen().slice(-3000)), 'queued runs finish')
  mode = 'cancel'
  tui.send('开始等待\r')
  await waitFor(() => tui.screen().includes('TUI_CANCEL_RUNNING'), 'cancel stream')
  tui.send('不要丢失这条指令\r')
  await waitFor(() => tui.screen().includes('Steering'), 'steering queue')
  tui.send('\x03')
  await waitFor(
    () => tui.screen().includes('Stopped') && tui.screen().includes('Returned'),
    'cancel and return steering'
  )
  await quit(tui)
  const finalDb = new DatabaseSync(join(profile, 'chat.db'))
  const session = finalDb.prepare('SELECT uuid FROM chats ORDER BY update_time DESC LIMIT 1').get()
  finalDb.close()
  tui = launch(session.uuid)
  await waitFor(() => tui.screen().includes('不要丢失这条指令'), 'resume pending input')
  assert.ok(tui.screen().includes('TUI_DONE_1'), 'persisted transcript missing')
  await quit(tui)
  await writeFile(
    join(root, 'summary.json'),
    JSON.stringify(
      {
        passed: true,
        requests: requests.length,
        auxiliaryRequests: auxiliaryRequests.length,
        checks: [
          'real Electron PTY',
          'multi-turn payload',
          'manual approval',
          'single/multi/text question',
          'CJK',
          'resize',
          'Light/Dark',
          'cancellation',
          'steering and follow-up delivery',
          'steering returned',
          'session and pending input resume',
          'terminal restoration'
        ]
      },
      null,
      2
    )
  )
  console.log(`TUI verification passed: ${root}`)
} finally {
  await writeFile(join(root, 'requests.json'), JSON.stringify(requests, null, 2))
  active?.child.stdin.end()
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
}
