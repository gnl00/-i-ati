import type { ToolDefinition } from '@shared/tools/registry'

export default [
  {
    type: 'function',
    function: {
      name: 'list_plugins',
      description: 'List installed plugins with pluginId, name, source, enabled state, version, status, and capabilities.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plugin_install',
      description: 'Install a local plugin from a directory containing plugin.json.',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'Absolute or workspace-relative path to a local plugin directory.'
          }
        },
        additionalProperties: false,
        required: ['source']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plugin_uninstall',
      description: 'Uninstall an installed local plugin by pluginId. Built-in adapters cannot be uninstalled.',
      parameters: {
        type: 'object',
        properties: {
          pluginId: {
            type: 'string',
            description: 'Installed local plugin id to uninstall.'
          }
        },
        additionalProperties: false,
        required: ['pluginId']
      }
    }
  }
] satisfies ToolDefinition[]
