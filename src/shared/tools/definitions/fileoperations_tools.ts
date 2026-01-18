export default [
  {
    "type": "function",
    "function": {
      "name": "read_text_file",
      "description": "Read the contents of a text file from the local filesystem. Supports reading specific line ranges and different encodings.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "The absolute path to the file to read."
          },
          "encoding": {
            "type": "string",
            "description": "The file encoding (default: utf-8).",
            "default": "utf-8"
          },
          "start_line": {
            "type": "number",
            "description": "Optional: The line number to start reading from (1-indexed)."
          },
          "end_line": {
            "type": "number",
            "description": "Optional: The line number to stop reading at (inclusive)."
          }
        },
        "required": ["file_path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "read_media_file",
      "description": "Read a media file (image, video, audio, etc.) and return its content as base64 encoded string with MIME type information.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "The absolute path to the media file to read."
          }
        },
        "required": ["file_path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "read_multiple_files",
      "description": "Read multiple text files at once. Returns an array of file contents with their paths and metadata.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_paths": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Array of absolute file paths to read."
          },
          "encoding": {
            "type": "string",
            "description": "The file encoding (default: utf-8).",
            "default": "utf-8"
          }
        },
        "required": ["file_paths"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "write_file",
      "description": "Write content to a file on the local filesystem. Can create parent directories and backup existing files.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "The absolute path to the file to write."
          },
          "content": {
            "type": "string",
            "description": "The content to write to the file."
          },
          "encoding": {
            "type": "string",
            "description": "The file encoding (default: utf-8).",
            "default": "utf-8"
          },
          "create_dirs": {
            "type": "boolean",
            "description": "Whether to automatically create parent directories (default: true).",
            "default": true
          },
          "backup": {
            "type": "boolean",
            "description": "Whether to create a backup of the existing file (default: false).",
            "default": false
          }
        },
        "required": ["file_path", "content"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "edit_file",
      "description": "Edit a file by searching for a pattern and replacing it with new content. Supports both string and regex matching.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "The absolute path to the file to edit."
          },
          "search": {
            "type": "string",
            "description": "The text or pattern to search for."
          },
          "replace": {
            "type": "string",
            "description": "The text to replace the matched content with."
          },
          "regex": {
            "type": "boolean",
            "description": "Whether to use regex for searching (default: false).",
            "default": false
          },
          "all": {
            "type": "boolean",
            "description": "Whether to replace all occurrences (default: false, only first match).",
            "default": false
          }
        },
        "required": ["file_path", "search", "replace"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_file",
      "description": "Search for a pattern in a file and return all matching lines with their line numbers and positions.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "The absolute path to the file to search."
          },
          "pattern": {
            "type": "string",
            "description": "The text or regex pattern to search for."
          },
          "regex": {
            "type": "boolean",
            "description": "Whether to use regex for searching (default: false).",
            "default": false
          },
          "case_sensitive": {
            "type": "boolean",
            "description": "Whether the search should be case-sensitive (default: true).",
            "default": true
          },
          "max_results": {
            "type": "number",
            "description": "Maximum number of results to return (default: 100).",
            "default": 100
          }
        },
        "required": ["file_path", "pattern"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_files",
      "description": "Search for a pattern across multiple files in a directory. Returns matches with file paths, line numbers, and content.",
      "parameters": {
        "type": "object",
        "properties": {
          "directory_path": {
            "type": "string",
            "description": "The directory path to search in."
          },
          "pattern": {
            "type": "string",
            "description": "The text or regex pattern to search for."
          },
          "regex": {
            "type": "boolean",
            "description": "Whether to use regex for searching (default: false).",
            "default": false
          },
          "case_sensitive": {
            "type": "boolean",
            "description": "Whether the search should be case-sensitive (default: true).",
            "default": true
          },
          "max_results": {
            "type": "number",
            "description": "Maximum number of results to return (default: 100).",
            "default": 100
          },
          "file_pattern": {
            "type": "string",
            "description": "Optional regex pattern to filter files by name."
          }
        },
        "required": ["directory_path", "pattern"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "list_directory",
      "description": "List all files and directories in a given directory path.",
      "parameters": {
        "type": "object",
        "properties": {
          "directory_path": {
            "type": "string",
            "description": "The directory path to list."
          }
        },
        "required": ["directory_path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "list_directory_with_sizes",
      "description": "List all files and directories with their sizes and modification times.",
      "parameters": {
        "type": "object",
        "properties": {
          "directory_path": {
            "type": "string",
            "description": "The directory path to list."
          }
        },
        "required": ["directory_path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "directory_tree",
      "description": "Build a recursive tree structure of a directory with configurable depth.",
      "parameters": {
        "type": "object",
        "properties": {
          "directory_path": {
            "type": "string",
            "description": "The directory path to build tree for."
          },
          "max_depth": {
            "type": "number",
            "description": "Maximum depth to traverse (default: 3).",
            "default": 3
          }
        },
        "required": ["directory_path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_file_info",
      "description": "Get detailed information about a file or directory including size, permissions, and timestamps.",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "The file or directory path to get info for."
          }
        },
        "required": ["file_path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "create_directory",
      "description": "Create a new directory at the specified path. Can create parent directories recursively.",
      "parameters": {
        "type": "object",
        "properties": {
          "directory_path": {
            "type": "string",
            "description": "The directory path to create."
          },
          "recursive": {
            "type": "boolean",
            "description": "Whether to create parent directories (default: true).",
            "default": true
          }
        },
        "required": ["directory_path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "move_file",
      "description": "Move or rename a file or directory from source to destination path.",
      "parameters": {
        "type": "object",
        "properties": {
          "source_path": {
            "type": "string",
            "description": "The source file or directory path."
          },
          "destination_path": {
            "type": "string",
            "description": "The destination file or directory path."
          },
          "overwrite": {
            "type": "boolean",
            "description": "Whether to overwrite if destination exists (default: false).",
            "default": false
          }
        },
        "required": ["source_path", "destination_path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]