import type { ToolDefinition } from '@shared/tools/registry'

export const fileOperationsTools = [
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read the contents of a text file from the local filesystem. Use this after locating the target file or line range.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to read.'
          },
          encoding: {
            type: 'string',
            description: 'The file encoding (default: utf-8).',
            default: 'utf-8'
          },
          start_line: {
            type: 'number',
            description: 'Optional: The line number to start reading from (1-indexed).'
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
            description: 'Optional: Maximum number of lines to return when using around_line or when no explicit range is provided. Defaults to 200.'
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
      name: 'read_media',
      description: 'Read a media file (image, video, audio, etc.) and return its content as a base64 encoded string with MIME type information.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the media file to read.'
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
      description: 'Write content to a file on the local filesystem. Can create parent directories and back up existing files.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to write.'
          },
          content: {
            type: 'string',
            description: 'The content to write to the file.'
          },
          encoding: {
            type: 'string',
            description: 'The file encoding (default: utf-8).',
            default: 'utf-8'
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
        required: ['file_path', 'content'],
        $schema: 'http://json-schema.org/draft-07/schema#'
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Edit a file by searching for a pattern and replacing it with new content. Supports both string and regex matching.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to edit.'
          },
          search: {
            type: 'string',
            description: 'The text or pattern to search for.'
          },
          replace: {
            type: 'string',
            description: 'The text to replace the matched content with.'
          },
          regex: {
            type: 'boolean',
            description: 'Whether to use regex for searching (default: false).',
            default: false
          },
          all: {
            type: 'boolean',
            description: 'Whether to replace all occurrences (default: false, only first match).',
            default: false
          }
        },
        required: ['file_path', 'search', 'replace'],
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
            description: 'The file or directory path to search in.'
          },
          pattern: {
            type: 'string',
            description: 'The text or regex pattern to search for.'
          },
          regex: {
            type: 'boolean',
            description: 'Whether to use regex for searching (default: false).',
            default: false
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
            description: 'The directory path to list.'
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
            description: 'The root directory path to search from.'
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
            description: 'The root directory path.'
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
            description: 'Absolute path to the target file or directory.'
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
            description: 'The directory path to create.'
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
            description: 'Source file or directory path.'
          },
          destination_path: {
            type: 'string',
            description: 'Destination file or directory path.'
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
