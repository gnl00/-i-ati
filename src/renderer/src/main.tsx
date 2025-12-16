import './assets/main.css'
import 'remixicon/fonts/remixicon.css'
import 'katex/dist/katex.min.css'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeEmbeddedTools } from '@tools/index'

// 初始化 embedded tools
initializeEmbeddedTools()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
