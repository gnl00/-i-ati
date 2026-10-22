---
name: search-general
description: Load this for any user request that asks to search, web search, look up, browse, find latest/current/today information, verify facts, compare sources, cite sources, or use web_search/web_fetch.
allowed-tools: web_search web_fetch
---

# Search General

Use this skill before any `web_search` or `web_fetch` call.

## Trigger Conditions

Load this skill when the user asks to:

- search, web search, browse, google, look up, find, or check online
- find latest, current, recent, today, yesterday, tomorrow, price, schedule, release, law, policy, product, leadership, weather, sports, or news information
- verify a factual claim against external sources
- compare sources, cite sources, provide links, or use direct source attribution
- recommend products, restaurants, travel, tools, libraries, or services using current external information

## Workflow

1. When the user provides a specific URL, read it with `web_fetch` first. When sources need discovery, use `web_search` for titles, snippets, and links.
2. Reuse evidence already available in the current context. Recover an existing artifact or missing section when needed instead of fetching the same source again. Refresh when the user asks or the evidence may be stale.
3. Select relevant source URLs and use `web_fetch` when snippets leave gaps in evidence, dates, source details, direct attribution, or current accuracy. Search does not read page bodies.
4. Prefer primary or authoritative sources when the answer depends on precise facts, policies, product details, legal or medical guidance, software documentation, schedules, or prices.
5. Compare dates when sources describe recent events, releases, leadership, rules, or other unstable facts.
6. Cite the sources used in the response when the answer relies on web evidence.

## Stop Rule

Before another search or fetch, identify the specific claim or requirement still missing evidence and what the call is expected to add. Make this decision internally; no extra user-facing checklist is needed.

Stop retrieving when the available evidence supports the requested answer or artifact. A brief answer may need only snippets; precise claims, quotations, dates, and cross-product comparisons may require primary-source bodies. Select evidence for each material side of a comparison, not merely more pages about one side.

If required evidence is missing, continue with a targeted source or explain the unresolved requirement. Failure to find evidence is not proof that a claim is false. Separate documented facts, inference, and unavailable information.

## Failure Recovery

Use the tool's failure and recovery information. Correct invalid inputs using known links or documented parameters. For service failures, read ordinary documentation or an independent source; retry the same service or similar endpoints only when there is a concrete reason they can succeed. For rate limits, respect returned wait guidance or choose another source. For login or verification barriers, use accessible sources or explain the access needed.

Do not expand to more near-identical queries or URL variations solely because a prior attempt failed. A retry is useful when it addresses the failure cause or has evidence of changed conditions. There is no fixed search count or automatic retry policy.
