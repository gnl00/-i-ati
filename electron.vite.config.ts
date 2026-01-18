import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@mcp': resolve('src/mcp'),
        '@request': resolve('src/main/request'),
        '@shared': resolve('src/shared'),
        '@tools': resolve('src/shared/tools'),
        '@main-tools': resolve('src/main/tools')
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@constants': resolve('src/constants'),
        '~types': resolve('src/types'),
        '@config': resolve('src/config'),
        '@resources': resolve('resources'),
        '@shared': resolve('src/shared'),
        '@tools': resolve('src/shared/tools'),
        '@renderer-tools': resolve('src/renderer/src/tools')
      }
    },
    plugins: [react()],
    define: {
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
    }
  }
})
