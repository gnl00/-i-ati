# MCP Registry reference and app integration

Source: [Official API reference](https://registry.modelcontextprotocol.io/docs), [Registry repository](https://github.com/modelcontextprotocol/registry)<br>
Upstream revision: Not pinned; old `/v0` and aggregator mirrors had no retrieval revision<br>
Source checked: 2026-09-29; the API reference is a client-rendered page<br>
App API version: `/v0.1/servers`, verified from source on 2026-09-29<br>
Project use: Settings server discovery

[MCPServersManager](../../src/renderer/src/features/settings/mcps/MCPServersManager.tsx)
uses `https://registry.modelcontextprotocol.io/v0.1/servers` for registry browsing.
The runtime client is the source for this app's query, pagination and installation
mapping. Consult the upstream API reference when changing versions or response
fields; the old `/v0/servers` copied response examples are retired.

Registry discovery and installation are separate from establishing an MCP session.
The selected server still needs local configuration and a successful connection.
Avoid treating external catalog metadata as an app security or runtime guarantee.
