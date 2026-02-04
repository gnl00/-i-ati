export default [
  {
    "type": "function",
    "function": {
      "name": "plan_create",
      "description": "Create a task plan with steps for a goal. Returns the created plan.",
      "parameters": {
        "type": "object",
        "properties": {
          "goal": {
            "type": "string",
            "description": "The goal to accomplish."
          },
          "chat_uuid": {
            "type": "string",
            "description": "Chat UUID to associate with the plan (runtime-injected)."
          },
          "context": {
            "type": "object",
            "description": "Relevant context information."
          },
          "constraints": {
            "type": "object",
            "description": "Plan constraints.",
            "properties": {
              "maxSteps": {
                "type": "number",
                "description": "Maximum number of steps."
              },
              "timeout": {
                "type": "string",
                "description": "Timeout duration, e.g. '1 hour'."
              },
              "parallelize": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Step IDs that can run in parallel."
              }
            }
          },
          "steps": {
            "type": "array",
            "description": "Steps for the plan.",
            "items": {
              "type": "object",
              "properties": {
                "id": { "type": "string" },
                "title": { "type": "string" },
                "status": {
                  "type": "string",
                  "enum": ["todo", "doing", "done", "failed", "skipped"]
                },
                "dependsOn": {
                  "type": "array",
                  "items": { "type": "string" }
                },
                "tool": { "type": "string" },
                "input": { "type": "object" },
                "output": {},
                "error": { "type": "string" },
                "notes": { "type": "string" }
              },
              "required": ["id", "title", "status"]
            }
          }
        },
        "required": ["goal", "steps"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "plan_update",
      "description": "Update an existing task plan. Returns success.",
      "parameters": {
        "type": "object",
        "properties": {
          "plan": { "type": "object" }
        },
        "required": ["plan"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "plan_update_status",
      "description": "Update plan status and optionally update a step status in the same call.",
      "parameters": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "status": {
            "type": "string",
            "enum": ["pending", "pending_review", "running", "paused", "completed", "failed", "cancelled"]
          },
          "currentStepId": { "type": "string" },
          "failureReason": { "type": "string" },
          "stepId": { "type": "string" },
          "stepStatus": {
            "type": "string",
            "enum": ["todo", "doing", "done", "failed", "skipped"]
          }
        },
        "required": ["id", "status"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "plan_get_by_id",
      "description": "Get a plan by id.",
      "parameters": {
        "type": "object",
        "properties": {
          "id": { "type": "string" }
        },
        "required": ["id"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "plan_get_by_chat_uuid",
      "description": "Get plans by chat UUID.",
      "parameters": {
        "type": "object",
        "properties": {
          "chat_uuid": { "type": "string" }
        },
        "required": ["chat_uuid"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "plan_delete",
      "description": "Delete a plan by id.",
      "parameters": {
        "type": "object",
        "properties": {
          "id": { "type": "string" }
        },
        "required": ["id"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "plan_step_upsert",
      "description": "Create or update a plan step.",
      "parameters": {
        "type": "object",
        "properties": {
          "planId": { "type": "string" },
          "step": { "type": "object" }
        },
        "required": ["planId", "step"],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  },
  
]
