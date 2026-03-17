import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { syncAdaptersWithPlugins, adapterManager } from '..'

describe('request adapter plugin registry', () => {
  let tempRoot = ''

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
  })

  it('registers built-in adapters for enabled plugins only', async () => {
    await syncAdaptersWithPlugins([
      {
        pluginId: 'openai-chat-compatible-adapter',
        name: 'OpenAI Chat Compatible Adapter',
        enabled: true,
        source: 'built-in',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'openai',
            modelTypes: ['llm', 'vlm', 'mllm']
          }
        }]
      },
      {
        pluginId: 'openai-image-compatible-adapter',
        name: 'OpenAI Image Compatible Adapter',
        enabled: true,
        source: 'built-in',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'openai',
            modelTypes: ['img_gen']
          }
        }]
      },
      {
        pluginId: 'claude-compatible-adapter',
        name: 'Claude Compatible Adapter',
        enabled: false,
        source: 'built-in',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'claude',
            modelTypes: ['llm', 'vlm']
          }
        }]
      }
    ])

    expect(adapterManager.listAdapters()).toEqual([
      'openai-chat-compatible-adapter',
      'openai-image-compatible-adapter'
    ])
  })

  it('registers enabled local request adapter plugins', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-plugin-test-'))
    const manifestPath = path.join(tempRoot, 'plugin.json')
    const entryPath = path.join(tempRoot, 'main.mjs')

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        id: 'gemini-compatible-adapter',
        name: 'Gemini Compatible Adapter',
        version: '1.0.0',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'gemini',
          modelTypes: ['llm', 'vlm']
        }],
        entries: {
          main: './main.mjs'
        }
      }),
      'utf-8'
    )

    await fs.writeFile(
      entryPath,
      `
      export const requestAdapter = {
        providerType: 'gemini',
        streamProtocol: 'sse',
        supportsStreamOptionsUsage: false,
        request({ request }) {
          return {
            endpoint: request.baseUrl + '/models/test:generateContent',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
            body: { model: request.model, contents: [] }
          }
        },
        parseResponse({ raw }) {
          return { id: '1', model: 'gemini', timestamp: Date.now(), content: '', finishReason: 'stop', raw }
        },
        parseStreamResponse() { return null }
      }
      `,
      'utf-8'
    )

    await syncAdaptersWithPlugins([
      {
        pluginId: 'openai-chat-compatible-adapter',
        name: 'OpenAI Chat Compatible Adapter',
        enabled: true,
        source: 'built-in',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'openai',
            modelTypes: ['llm', 'vlm', 'mllm']
          }
        }]
      },
      {
        pluginId: 'openai-image-compatible-adapter',
        name: 'OpenAI Image Compatible Adapter',
        enabled: true,
        source: 'built-in',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'openai',
            modelTypes: ['img_gen']
          }
        }]
      },
      {
        pluginId: 'gemini-compatible-adapter',
        name: 'Gemini Compatible Adapter',
        enabled: true,
        source: 'local',
        status: 'installed',
        manifestPath,
        installRoot: tempRoot,
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'gemini',
            modelTypes: ['llm', 'vlm']
          }
        }]
      }
    ])

    expect(adapterManager.listAdapters()).toContain('gemini-compatible-adapter')
  })
})
