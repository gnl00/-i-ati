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
          cwd: {
            type: 'string',
            description: 'Working directory relative to workspace base directory (optional). If not specified, uses the workspace root.'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 30000). The command will be killed if it exceeds this time.',
            default: 30000
          },
          env: {
            type: 'object',
            description: 'Additional environment variables to set for the command execution (optional)',
            additionalProperties: {
              type: 'string'
            }
          }
        },
        required: ['command', 'execution_reason', 'possible_risk', 'risk_score'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default commandTools
