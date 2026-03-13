export default [
  {
    "type": "function",
    "function": {
      "name": "pre_decision_memo_create",
      "description": "Create and store a pre-decision memo before executing a significant action. Returns memo_id and a status that indicates whether execution should proceed or wait for user confirmation.",
      "parameters": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "description": "What exactly will be done (one sentence)."
          },
          "trigger": {
            "type": "string",
            "description": "What triggered this decision."
          },
          "value_score": {
            "type": "number",
            "description": "Estimated value or benefit, from 1 to 10."
          },
          "confidence": {
            "type": "number",
            "description": "Confidence level, from 1 to 10."
          },
          "main_risk": {
            "type": "string",
            "description": "Main uncertainty or risk."
          },
          "user_authorization_needed": {
            "type": "boolean",
            "description": "Whether explicit user authorization is required."
          },
          "user_authorization_confirmed": {
            "type": "boolean",
            "description": "Whether user authorization has already been confirmed."
          },
          "cost": {
            "type": "string",
            "description": "Estimated cost (time/tokens/quota/etc)."
          },
          "alternatives": {
            "type": "string",
            "description": "Alternative options considered and why they were not chosen."
          },
          "mitigation": {
            "type": "string",
            "description": "How to reduce the main risk."
          },
          "chat_uuid": {
            "type": "string",
            "description": "Current chat uuid used for per-chat memo logging."
          }
        },
        "required": [
          "action",
          "trigger",
          "value_score",
          "confidence",
          "main_risk",
          "user_authorization_needed"
        ],
        "$schema": "http://json-schema.org/draft-07/schema#"
      }
    }
  }
]
