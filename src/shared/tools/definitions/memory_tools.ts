export default [
  {
    "type": "function",
    "function": {
      "name": "memory_retrieval",
      "description": "Retrieve relevant context from long-term memory based on semantic similarity. Use this tool to search for relevant historical conversations, facts, or context that may help answer the current query. IMPORTANT: The query parameter MUST be in ENGLISH for accurate vector similarity search. Translate your search query to English before calling this tool.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The search query to find relevant memories. MUST be in ENGLISH for accurate vector similarity search. Translate your search intent to English before calling this tool."
          },
          "chatId": {
            "type": "number",
            "description": "Optional: Limit the search to a specific chat ID. If not provided, searches across all conversations."
          },
          "topK": {
            "type": "number",
            "description": "Optional: Number of relevant memories to retrieve (default: 5, max: 10)."
          },
          "threshold": {
            "type": "number",
            "description": "Optional: Minimum similarity threshold (0-1). Only memories with similarity >= threshold will be returned (default: 0.6)."
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
      "name": "memory_save",
      "description": "Save important information to long-term memory for future reference. Use this tool when you encounter important facts, decisions, preferences, or context that should be remembered across conversations. The system stores both the original content and its English translation for accurate semantic retrieval.",
      "parameters": {
        "type": "object",
        "properties": {
          "context_origin": {
            "type": "string",
            "description": "The content to save in its ORIGINAL language (as provided by the user). This is preserved for accurate display when retrieved."
          },
          "context_en": {
            "type": "string",
            "description": "The English translation of the content. This is used for vector embedding generation to ensure accurate semantic search. IMPORTANT: Always provide the English translation, even if the original content is already in English."
          },
          "chatId": {
            "type": "number",
            "description": "The chat ID to associate this memory with."
          },
          "metadata": {
            "type": "object",
            "description": "Optional: Additional metadata about this memory (e.g., category, importance, tags).",
            "properties": {
              "category": {
                "type": "string",
                "description": "Category of the memory (e.g., 'preference', 'fact', 'decision', 'context')"
              },
              "importance": {
                "type": "string",
                "enum": ["low", "medium", "high"],
                "description": "Importance level of this memory"
              },
              "tags": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Tags for categorizing this memory"
              }
            }
          }
        },
        "required": ["context_origin", "context_en", "chatId"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]
