# Chat Message FTS5 Search

**Status:** Accepted<br>
**Date:** 2026-07-17<br>
**Related specs:** [Documentation governance](../specs/documentation-governance.md)<br>
**Related architecture:** [Main process architecture](../architecture/main-process-architecture.md)<br>
**Related work:** [Chat message FTS5 search optimization plan](../archive/2026/chat/chat-message-fts5-search-optimization-plan.md)

## Context

Chat title search and the `history_search` tool currently load every row from
`messages`, parse each `body` JSON value, extract visible user/assistant text,
normalize it, and run JavaScript substring matching. Each query repeats the
same scan.

The `messages` table stores role, source, creation time, content, and segments
inside `body`. Its current indexes cover `chat_id` and `chat_uuid`. Message text
becomes searchable after application code parses the serialized message corpus,
so query latency and main process work grow with that corpus.

The application database already uses SQLite through `better-sqlite3`. The
packaged SQLite build exposes FTS5, including the trigram tokenizer, BM25
ranking, `snippet()`, and `highlight()`.

## Decision

Use an FTS5 trigram index as the shared message-retrieval layer for:

- chat list search in `ChatTitleList`;
- the `history_search` tool;
- future message-search consumers that use the same visible-message contract.

Keep chat titles in the existing chat dataset and merge title hits with message
hits after indexed retrieval. The message projection contains visible
`user`/`assistant` text extracted by
`extractSearchableMessageText()`. Messages with a source listed in
`HIDDEN_MESSAGE_SOURCES` stay outside the projection.

FTS retrieval returns candidates filtered by query, chat scope, and time range.
Repository code applies product semantics such as title weighting, chat
aggregation, result contracts, public limits, and history message windows.

## Schema

The durable projection stores fields that currently live inside message JSON:

```sql
CREATE TABLE IF NOT EXISTS message_search_documents (
  message_id INTEGER PRIMARY KEY,
  chat_id INTEGER,
  chat_uuid TEXT,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  searchable_text TEXT NOT NULL,
  searchable_text_folded TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_search_documents_chat_id_created_at
  ON message_search_documents(chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_search_documents_chat_uuid_created_at
  ON message_search_documents(chat_uuid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_search_documents_created_at
  ON message_search_documents(created_at DESC);

CREATE TABLE IF NOT EXISTS message_search_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS message_search_fts USING fts5(
  searchable_text,
  content = 'message_search_documents',
  content_rowid = 'message_id',
  tokenize = 'trigram'
);
```

`message_search_documents` is the structured source for scope, time filtering,
short-query fallback, and snippet context. `searchable_text_folded` stores the
JavaScript Unicode-lowercased form used by short queries, while
`searchable_text` preserves the original text for FTS ranking and snippets.
`message_search_fts` is its external content index. Repository/DAO transactions
explicitly maintain the document row and corresponding FTS row.
`message_search_metadata` stores
`projection_version` so extraction changes can request a deterministic rebuild.
Projection creation uses `body.createdAt`, with the owning chat's
`updateTime` as the compatibility fallback for legacy messages.

The database sets `trusted_schema = OFF`. SQLite treats virtual-table writes
inside ordinary-table triggers as unsafe under this setting, so search
synchronization lives in reviewed application code at the database boundary.

## Query semantics

### Trigram retrieval

Queries containing at least three Unicode code points use an escaped FTS phrase
or an escaped OR expression. Phrase escaping treats user input as text and
keeps FTS query operators under repository control.

The trigram tokenizer preserves the existing substring-oriented experience for
Chinese, English, identifiers, and code fragments. Query cost follows the
matching posting lists and result set. Performance claims use measured latency
and scanned-row counts, since FTS query complexity varies with term frequency.

### Short-query fallback

Queries containing one or two Unicode code points use `instr()` against
`searchable_text_folded`. Projection writes and query normalization share
JavaScript `toLowerCase()` semantics, including Unicode characters handled by
the runtime. This path reads compact search text and indexed scope/time columns.
Chat titles participate in the same result merge.

### Ranking

Message candidates use `bm25(message_search_fts)`, where smaller values indicate
stronger relevance. Chat list results aggregate the strongest message match per
chat and combine:

- title-match weight;
- best message BM25 relevance;
- exact occurrence count for compatibility with `messageHitCount`;
- chat recency as the final tie-breaker.

History search preserves its current keyword OR semantics. It ranks message
hits by relevance and recency, then builds the existing neighboring-message
window from the matched message id.

### Snippets and highlights

FTS queries generate a bounded `snippet()` with private-use transport markers
defined in `src/shared/search/chatSearchHighlights.ts`:

```text
U+E000 (start)
U+E001 (end)
```

The renderer parses the markers into React text nodes and highlighted spans.
The marker parser keeps message content as text. Short-query results use the
same markers through a bounded application-side snippet builder. The
`history_search` tool strips these UI transport markers at its response
boundary and returns plain-text snippets.

## Synchronization and backfill

Message insert, update, and delete operations update
`message_search_documents` and `message_search_fts` in the same SQLite
transaction as the source message mutation. `MessageSearchDao` owns the
external-content FTS maintenance commands:

- insert writes the document row and matching FTS row;
- update removes the old FTS entry, updates the document, and writes the new
  FTS entry;
- delete removes the old FTS entry and document row.

Updates re-evaluate role, source, timestamp, and extracted text, so visibility
or content changes produce the correct projection state. This explicit
double-write preserves the database trusted-schema safety boundary.

Database initialization compares the stored `projection_version` with the code
version. First initialization and version changes run a transaction that:

1. clears the existing search projection;
2. streams existing `messages` rows;
3. parses and validates message JSON, skipping malformed syntax and shapes;
4. inserts eligible visible user/assistant documents;
5. invokes the FTS `rebuild` command;
6. records the new projection version.

Transaction rollback preserves the previous complete projection when parsing,
storage, or FTS rebuild work fails. Initialization logs indexed row count and
duration. Invalid JSON rows remain excluded from the projection; classified
skip telemetry is a follow-up observability item.

## Rollback

The source of truth remains `messages.body`. A rollback restores the previous
repository scan implementation and leaves the projection tables as disposable
derived data. A later startup can drop or rebuild the projection through a
projection-version migration.

Application startup reports FTS initialization failure through the current
database bootstrap error path. Diagnostics retain the migration error and
transaction rollback preserves the previous complete projection.

## Consequences

### Benefits

- Repeated searches read indexed matching candidates.
- Chat list and history search share one extraction and retrieval contract.
- BM25 supplies relevance ordering from the index.
- FTS snippets provide bounded match context and highlight positions.
- Structured `created_at` and chat identity enable early scope filtering.
- Projection versioning makes extraction-rule changes reproducible.

### Costs

- The database stores an additional text projection and FTS index.
- Message writes maintain derived search state transactionally.
- Startup performs a one-time backfill for each projection version.
- Trigram indexes favor substring recall and consume more space than word-token
  indexes.
- One- and two-code-point searches use a bounded fallback path with corpus-size
  sensitivity.

## Follow-up constraints

- Search projection code belongs in the main-process database boundary.
- IPC and renderer contracts expose snippets and highlight ranges while FTS
  query syntax remains inside the main-process database boundary.
- Extraction continues through `extractSearchableMessageText()` so title jobs,
  search, and future indexing rules share the same visible text definition.
- Search benchmarks report corpus size, query class, result count, warm/cold
  state, and observed latency.
