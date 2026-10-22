import type { ToolDefinition } from '@shared/tools/registry'

export const commandTools = [
  {
    type: 'function',
    function: {
      name: 'exec',
      description: 'Run a workspace shell command; dangerous commands require user confirmation. Returns stdout, stderr, exit code, duration, and structured failure/recovery details.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command.'
          },
          execution_reason: {
            type: 'string',
            description: 'Why now and the concrete task outcome.'
          },
          possible_risk: {
            type: 'string',
            description: 'Risks or side effects, including low risks.'
          },
          risk_score: {
            type: 'number',
            description: '0: no meaningful risk; 10: highly destructive or irreversible.',
            minimum: 0,
            maximum: 10
          },
          filesystem_scope: {
            type: 'string',
            enum: ['workspace', 'outside_workspace', 'unknown'],
            description: 'Filesystem access boundary. Use unknown when expansion, variables, scripts, or command behavior obscure it.'
          },
          filesystem_scope_reason: {
            type: 'string',
            description: 'Justify filesystem_scope, including outside paths and uncertainty.'
          },
          cwd: {
            type: 'string',
            description: 'Workspace-relative cwd. Absolute paths and parent traversal require explicit user approval.'
          },
          timeout: {
            type: 'number',
            description: 'Milliseconds before killing the command.',
            default: 30000,
            minimum: 1,
            maximum: 86400000
          },
          env: {
            type: 'object',
            description: 'Extra environment. Loading overrides (PATH, BASH_ENV, ENV, NODE_OPTIONS) require explicit user approval; approved PATH overrides inherited PATH.',
            additionalProperties: {
              type: 'string'
            }
          }
        },
        required: ['command', 'execution_reason', 'possible_risk', 'risk_score', 'filesystem_scope', 'filesystem_scope_reason'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default commandTools
