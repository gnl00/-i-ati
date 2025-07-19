import { resolve } from 'path'
// @ts-ignore
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
// @ts-ignore
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@constants': resolve('src/constants'),
        '~types': resolve('src/types'),
        '@request': resolve('src/request'),
        '@config': resolve('src/config'),
        '@resources': resolve('resources')
      }
    },
    plugins: [react()],
    define: {
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
    }
  }
})
