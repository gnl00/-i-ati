export default [
  {
    "type": "function",
    "function": {
      "name": "activity_journal_append",
      "description": "Append an important work event to the cross-session activity journal. Use for meaningful milestones, decisions, blockers, and completion summaries. Do not use for every small action.",
      "parameters": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "description": "Short summary of the work event."
          },
          "details": {
            "type": "string",
            "description": "Optional additional details about what happened, why it matters, or current outcome."
          },
          "category": {
            "type": "string",
            "enum": ["task", "plan", "tool", "decision", "blocker", "summary", "note"],
            "description": "Type of work event."
          },
          "level": {
            "type": "string",
            "enum": ["info", "important", "warning"],
            "description": "Importance level of the event."
          },
          "tags": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Optional short tags for later filtering."
          }
        },
        "required": ["title", "category"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "activity_journal_list",
      "description": "List activity journal entries for a date. Defaults to today and all chats. Use scope=current_chat only when you need the current chat's journal timeline.",
      "parameters": {
        "type": "object",
        "properties": {
          "date": {
            "type": "string",
            "description": "Optional local date in YYYY-MM-DD format. Defaults to today."
          },
          "limit": {
            "type": "number",
            "description": "Optional max number of entries to return. Defaults to 50, max 200."
          },
          "scope": {
            "type": "string",
            "enum": ["all", "current_chat"],
            "description": "Whether to list entries across all chats or only the current chat."
          }
        },
        "required": [],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "activity_journal_search",
      "description": "Search recent activity journal entries by semantic similarity. Use this to recall what work was done recently around a topic across sessions. Prefer this over working_memory when you need historical work timeline rather than current state.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Search query describing the work topic to recall."
          },
          "limit": {
            "type": "number",
            "description": "Optional max number of results to return. Defaults to 10, max 50."
          },
          "scope": {
            "type": "string",
            "enum": ["all", "current_chat"],
            "description": "Whether to search across all chats or only the current chat."
          },
          "withinDays": {
            "type": "number",
            "description": "Optional recency window in days. Defaults to 7."
          }
        },
        "required": ["query"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]
