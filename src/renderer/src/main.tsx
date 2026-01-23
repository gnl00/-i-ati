import './assets/main.css'
import 'remixicon/fonts/remixicon.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { rendererStartupTracer } from '@renderer/utils/startupTracer'
import { initializeAppConfig, useAppConfigStore } from './store/appConfig'

rendererStartupTracer.mark('renderer.boot')

// 初始化配置 (从 SQLite 加载)
await initializeAppConfig()
rendererStartupTracer.mark('config.loaded')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
