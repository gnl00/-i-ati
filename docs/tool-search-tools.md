Tool Search Tool
The challenge
MCP tool definitions provide important context, but as more servers connect, those tokens can add up. Consider a five-server setup:

GitHub: 35 tools (~26K tokens)
Slack: 11 tools (~21K tokens)
Sentry: 5 tools (~3K tokens)
Grafana: 5 tools (~3K tokens)
Splunk: 2 tools (~2K tokens)
That's 58 tools consuming approximately 55K tokens before the conversation even starts. Add more servers like Jira (which alone uses ~17K tokens) and you're quickly approaching 100K+ token overhead. At Anthropic, we've seen tool definitions consume 134K tokens before optimization.

But token cost isn't the only issue. The most common failures are wrong tool selection and incorrect parameters, especially when tools have similar names like notification-send-user vs. notification-send-channel.

Our solution
Instead of loading all tool definitions upfront, the Tool Search Tool discovers tools on-demand. Claude only sees the tools it actually needs for the current task.

Tool Search Tool diagram
Tool Search Tool preserves 191,300 tokens of context compared to 122,800 with Claude’s traditional approach.
Traditional approach:

All tool definitions loaded upfront (~72K tokens for 50+ MCP tools)
Conversation history and system prompt compete for remaining space
Total context consumption: ~77K tokens before any work begins
With the Tool Search Tool:

Only the Tool Search Tool loaded upfront (~500 tokens)
Tools discovered on-demand as needed (3-5 relevant tools, ~3K tokens)
Total context consumption: ~8.7K tokens, preserving 95% of context window
This represents an 85% reduction in token usage while maintaining access to your full tool library. Internal testing showed significant accuracy improvements on MCP evaluations when working with large tool libraries. Opus 4 improved from 49% to 74%, and Opus 4.5 improved from 79.5% to 88.1% with Tool Search Tool enabled.

How the Tool Search Tool works
The Tool Search Tool lets Claude dynamically discover tools instead of loading all definitions upfront. You provide all your tool definitions to the API, but mark tools with defer_loading: true to make them discoverable on-demand. Deferred tools aren't loaded into Claude's context initially. Claude only sees the Tool Search Tool itself plus any tools with defer_loading: false (your most critical, frequently-used tools).

When Claude needs specific capabilities, it searches for relevant tools. The Tool Search Tool returns references to matching tools, which get expanded into full definitions in Claude's context.

For example, if Claude needs to interact with GitHub, it searches for "github," and only github.createPullRequest and github.listIssues get loaded—not your other 50+ tools from Slack, Jira, and Google Drive.

This way, Claude has access to your full tool library while only paying the token cost for tools it actually needs.

Prompt caching note: Tool Search Tool doesn't break prompt caching because deferred tools are excluded from the initial prompt entirely. They're only added to context after Claude searches for them, so your system prompt and core tool definitions remain cacheable.

Implementation:

{
  "tools": [
    // Include a tool search tool (regex, BM25, or custom)
    {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},

    // Mark tools for on-demand discovery
    {
      "name": "github.createPullRequest",
      "description": "Create a pull request",
      "input_schema": {...},
      "defer_loading": true
    }
    // ... hundreds more deferred tools with defer_loading: true
  ]
}

Copy
For MCP servers, you can defer loading entire servers while keeping specific high-use tools loaded:

{
  "type": "mcp_toolset",
  "mcp_server_name": "google-drive",
  "default_config": {"defer_loading": true}, # defer loading the entire server
  "configs": {
    "search_files": {
"defer_loading": false
    }  // Keep most used tool loaded
  }
}

Copy
The Claude Developer Platform provides regex-based and BM25-based search tools out of the box, but you can also implement custom search tools using embeddings or other strategies.

When to use the Tool Search Tool
Like any architectural decision, enabling the Tool Search Tool involves trade-offs. The feature adds a search step before tool invocation, so it delivers the best ROI when the context savings and accuracy improvements outweigh additional latency.

Use it when:

Tool definitions consuming >10K tokens
Experiencing tool selection accuracy issues
Building MCP-powered systems with multiple servers
10+ tools available
Less beneficial when:

Small tool library (<10 tools)
All tools used frequently in every session
Tool definitions are compact
Programmatic Tool Calling
The challenge
Traditional tool calling creates two fundamental problems as workflows become more complex:

Context pollution from intermediate results: When Claude analyzes a 10MB log file for error patterns, the entire file enters its context window, even though Claude only needs a summary of error frequencies. When fetching customer data across multiple tables, every record accumulates in context regardless of relevance. These intermediate results consume massive token budgets and can push important information out of the context window entirely.
Inference overhead and manual synthesis: Each tool call requires a full model inference pass. After receiving results, Claude must "eyeball" the data to extract relevant information, reason about how pieces fit together, and decide what to do next—all through natural language processing. A five tool workflow means five inference passes plus Claude parsing each result, comparing values, and synthesizing conclusions. This is both slow and error-prone.
Our solution
Programmatic Tool Calling enables Claude to orchestrate tools through code rather than through individual API round-trips. Instead of Claude requesting tools one at a time with each result being returned to its context, Claude writes code that calls multiple tools, processes their outputs, and controls what information actually enters its context window.

Claude excels at writing code and by letting it express orchestration logic in Python rather than through natural language tool invocations, you get more reliable, precise control flow. Loops, conditionals, data transformations, and error handling are all explicit in code rather than implicit in Claude's reasoning.

Example: Budget compliance check
Consider a common business task: "Which team members exceeded their Q3 travel budget?"

You have three tools available:

get_team_members(department) - Returns team member list with IDs and levels
get_expenses(user_id, quarter) - Returns expense line items for a user
get_budget_by_level(level) - Returns budget limits for an employee level
Traditional approach:

Fetch team members → 20 people
For each person, fetch their Q3 expenses → 20 tool calls, each returning 50-100 line items (flights, hotels, meals, receipts)
Fetch budget limits by employee level
All of this enters Claude's context: 2,000+ expense line items (50 KB+)
Claude manually sums each person's expenses, looks up their budget, compares expenses against budget limits
More round-trips to the model, significant context consumption
With Programmatic Tool Calling:

Instead of each tool result returning to Claude, Claude writes a Python script that orchestrates the entire workflow. The script runs in the Code Execution tool (a sandboxed environment), pausing when it needs results from your tools. When you return tool results via the API, they're processed by the script rather than consumed by the model. The script continues executing, and Claude only sees the final output.

Programmatic tool calling flow
Programmatic Tool Calling enables Claude to orchestrate tools through code rather than through individual API round-trips, allowing for parallel tool execution.
Here's what Claude's orchestration code looks like for the budget compliance task:

team = await get_team_members("engineering")

# Fetch budgets for each unique level
levels = list(set(m["level"] for m in team))
budget_results = await asyncio.gather(*[
    get_budget_by_level(level) for level in levels
])

# Create a lookup dictionary: {"junior": budget1, "senior": budget2, ...}
budgets = {level: budget for level, budget in zip(levels, budget_results)}

# Fetch all expenses in parallel
expenses = await asyncio.gather(*[
    get_expenses(m["id"], "Q3") for m in team
])

# Find employees who exceeded their travel budget
exceeded = []
for member, exp in zip(team, expenses):
    budget = budgets[member["level"]]
    total = sum(e["amount"] for e in exp)
    if total > budget["travel_limit"]:
        exceeded.append({
            "name": member["name"],
            "spent": total,
            "limit": budget["travel_limit"]
        })

print(json.dumps(exceeded))

Copy

Expand
Claude's context receives only the final result: the two to three people who exceeded their budget. The 2,000+ line items, the intermediate sums, and the budget lookups do not affect Claude’s context, reducing consumption from 200KB of raw expense data to just 1KB of results.

The efficiency gains are substantial:

Token savings: By keeping intermediate results out of Claude's context, PTC dramatically reduces token consumption. Average usage dropped from 43,588 to 27,297 tokens, a 37% reduction on complex research tasks.
Reduced latency: Each API round-trip requires model inference (hundreds of milliseconds to seconds). When Claude orchestrates 20+ tool calls in a single code block, you eliminate 19+ inference passes. The API handles tool execution without returning to the model each time.
Improved accuracy: By writing explicit orchestration logic, Claude makes fewer errors than when juggling multiple tool results in natural language. Internal knowledge retrieval improved from 25.6% to 28.5%; GIA benchmarks from 46.5% to 51.2%.
Production workflows involve messy data, conditional logic, and operations that need to scale. Programmatic Tool Calling lets Claude handle that complexity programmatically while keeping its focus on actionable results rather than raw data processing.

How Programmatic Tool Calling works
1. Mark tools as callable from code
Add code_execution to tools, and set allowed_callers to opt-in tools for programmatic execution:

{
  "tools": [
    {
      "type": "code_execution_20250825",
      "name": "code_execution"
    },
    {
      "name": "get_team_members",
      "description": "Get all members of a department...",
      "input_schema": {...},
      "allowed_callers": ["code_execution_20250825"] # opt-in to programmatic tool calling
    },
    {
      "name": "get_expenses",
 	...
    },
    {
      "name": "get_budget_by_level",
	...
    }
  ]
}

Copy

Expand
The API converts these tool definitions into Python functions that Claude can call.

2. Claude writes orchestration code
Instead of requesting tools one at a time, Claude generates Python code:

{
  "type": "server_tool_use",
  "id": "srvtoolu_abc",
  "name": "code_execution",
  "input": {
    "code": "team = get_team_members('engineering')\n..." # the code example above
  }
}

Copy
3. Tools execute without hitting Claude's context
When the code calls get_expenses(), you receive a tool request with a caller field:

{
  "type": "tool_use",
  "id": "toolu_xyz",
  "name": "get_expenses",
  "input": {"user_id": "emp_123", "quarter": "Q3"},
  "caller": {
    "type": "code_execution_20250825",
    "tool_id": "srvtoolu_abc"
  }
}

Copy
You provide the result, which is processed in the Code Execution environment rather than Claude's context. This request-response cycle repeats for each tool call in the code.

4. Only final output enters context
When the code finishes running, only the results of the code are returned to Claude:

{
  "type": "code_execution_tool_result",
  "tool_use_id": "srvtoolu_abc",
  "content": {
    "stdout": "[{\"name\": \"Alice\", \"spent\": 12500, \"limit\": 10000}...]"
  }
}

Copy
This is all Claude sees, not the 2000+ expense line items processed along the way.

When to use Programmatic Tool Calling
Programmatic Tool Calling adds a code execution step to your workflow. This extra overhead pays off when the token savings, latency improvements, and accuracy gains are substantial.

Most beneficial when:

Processing large datasets where you only need aggregates or summaries
Running multi-step workflows with three or more dependent tool calls
Filtering, sorting, or transforming tool results before Claude sees them
Handling tasks where intermediate data shouldn't influence Claude's reasoning
Running parallel operations across many items (checking 50 endpoints, for example)
Less beneficial when:

Making simple single-tool invocations
Working on tasks where Claude should see and reason about all intermediate results
Running quick lookups with small responses


ref: https://www.anthropic.com/engineering/advanced-tool-use