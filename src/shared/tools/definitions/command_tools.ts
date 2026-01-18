export default [
  {
    "type": "function",
    "function": {
      "name": "execute_command",
      "description": "Execute a shell command in the workspace directory. Dangerous commands (like 'rm -rf', 'dd', etc.) will require user confirmation before execution. Returns stdout, stderr, exit code, and execution time.",
      "parameters": {
        "type": "object",
        "properties": {
          "command": {
            "type": "string",
            "description": "The shell command to execute (e.g., 'npm install', 'git status', 'ls -la')"
          },
          "cwd": {
            "type": "string",
            "description": "Working directory relative to workspace base directory (optional). If not specified, uses the workspace root."
          },
          "timeout": {
            "type": "number",
            "description": "Timeout in milliseconds (default: 30000). The command will be killed if it exceeds this time.",
            "default": 30000
          },
          "env": {
            "type": "object",
            "description": "Additional environment variables to set for the command execution (optional)",
            "additionalProperties": {
              "type": "string"
            }
          }
        },
        "required": ["command"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]
