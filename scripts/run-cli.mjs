/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const entryPath = resolve(scriptDirectory, '..', 'out', 'main', 'cli.js')

try {
  await access(entryPath, fsConstants.R_OK)
} catch {
  process.stderr.write('CLI bundle is missing. Run `pnpm build` before `pnpm cli`.\n')
  process.exitCode = 1
  process.exit()
}

const child = spawn(electronPath, [entryPath, ...process.argv.slice(2)], {
  env: process.env,
  stdio: 'inherit'
})

/** @type {(signal: NodeJS.Signals) => void} */
const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal)
}
process.on('SIGINT', forwardSignal)
process.on('SIGTERM', forwardSignal)

child.once('error', (error) => {
  process.stderr.write(`Unable to start Electron CLI: ${error.message}\n`)
  process.exitCode = 1
})

child.once('close', (code, signal) => {
  process.off('SIGINT', forwardSignal)
  process.off('SIGTERM', forwardSignal)
  if (code !== null) {
    process.exitCode = code
    return
  }
  process.exitCode = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1
})
