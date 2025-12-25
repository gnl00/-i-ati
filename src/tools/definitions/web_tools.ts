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
      "description": "Fetch and extract text content from a specified URL. Returns the full page content in markdown format.",
      "parameters": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "description": "The URL to fetch content from. Must be a fully-formed valid URL."
          }
        },
        "required": ["url"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]
