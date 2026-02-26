export default [
  {
    "type": "function",
    "function": {
      "name": "install_skill",
      "description": "Install a skill from a URL or local path (supports SKILL.md, skill directory, zip/tar archives).",
      "parameters": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string",
            "description": "URL or local path to SKILL.md or a skill directory."
          },
          "name": {
            "type": "string",
            "description": "Expected skill name to validate."
          },
          "allowOverwrite": {
            "type": "boolean",
            "description": "Overwrite an existing installed skill with the same name.",
            "default": false
          }
        },
        "required": ["source"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "load_skill",
      "description": "Load an already installed skill into the current chat context.",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Installed skill name to load."
          }
        },
        "required": ["name"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "import_skills",
      "description": "Import all skills found in a folder recursively. Handles conflicts by renaming when needed.",
      "parameters": {
        "type": "object",
        "properties": {
          "folderPath": {
            "type": "string",
            "description": "Folder path to scan recursively for SKILL.md based skills."
          }
        },
        "required": ["folderPath"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "unload_skill",
      "description": "Remove a previously loaded skill from the current chat (does not uninstall).",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Skill name to unload."
          }
        },
        "required": ["name"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "read_skill_file",
      "description": "Read a file inside an installed skill (for example references/*.md or assets). Paths are relative to the skill root.",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Installed skill name."
          },
          "path": {
            "type": "string",
            "description": "Relative path inside the skill directory (e.g. references/REFERENCE.md)."
          },
          "encoding": {
            "type": "string",
            "description": "Text encoding (default: utf-8)."
          },
          "start_line": {
            "type": "integer",
            "description": "Optional 1-based start line."
          },
          "end_line": {
            "type": "integer",
            "description": "Optional 1-based end line."
          }
        },
        "required": ["name", "path"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]
