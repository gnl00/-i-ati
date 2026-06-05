import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath || '/tmp')
  }
}))

import { LocalPluginCatalogService } from '../LocalPluginCatalogService'

describe('LocalPluginCatalogService', () => {
  let service: LocalPluginCatalogService

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-catalog-test-'))
    service = new LocalPluginCatalogService()
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
    userDataPath = ''
  })

  it('scans valid local request payload extension manifests from the userData plugins directory', async () => {
    const pluginDir = path.join(userDataPath, 'plugins', 'deepseek-thinking')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'deepseek-thinking',
        name: 'DeepSeek Thinking',
        version: '1.0.0',
        description: 'Local test plugin',
        capabilities: [{
          kind: 'request-payload-extension',
          feature: 'thinking',
          thinking: {
            levels: ['none', 'low', 'medium', 'high'],
            defaultLevel: 'medium'
          },
          matchHints: {
            baseUrlKeywords: ['deepseek'],
            modelKeywords: ['deepseek']
          },
          patches: {
            thinking: {
              enabled: [
                { op: 'set', path: 'thinking.type', value: 'enabled' },
                {
                  op: 'setFromThinkingEffort',
                  path: 'reasoning_effort',
                  allowedValues: ['low', 'medium', 'high']
                }
              ],
              disabled: [
                { op: 'set', path: 'thinking.type', value: 'disabled' },
                { op: 'unset', path: 'reasoning_effort' }
              ]
            }
          }
        }]
      }),
      'utf-8'
    )

    const plugins = await service.scanInstalledPlugins()

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      pluginId: 'deepseek-thinking',
      displayName: 'DeepSeek Thinking',
      status: 'installed',
      capabilities: [{
        kind: 'request-payload-extension',
        feature: 'thinking',
        thinking: {
          levels: ['none', 'low', 'medium', 'high'],
          defaultLevel: 'medium'
        },
        matchHints: {
          baseUrlKeywords: ['deepseek'],
          modelKeywords: ['deepseek']
        },
        patches: {
          thinking: {
            enabled: [
              { op: 'set', path: 'thinking.type', value: 'enabled' },
              {
                op: 'setFromThinkingEffort',
                path: 'reasoning_effort',
                allowedValues: ['low', 'medium', 'high']
              }
            ],
            disabled: [
              { op: 'set', path: 'thinking.type', value: 'disabled' },
              { op: 'unset', path: 'reasoning_effort' }
            ]
          }
        }
      }]
    })
  })

  it('returns invalid local plugin entries when manifest parsing fails', async () => {
    const pluginDir = path.join(userDataPath, 'plugins', 'broken-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(path.join(pluginDir, 'plugin.json'), '{ invalid json', 'utf-8')

    const plugins = await service.scanInstalledPlugins()

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      pluginId: 'broken-plugin',
      status: 'invalid'
    })
    expect(plugins[0]?.lastError).toContain('Invalid plugin manifest')
  })

  it('returns invalid local plugin entries for retired request adapter manifests', async () => {
    const pluginDir = path.join(userDataPath, 'plugins', 'retired-adapter-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'retired-adapter-plugin',
        name: 'Retired Adapter Plugin',
        version: '1.0.0',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'openai',
          modelTypes: ['llm']
        }]
      }),
      'utf-8'
    )

    const plugins = await service.scanInstalledPlugins()

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      pluginId: 'retired-adapter-plugin',
      status: 'invalid'
    })
    expect(plugins[0]?.lastError).toContain('capabilities')
  })
})
