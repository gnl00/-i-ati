export default [
  {
    "type": "function",
    "function": {
      "name": "search_tools",
      "description": "Search for tools by their names and get their complete definitions. Use this to discover and load tool definitions on-demand instead of loading all tools upfront.",
      "parameters": {
        "type": "object",
        "properties": {
          "tool_names": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "description": "Array of tool names to search for. Returns the complete tool definitions for the specified tools."
          }
        },
        "required": ["tool_names"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]