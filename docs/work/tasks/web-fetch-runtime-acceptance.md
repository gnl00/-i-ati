# Web Fetch live artifact acceptance

Owner: Main process maintainers<br>
Status: Active<br>
Started: 2026-07-24<br>
Updated: 2026-09-29<br>
Target: Verify a large fetched PDF through the real workspace and provider request path<br>
Exit criteria: Record all live checks below with build version and source URL, then archive this task<br>
Related specs: [Tool result normalization](../../specs/tools/tool-result-normalization.md)<br>
Related implementation: [HttpFetcher](../../../src/main/tools/webTools/http/HttpFetcher.ts), [WebFetchContentMaterializer](../../../src/main/tools/webTools/artifacts/WebFetchContentMaterializer.ts)

The [implementation record](../../archive/2026/tools/2026-09-29-web-fetch-workspace-artifacts.md)
contains the original 7,076,983-byte fixture and historical focused-test results.
The [current guide](../../guides/development/web-search-and-fetch.md) describes the
production path. This task preserves the remaining real-runtime acceptance;
fixture success does not establish live provider acceptance.

- [ ] Fetch the original manual, or document a replacement source if it has changed.
- [ ] Confirm complete source bytes, PDF header and workspace-readable source path.
- [ ] Inspect the bounded tool descriptor and absence of completed `.tmp/web-fetch` part files.
- [ ] Read the source through a workspace PDF tool.
- [ ] Verify the next provider request stays below its input ceiling and is accepted.

No live download or provider request was executed during the 2026-09-29 documentation cleanup.
