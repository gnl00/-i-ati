import type { ToolDefinition } from '@shared/tools/registry'

export const fileOperationsTools = [
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read UTF-8 text and file_version for guarded mutations. BOM is excluded; pure CRLF displays as LF, mixed endings stay exact. For sequential scans use window_size=300 and returned next_start_line/next_start_column.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Workspace-relative or native absolute path inside the workspace; "." is the root.'
          },
          start_line: {
            type: 'number',
            description: 'First line, 1-based.'
          },
          start_column: {
            type: 'number',
            description: 'First column on start_line, 1-based; use next_start_column for continuation.'
          },
          end_line: {
            type: 'number',
            description: 'Last line, inclusive.'
          },
          around_line: {
            type: 'number',
            description: 'Center on this 1-based line; ignored with start_line/end_line.'
          },
          window_size: {
            type: 'number',
            description: 'Line cap (max 1500), including ranges: default 500, or 1500 with a range. Model result cap: 32000 characters; continue using returned next_start_line/next_start_column.'
          }
        },
        required: ['file_path'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: 'Write UTF-8 text with version protection; supports parent creation and backups.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Workspace-relative or native absolute path inside the workspace.'
          },
          content: {
            type: 'string',
            description: 'Text to write.'
          },
          expected_version: {
            type: ['string', 'null'],
            description: 'Existing file: exact file_version from read. Null requires a missing file.'
          },
          create_dirs: {
            type: 'boolean',
            description: 'Create missing parent directories.',
            default: true
          },
          backup: {
            type: 'boolean',
            description: 'Back up the existing file.',
            default: false
          }
        },
        required: ['file_path', 'content', 'expected_version'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Apply UTF-8 literal edits at expected_version. Each search must match once in the original text; blocks must not overlap. Validate all before one write; return diagnostics on failure.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Workspace-relative or native absolute path inside the workspace.'
          },
          expected_version: {
            type: 'string',
            description: 'Exact file_version from read; re-read if changed.'
          },
          edits: {
            type: 'array',
            minItems: 1,
            description: 'Unique searches against the same original read view. For pure CRLF use LF in search/replace; mixed endings stay exact.',
            items: {
              type: 'object',
              properties: {
                search: {
                  type: 'string',
                  minLength: 1,
                  description: 'Exact literal block; no regex or normalization.'
                },
                replace: {
                  type: 'string',
                  description: 'Literal replacement, without UTF-8 BOM.'
                }
              },
              required: ['search', 'replace'],
              additionalProperties: false
            }
          },
          dry_run: {
            type: 'boolean',
            description: 'Report matches/diagnostics without writing.',
            default: false
          },
          max_diagnostics: {
            type: 'number',
            description: 'Diagnostic match/nearest-candidate limit; default 5.'
          }
        },
        required: ['file_path', 'expected_version', 'edits'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search a file/tree; return matching lines with paths, line numbers, and positions.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace-relative or native absolute file/directory path inside the workspace.'
          },
          pattern: {
            type: 'string',
            description: 'Text or regex to search for.'
          },
          regex: {
            type: 'boolean',
            description: 'False selects literal search.',
            default: true
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Match case.',
            default: true
          },
          max_results: {
            type: 'number',
            description: 'Result limit.',
            default: 100
          },
          file_pattern: {
            type: 'string',
            description: 'Filename regex when searching a directory.'
          }
        },
        required: ['path', 'pattern'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ls',
      description: 'List directory entries for inspection before reading/editing.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace-relative or native absolute directory inside the workspace; "." is the root.'
          },
          details: {
            type: 'boolean',
            description: 'Include sizes and modification times.',
            default: false
          }
        },
        required: ['path'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files/directories by glob, e.g. src/**/*.ts.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace-relative or native absolute search root inside the workspace.'
          },
          pattern: {
            type: 'string',
            description: 'Glob matched against relative paths.'
          },
          max_results: {
            type: 'number',
            description: 'Result limit.',
            default: 100
          }
        },
        required: ['path', 'pattern'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tree',
      description: 'Inspect a workspace directory tree.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace-relative or native absolute root inside the workspace.'
          },
          max_depth: {
            type: 'number',
            description: 'Maximum tree depth.'
          }
        },
        required: ['path'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'stat',
      description: 'Get file/directory size, type, timestamps, and permissions.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace-relative or native absolute target inside the workspace.'
          }
        },
        required: ['path'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mkdir',
      description: 'Create a directory; recursive=true creates missing parents.',
      parameters: {
        type: 'object',
        properties: {
          directory_path: {
            type: 'string',
            description: 'Workspace-relative or native absolute directory inside the workspace.'
          },
          recursive: {
            type: 'boolean',
            description: 'Create missing parents.',
            default: false
          }
        },
        required: ['directory_path'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mv',
      description: 'Move or rename a file/directory.',
      parameters: {
        type: 'object',
        properties: {
          source_path: {
            type: 'string',
            description: 'Workspace-relative or native absolute source inside the workspace.'
          },
          destination_path: {
            type: 'string',
            description: 'Workspace-relative or native absolute destination inside the workspace.'
          },
          overwrite: {
            type: 'boolean',
            description: 'Overwrite an existing destination.',
            default: false
          }
        },
        required: ['source_path', 'destination_path'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  }
] satisfies ToolDefinition[]

export default fileOperationsTools
