import react from '@vitejs/plugin-react'
import { builtinModules } from 'node:module'
import { defineConfig } from 'electron-vite'
import tailwindcss from "@tailwindcss/vite"
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

const mainExternalPackages = [
  'electron',
  '@xenova/transformers',
  'better-sqlite3',
  'sqlite-vec',
  'onnxruntime-node'
]

const mainExternal = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  ...mainExternalPackages
]

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: mainExternal
      }
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@request': resolve('src/main/request'),
        '@shared': resolve('src/shared'),
        '@tools': resolve('src/shared/tools'),
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
        '@tools': resolve('src/shared/tools')
      }
    },
    plugins: [react(), tailwindcss()],
    define: {
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            katex: ['katex'],
            codemirror: [
              '@codemirror/state',
              '@codemirror/view',
              '@codemirror/language',
              '@codemirror/lang-json',
              '@uiw/react-codemirror'
            ],
            markdown: [
              'react-markdown',
              'remark-gfm',
              'remark-math',
              'rehype-katex',
              'rehype-raw'
            ],
            motion: ['framer-motion']
          }
        },
        plugins: process.env.ANALYZE
          ? [
              visualizer({
                filename: 'stats/renderer-bundle.html',
                gzipSize: true,
                brotliSize: true,
                open: true,
                template: 'treemap'
              })
            ]
          : []
      }
    }
  }
})
