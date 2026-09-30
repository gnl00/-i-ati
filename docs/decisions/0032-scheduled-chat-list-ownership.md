# ADR-0032: Scheduled chat list ownership

**Status:** Accepted<br>
**Date:** 2026-09-30<br>
**Related architecture:** [Scheduled tasks](../architecture/scheduled-tasks.md)

## Decision

Scheduled execution chats remain ordinary persisted chats for message streaming,
workspace selection and follow-up prompts. Their immutable `chats.is_scheduled`
origin places them in the Chats list below the Tasks schedule board.
The ordinary chat title list and its title/message search exclude this origin.
Tasks searches the scheduled chat titles locally and opens the existing transcript.
The task board's All/Active/History filters apply only to task definitions.

Origin is written atomically with execution chat insertion and attempt binding.
Startup adds the column idempotently and backfills chats whose UUID is still
present in occurrence or attempt associations. Unassociated older chats retain
ordinary visibility; titles are never used to infer origin. Chat updates do not
rewrite origin. A separately forked conversation receives the ordinary default.

## Consequences

Occurrence retention and task deletion cannot move classified chats back into
ordinary chat groups. No messages move and no scheduler execution policy changes.
The existing all-chat store continues to hold both kinds for run event routing;
classification applies to visible lists rather than background subscriptions.
A return to the preceding UI can retain this additive column and all chat data.

## Verification

Mapper, scoped search, renderer list and navigation tests cover origin routing,
ordering, background updates, workspace failures and obsolete navigation.
Electron SQLite tests cover schema backfill and origin surviving task deletion.
