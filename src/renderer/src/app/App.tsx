import Home from '@renderer/app/shell/Home'
import { ThemeProvider } from '@renderer/shared/providers/ThemeProvider'
import { useEffect } from 'react'
import { STARTUP_RENDERER_READY } from '@shared/constants/startup'
import { rendererStartupTracer } from '@renderer/shared/lib/startupTracer'
import { hydrateDeferredAppConfig } from '@renderer/infrastructure/config/appConfig'

import type { JSX } from "react";

function App(): JSX.Element {
  useEffect(() => {
    window.electron?.ipcRenderer?.send(STARTUP_RENDERER_READY)
    rendererStartupTracer.mark('app.mounted')
    void hydrateDeferredAppConfig()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rendererStartupTracer.mark('first.paint')
      })
    })
  }, [])

  return (
    <ThemeProvider>
      <Home />
    </ThemeProvider>
  )
}

export default App
