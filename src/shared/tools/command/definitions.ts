import type { ToolDefinition } from '@shared/tools/registry'

export const commandTools = [
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: "Execute a shell command in the workspace directory. Dangerous commands (like 'rm -rf', 'dd', etc.) will require user confirmation before execution. Returns stdout, stderr, exit code, and execution time.",
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: "The shell command to execute (e.g., 'npm install', 'git status', 'ls -la')"
          },
          execution_reason: {
            type: 'string',
            description: 'Why this command needs to be executed right now. Be concrete about the intended task outcome.'
          },
          possible_risk: {
            type: 'string',
            description: 'Possible risks or side effects of running this command, even if the risk seems low.'
          },
          risk_score: {
            type: 'number',
            description: 'Risk score from 0 to 10. Use 0 for no meaningful risk, 10 for highly destructive or irreversible actions.',
            minimum: 0,
            maximum: 10
          },
          filesystem_scope: {
            type: 'string',
            enum: ['workspace', 'outside_workspace', 'unknown'],
            description: "Declare whether this command's filesystem access stays inside the current workspace. Use outside_workspace for paths such as ~/.zshrc or /etc/hosts. Use unknown when shell expansion, variables, scripts, or command behavior make the boundary unclear."
          },
          filesystem_scope_reason: {
            type: 'string',
            description: 'Explain why the declared filesystem_scope is accurate. Mention any outside-workspace paths or uncertainty.'
          },
          cwd: {
            type: 'string',
            description: 'Working directory relative to the workspace root (optional). Absolute paths and parent traversal require explicit user approval.'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 30000). The command will be killed if it exceeds this time.',
            default: 30000,
            minimum: 1,
            maximum: 86400000
          },
          env: {
            type: 'object',
            description: 'Additional environment variables for the command (optional). Executable or runtime loading overrides such as PATH, BASH_ENV, ENV, and NODE_OPTIONS require explicit user approval; an approved PATH takes precedence over the inherited PATH.',
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
