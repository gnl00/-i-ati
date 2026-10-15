import type { ToolDefinition } from '@shared/tools/registry'

export const skillTools = [
  {
    type: 'function',
    function: {
      name: 'install_skill',
      description: 'Install a skill from a URL or local path (supports SKILL.md, skill directory, zip/tar archives).',
      parameters: {
        type: 'object',
        properties: {
          source: {
            type: 'string',
            description: 'URL or local path to SKILL.md or a skill directory.'
          },
          name: {
            type: 'string',
            description: 'Expected skill name to validate.'
          },
          allowOverwrite: {
            type: 'boolean',
            description: 'Overwrite an existing installed skill with the same name.',
            default: false
          }
        },
        required: ['source'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'load_skill',
      description: 'Activate an available skill and return its SKILL.md instructions and skill_root. Also returns the instructions when already active. Use them directly without rereading SKILL.md; read_skill_file is for additional files or missing content.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Installed skill name to load.'
          }
        },
        required: ['name'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'import_skills',
      description: 'Import all skills found in a folder recursively. Handles conflicts by renaming when needed.',
      parameters: {
        type: 'object',
        properties: {
          folderPath: {
            type: 'string',
            description: 'Folder path to scan recursively for SKILL.md based skills.'
          }
        },
        required: ['folderPath'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'unload_skill',
      description: 'Remove a previously loaded skill from the current chat (does not uninstall).',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Skill name to unload.'
          }
        },
        required: ['name'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_skill_file',
      description: 'Read a file or list a directory inside an available skill. Paths are relative to the skill root.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Installed skill name.'
          },
          path: {
            type: 'string',
            description: 'Relative path inside the skill directory (e.g. SKILL.md, references/REFERENCE.md, scripts, or . for the skill root).'
          },
          encoding: {
            type: 'string',
            description: 'Text encoding (default: utf-8).'
          },
          start_line: {
            type: 'integer',
            description: 'Optional 1-based start line.'
          },
          end_line: {
            type: 'integer',
            description: 'Optional 1-based end line.'
          },
          max_entries: {
            type: 'integer',
            description: 'Maximum number of directory entries to return when path is a directory (default: 100, max: 500).',
            minimum: 1,
            maximum: 500
          }
        },
        required: ['name', 'path'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_skill_script',
      description: 'Run a shell command for a script bundled inside an available skill. Resolves the script in place and provides SKILL_ROOT and SKILL_SCRIPT environment variables. Select the interpreter in command. Defaults to the current task workspace; use cwd to override. Reuses exec execution, output, cancellation and approval behavior.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Installed skill name.'
          },
          script: {
            type: 'string',
            description: 'Relative script path inside the skill directory, e.g. scripts/amap.ts.'
          },
          command: {
            type: 'string',
            description: 'Complete shell command including the interpreter and arguments. POSIX example: node "$SKILL_SCRIPT" render diagrams/example.json. Windows cmd example: node "%SKILL_SCRIPT%" render diagrams/example.json. Quote script paths; no executable permission is needed when using an interpreter.'
          },
          cwd: {
            type: 'string',
            description: 'Working directory, absolute or relative to the task workspace. Defaults to the task workspace. To run from the skill directory, pass skill_root returned by load_skill. Scripts and resources remain in their installed location.'
          },
          env: {
            type: 'object',
            description: 'Additional environment variables. SKILL_ROOT and SKILL_SCRIPT are set by the runtime and cannot be overridden.',
            additionalProperties: {
              type: 'string'
            }
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 30000).',
            default: 30000
          }
        },
        required: ['name', 'script', 'command'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default skillTools
