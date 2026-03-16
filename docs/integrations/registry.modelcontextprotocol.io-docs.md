List MCP servers
get
/v0/servers
Get a paginated list of MCP servers from the registry

Request
Query Parameters
cursor
string
Pagination cursor

Examples:
server-cursor-123
limit
integer<int64>
Number of items per page

>= 1
<= 100
Default:
30
Examples:
50
search
string
Search servers by name (substring match)

Examples:
filesystem
updated_since
string
Filter servers updated since timestamp (RFC3339 datetime)

Examples:
2025-08-07T13:15:04.280Z
version
string
Filter by version ('latest' for latest version, or an exact version like '1.2.3')

Examples:
latest
Responses
200
default
OK

Body

application/json

application/json
metadata
object
required
Pagination metadata

count
integer<int64>
required
Number of items in current page

nextCursor
string
Pagination cursor for retrieving the next page of results. Use this exact value in the cursor query parameter of your next request.

servers
array[object] or null
required
List of server entries

_meta
object
required
Registry-managed metadata

server
object
required
Server configuration and metadata

cursor
:
example: server-cursor-123
limit
:
defaults to: 30
search
:
example: filesystem
updated_since
:
example: 2025-08-07T13:15:04.280Z
version
:
example: latest
Send API Request
curl --request GET \
  --url https://registry.modelcontextprotocol.io/v0/servers \
  --header 'Accept: application/json, application/problem+json'
{
  "metadata": {
    "count": 0,
    "nextCursor": "string"
  },
  "servers": [
    {
      "_meta": {
        "io.modelcontextprotocol.registry/official": {
          "isLatest": true,
          "publishedAt": "2019-08-24T14:15:22Z",
          "status": "active",
          "updatedAt": "2019-08-24T14:15:22Z"
        }
      },
      "server": {
        "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
        "_meta": {
          "io.modelcontextprotocol.registry/publisher-provided": {
            "property1": null,
            "property2": null
          }
        },
        "description": "MCP server providing weather data and forecasts via OpenWeatherMap API",
        "icons": [
          {
            "mimeType": "image/png",
            "sizes": [
              "string"
            ],
            "src": "https://example.com/icon.png",
            "theme": "light"
          }
        ],
        "name": "io.github.user/weather",
        "packages": [
          {
            "environmentVariables": [
              {
                "choices": [
                  "string"
                ],
                "default": "string",