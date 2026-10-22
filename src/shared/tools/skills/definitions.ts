import type { ToolDefinition } from '@shared/tools/registry'

export const skillTools = [
  {
    type: 'function',
    function: {
      name: 'load_skill',
      description: 'Activate a skill and return its SKILL.md instructions and skill_root, even when already active. Use without rereading SKILL.md; read_skill_file recovers additional/missing content.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Available skill name to load.'
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
      name: 'unload_skill',
      description: 'Remove a previously loaded skill from the current chat (keeps source files).',
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
            description: 'Available skill name.'
          },
          path: {
            type: 'string',
            description: 'Skill-relative file/directory path; "." lists the root.'
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
            description: 'Directory entry limit; default 100.',
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
      description: 'Run a bundled script in place with SKILL_ROOT and SKILL_SCRIPT. Uses exec output, cancellation and approvals. Defaults to the current task workspace; cwd overrides it.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Available skill name.'
          },
          script: {
            type: 'string',
            description: 'Skill-relative script path, e.g. scripts/amap.ts.'
          },
          command: {
            type: 'string',
            description: 'Shell command with explicit interpreter/arguments: POSIX node "$SKILL_SCRIPT"; Windows cmd node "%SKILL_SCRIPT%". Quote paths; interpreter needs no script executable bit.'
          },
          cwd: {
            type: 'string',
            description: 'Absolute or task-relative cwd; default task workspace. Use load_skill\'s skill_root for the skill directory. Resources stay in the source directory.'
          },
          env: {
            type: 'object',
            description: 'Extra variables; runtime SKILL_ROOT/SKILL_SCRIPT cannot be overridden.',
            additionalProperties: {
              type: 'string'
            }
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds.',
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
