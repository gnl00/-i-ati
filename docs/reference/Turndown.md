# Turndown reference

Source: [Upstream repository and API documentation](https://github.com/mixmark-io/turndown)<br>
Upstream revision: Not pinned; the previous API mirror did not record a revision<br>
Source checked: 2026-09-29<br>
Project dependency declaration: `turndown: ^7.2.2`; resolved version is recorded in `pnpm-lock.yaml`<br>
Project use: HTML-to-Markdown conversion in main-process web tools

[htmlToMarkdown](../../src/main/tools/webTools/extract/htmlToMarkdown.ts) creates
the configured Turndown service and applies the app's conversion behavior.
The converter consumes extracted/cleaned HTML; fetching and artifact persistence
belong to [Web Search and Fetch](../guides/development/web-search-and-fetch.md).

The copied upstream API text was replaced by this source card. Consult the
upstream API and local converter tests when changing rules; browser-script and
RequireJS examples from the old mirror are outside this application's integration.
