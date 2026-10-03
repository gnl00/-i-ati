import type { ToolDefinition } from '@shared/tools/registry'

export const fileOperationsTools = [
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read a UTF-8 text file and its file_version for guarded edits or writes. The text view excludes a UTF-8 BOM and displays pure CRLF files with LF line endings; mixed line endings remain exact. When scanning sequentially, use window_size=300 and continue with next_start_line and next_start_column from each truncated result.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Workspace path to the file to read. Accepts a relative path or a native absolute path inside the workspace. Use "." for the workspace root.'
          },
          start_line: {
            type: 'number',
            description: 'Optional: The line number to start reading from (1-indexed).'
          },
          start_column: {
            type: 'number',
            description: 'Optional: The column to start reading from on start_line (1-indexed). Use next_start_column when continuing a character-limited read.'
          },
          end_line: {
            type: 'number',
            description: 'Optional: The line number to stop reading at (inclusive).'
          },
          around_line: {
            type: 'number',
            description: 'Optional: Center the read around this 1-indexed line number. Ignored when start_line or end_line is provided.'
          },
          window_size: {
            type: 'number',
            description: 'Optional: Maximum number of lines to return, including explicit ranges. Defaults to 500 without an explicit range; explicit ranges default to the maximum of 1500. The complete model-visible result is capped at 32000 characters. Use next_start_line and next_start_column to continue truncated reads.'
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
      description: 'Write UTF-8 text to a workspace file. Existing files require the file_version from read as expected_version; use expected_version=null only to create a missing file. Can create parent directories and back up existing files.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Workspace path to the file to write. Accepts a relative path or a native absolute path inside the workspace.'
          },
          content: {
            type: 'string',
            description: 'The content to write to the file.'
          },
          expected_version: {
            type: ['string', 'null'],
            description: 'The exact file_version returned by read for an existing file, or null to require that the file does not exist.'
          },
          create_dirs: {
            type: 'boolean',
            description: 'Whether to automatically create parent directories (default: true).',
            default: true
          },
          backup: {
            type: 'boolean',
            description: 'Whether to create a backup of the existing file (default: false).',
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
      description: 'Apply literal text edits to a UTF-8 file at the expected_version returned by read. Every search must match exactly once in the same original text view and matched blocks must not overlap. All blocks are validated before one write. Returns diagnostics for missing, ambiguous, or overlapping blocks.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Workspace path to the file to edit. Accepts a relative path or a native absolute path inside the workspace.'
          },
          expected_version: {
            type: 'string',
            description: 'The exact file_version returned by read. Re-read the file if its version has changed.'
          },
          edits: {
            type: 'array',
            minItems: 1,
            description: 'Independent edits matched against the same original Read text view. Include enough context for each search to be unique. For pure CRLF files, use LF line endings in search and replace; mixed line endings remain exact.',
            items: {
              type: 'object',
              properties: {
                search: {
                  type: 'string',
                  minLength: 1,
                  description: 'The exact non-empty text block to replace. No regex or automatic normalization.'
                },
                replace: {
                  type: 'string',
                  description: 'The literal replacement text, without a UTF-8 BOM.'
                }
              },
              required: ['search', 'replace'],
              additionalProperties: false
            }
          },
          dry_run: {
            type: 'boolean',
            description: 'When true, report matches and diagnostics without writing the file.',
            default: false
          },
          max_diagnostics: {
            type: 'number',
            description: 'Maximum number of diagnostic matches or nearest candidates to return. Defaults to 5.'
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
      description: 'Search for a pattern in a file or directory tree and return matching lines with file paths, line numbers, and positions.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace file or directory path to search in. Accepts a relative path or a native absolute path inside the workspace.'
          },
          pattern: {
            type: 'string',
            description: 'The text or regex pattern to search for.'
          },
          regex: {
            type: 'boolean',
            description: 'Whether to use regex for searching (default: true). Set false for literal text search.',
            default: true
          },
          case_sensitive: {
            type: 'boolean',
            description: 'Whether the search should be case-sensitive (default: true).',
            default: true
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 100).',
            default: 100
          },
          file_pattern: {
            type: 'string',
            description: 'Optional regex pattern to filter file names when path is a directory.'
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
      description: 'List files and directories in a given path. Use this to inspect a directory before reading or editing files.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace directory path to list. Accepts a relative path or a native absolute path inside the workspace. Use "." for the workspace root.'
          },
          details: {
            type: 'boolean',
            description: 'Whether to include file sizes and modification timestamps.',
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
      description: 'Find files or directories by glob-style path pattern, such as src/**/*.ts or **/*.test.ts.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace root directory path to search from. Accepts a relative path or a native absolute path inside the workspace.'
          },
          pattern: {
            type: 'string',
            description: 'The glob pattern to match relative paths against.'
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results to return (default: 100).',
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
      description: 'Show a directory tree starting from a given path. Use this for quick structural inspection of a workspace subtree.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace root directory path. Accepts a relative path or a native absolute path inside the workspace.'
          },
          max_depth: {
            type: 'number',
            description: 'Optional maximum tree depth.'
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
      description: 'Get file or directory metadata such as size, type, timestamps, and permissions.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Workspace path to the target file or directory. Accepts a relative path or a native absolute path inside the workspace.'
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
      description: 'Create a directory in the local filesystem. Use recursive=true when parent directories may not exist.',
      parameters: {
        type: 'object',
        properties: {
          directory_path: {
            type: 'string',
            description: 'Workspace directory path to create. Accepts a relative path or a native absolute path inside the workspace.'
          },
          recursive: {
            type: 'boolean',
            description: 'Whether to create missing parent directories.',
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
      description: 'Move or rename a file or directory on the local filesystem.',
      parameters: {
        type: 'object',
        properties: {
          source_path: {
            type: 'string',
            description: 'Workspace source file or directory path. Accepts a relative path or a native absolute path inside the workspace.'
          },
          destination_path: {
            type: 'string',
            description: 'Workspace destination file or directory path. Accepts a relative path or a native absolute path inside the workspace.'
          },
          overwrite: {
            type: 'boolean',
            description: 'Whether to overwrite the destination when it already exists.',
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
