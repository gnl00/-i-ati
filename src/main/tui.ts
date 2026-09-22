import { app } from 'electron'
import { runTuiApplication } from './app/TuiApplication'

void runTuiApplication()
  .then((code) => app.exit(code))
  .catch((error) => {
    process.stderr.write(`TUI failed: ${error instanceof Error ? error.message : String(error)}\n`)
    app.exit(1)
  })
