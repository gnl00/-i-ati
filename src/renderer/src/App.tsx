import HomeV2 from '@renderer/pages/HomeV2'
import { ThemeProvider } from './components/theme-provider'
import { useEffect } from 'react'
import { STARTUP_RENDERER_READY } from '@shared/constants/startup'
import { rendererStartupTracer } from '@renderer/utils/startupTracer'

import type { JSX } from "react";

function App(): JSX.Element {
  useEffect(() => {
    window.electron?.ipcRenderer?.send(STARTUP_RENDERER_READY)
    rendererStartupTracer.mark('app.mounted')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rendererStartupTracer.mark('first.paint')
      })
    })
  }, [])

  return (
    <ThemeProvider>
      <HomeV2 />
    </ThemeProvider>
  )
}

export default App
