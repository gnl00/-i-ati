# Anthropic tool search reference

Source: [Official advanced tool-use article](https://www.anthropic.com/engineering/advanced-tool-use)<br>
Upstream revision: Unpinned article; previous copied text had no retrieval revision<br>
Source checked: 2026-09-29<br>
Project use: Tool discovery research

The article discusses loading tool definitions on demand. Its token savings and
model benchmark results describe upstream experiments, not measurements of this
app. The old copied examples and benchmark figures were removed from the current
integration documentation.

See [app tool discovery](../integrations/tool-search-tools.md) for the actual
`available_tools` and exact-name `search_tools` contract. These tools do not imply
that the app implements the upstream regex or semantic search interface.
