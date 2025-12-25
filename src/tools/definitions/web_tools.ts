export default [
  {
    "type": "function",
    "function": {
      "name": "web_search",
      "description": "Perform a web search and return relevant results or summaries.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The search query to perform on the web."
          }
        },
        "required": ["query"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "web_fetch",
      "description": "Fetch and extract text content from a specified URL.",
      "parameters": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "description": "The URL to fetch content from. Must be a fully-formed valid URL."
          },
          "prompt": {
            "type": "string",
            "description": "The prompt to run on the fetched content, describing what information to extract from the page."
          }
        },
        "required": ["url", "prompt"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]
