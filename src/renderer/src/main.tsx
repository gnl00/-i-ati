import './assets/main.css'
import 'remixicon/fonts/remixicon.css'
import 'katex/dist/katex.min.css'
// Import speed-highlight theme for code highlighting
import '@speed-highlight/core/themes/atom-dark.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeAppConfig, useAppConfigStore } from './store/appConfig'

// 初始化配置 (从 SQLite 加载)
await initializeAppConfig()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
