# Cheerio reference

Source: [Official documentation](https://cheerio.js.org/), [upstream repository](https://github.com/cheeriojs/cheerio)<br>
Upstream revision: Not pinned; the previous translated mirror did not record a version<br>
Source checked: 2026-09-29<br>
Project dependency declaration: `cheerio: ^1.1.2`; resolved version is recorded in `pnpm-lock.yaml`<br>
Project use: HTML extraction and cleanup in main-process web tools

[ContentExtractor](../../src/main/tools/webTools/extract/ContentExtractor.ts)
loads page HTML and selects content containers. The
[Markdown converter](../../src/main/tools/webTools/extract/htmlToMarkdown.ts)
also uses Cheerio to shape HTML before conversion.

Cheerio parses the supplied HTML. Rendering pages and waiting for SPA content
belong to the Electron fetch path. See [Web Search and Fetch](../guides/development/web-search-and-fetch.md).
The old 997-line API mirror was removed; use upstream documentation for exact APIs
and the lockfile for the version under test.
