import { resolve } from 'path'
// @ts-ignore
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
// @ts-ignore
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'

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
    plugins: [
      react(),
      mdx({
        providerImportSource: '@mdx-js/react', // Important for React integration
        // You can also add remarkPlugins and rehypePlugins here for advanced processing
      }),
    ],
    define: {
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
    }
  }
})
