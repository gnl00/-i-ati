export default [
  {
    "type": "function",
    "function": {
      "name": "schedule_create",
      "description": "Create a scheduled task for a chat. Response includes currentDateTime (local ISO-8601 with offset); use it to compute run_at.",
      "parameters": {
        "type": "object",
        "properties": {
          "chat_uuid": { "type": "string", "description": "Chat UUID that owns this scheduled task." },
          "goal": { "type": "string", "description": "Goal/purpose of the scheduled task." },
          "run_at": { "type": "string", "description": "Local ISO-8601 datetime with offset (e.g. 2026-02-05T15:34:51+08:00). Use currentDateTime as reference." },
          "timezone": { "type": "string", "description": "Optional IANA timezone for display or validation (e.g. 'Asia/Shanghai'). Prefer run_at with offset." },
          "plan_id": { "type": "string", "description": "Optional task plan id associated with this task." },
          "payload": { "type": "object", "description": "Optional payload used by scheduler execution." },
          "max_attempts": { "type": "number", "description": "Retry limit; 0 means no retry." }
        },
        "required": ["chat_uuid", "goal", "run_at"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "schedule_list",
      "description": "List all scheduled tasks for a chat. Response includes currentDateTime (local ISO-8601 with offset).",
      "parameters": {
        "type": "object",
        "properties": {
          "chat_uuid": { "type": "string", "description": "Chat UUID." }
        },
        "required": ["chat_uuid"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "schedule_cancel",
      "description": "Cancel a pending/running scheduled task. Response includes currentDateTime (local ISO-8601 with offset).",
      "parameters": {
        "type": "object",
        "properties": {
          "chat_uuid": { "type": "string", "description": "Chat UUID that owns the task." },
          "id": { "type": "string", "description": "Scheduled task id." }
        },
        "required": ["chat_uuid", "id"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "schedule_update",
      "description": "Update a pending scheduled task. Response includes currentDateTime (local ISO-8601 with offset); use it to compute run_at.",
      "parameters": {
        "type": "object",
        "properties": {
          "chat_uuid": { "type": "string", "description": "Chat UUID that owns the task." },
          "id": { "type": "string", "description": "Scheduled task id." },
          "goal": { "type": "string", "description": "New goal text." },
          "run_at": { "type": "string", "description": "New local ISO-8601 datetime with offset (e.g. 2026-02-05T15:34:51+08:00). Use currentDateTime as reference." },
          "timezone": { "type": "string", "description": "Optional IANA timezone for display or validation (e.g. 'Asia/Shanghai'). Prefer run_at with offset." },
          "payload": { "type": "object", "description": "Optional payload update." },
          "max_attempts": { "type": "number", "description": "Retry limit; 0 means no retry." }
        },
        "required": ["chat_uuid", "id"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]
