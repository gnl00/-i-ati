import { app } from 'electron'
import { installCliConsoleCapture, runCliApplication } from './app/CliApplication'

installCliConsoleCapture()

void runCliApplication().then((exitCode) => {
  app.exit(exitCode)
}).catch((error) => {
  try {
    process.stderr.write(`CLI failed: ${error instanceof Error ? error.message : String(error)}\n`)
  } catch {
    // Process teardown can close stderr before this fallback runs.
  }
  app.exit(1)
})
