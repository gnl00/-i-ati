import './shared/assets/main.css'
import 'remixicon/fonts/remixicon.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { rendererStartupTracer } from '@renderer/shared/lib/startupTracer'
import { installRendererConsoleCapture } from '@renderer/shared/logging/rendererLogger'
import { initializeAppConfig } from './infrastructure/config/appConfig'
import { useAppConfigStore } from './infrastructure/config/appConfig'
import { useChatStore } from './features/chat'
import { configureRendererToolRuntimeContext } from './infrastructure/tools/runtimeContext'

installRendererConsoleCapture()
rendererStartupTracer.mark('renderer.boot')

// 初始化配置 (从 SQLite 加载)
await initializeAppConfig()
rendererStartupTracer.mark('config.loaded')

configureRendererToolRuntimeContext({
  getCurrentChatUuid: () => useChatStore.getState().currentChatUuid ?? undefined,
  getMaxWebSearchItems: () => useAppConfigStore.getState().appConfig?.tools?.maxWebSearchItems
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
