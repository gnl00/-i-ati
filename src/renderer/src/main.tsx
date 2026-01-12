import './assets/main.css'
import 'remixicon/fonts/remixicon.css'
import 'katex/dist/katex.min.css'
// Import speed-highlight theme for code highlighting
import '@speed-highlight/core/themes/atom-dark.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeEmbeddedTools } from '@tools/index'
import { initializeAppConfig, useAppConfigStore } from './store/appConfig'

// 初始化配置 (从 SQLite 加载)
await initializeAppConfig()

// 初始化 embedded tools (传入配置以条件性地注册工具)
const config = useAppConfigStore.getState().getAppConfig()
initializeEmbeddedTools(config)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
