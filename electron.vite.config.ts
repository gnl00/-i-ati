import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@constants': resolve('src/constants'),
        '~types': resolve('src/types'),
        '@request': resolve('src/request'),
        '@config': resolve('src/config'),
        '@resources': resolve('resources'),
        '@tools': resolve('src/llmTools')
      }
    },
    plugins: [react()],
    define: {
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
    }
  }
})
