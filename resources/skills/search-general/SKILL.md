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

1. Start with `web_search` and set `snippetsOnly: true` for a quick overview.
2. Read the snippet results and decide whether they settle the answer.
3. Use `web_search` with `snippetsOnly: false` or `web_fetch` when snippets leave gaps in evidence, dates, source details, direct attribution, or current accuracy.
4. Prefer primary or authoritative sources when the answer depends on precise facts, policies, product details, legal or medical guidance, software documentation, schedules, or prices.
5. Compare dates when sources describe recent events, releases, leadership, rules, or other unstable facts.
6. Cite the sources used in the response when the answer relies on web evidence.

## Stop Rule

Stop after snippet search when the user asks for a brief answer and the snippets already settle the answer.
