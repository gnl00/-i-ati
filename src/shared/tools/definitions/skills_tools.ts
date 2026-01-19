export default [
  {
    "type": "function",
    "function": {
      "name": "load_skill",
      "description": "Load and install a skill from a URL or local path (supports SKILL.md or zip/tar archives), and optionally activate it for the current chat.",
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
          },
          "activate": {
            "type": "boolean",
            "description": "Activate the skill for the current chat after loading.",
            "default": true
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
  }
]
