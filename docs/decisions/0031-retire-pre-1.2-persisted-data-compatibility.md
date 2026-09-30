# ADR-0031: Retire pre-1.2 persisted-data compatibility

**Status:** Accepted
**Date:** 2026-09-30
**Related architecture:** [Main process](../architecture/main-process-architecture.md), [Scheduled tasks](../architecture/scheduled-tasks.md), [Emotion system](../architecture/emotion-system-design.md)
**Partially supersedes:** [ADR-0010](0010-persisted-cron-schedule-occurrences.md), [ADR-0013](0013-remove-assistant-presets.md), [ADR-0017](0017-emotion-stimulus-scoring.md)

## Context

Version 1.2 is an intentional compatibility break. The current installation is
the only supported persisted-data input for this release. Its configuration row
has no old model slots or embedded MCP/plugin settings; dedicated MCP and plugin
tables are populated; its app emotion state uses schema 2;
its `assistants` table and 48-hour Smart Message TTL rows are absent; and its
scheduled-task table has `schedule_type`. The remaining assistant messages
missing segment IDs or timestamps were removed with their owning chats before
this change.

## Decision

Retire the startup and read-time migrations for old model slots, MCP and plugin
configuration, emotion state v1, the removed `assistants` table, 48-hour Smart
Message expiry, and the previous scheduled-task table shape. Continue seeding
built-in plugins and normalizing malformed current emotion-state data. Current
model slots, MCP and plugin tables, emotion schema 2, and the schedule schema
are the supported persisted forms.

This decision applies to those seven migration groups only. Message segment ID
normalization and search timestamp fallback remain while their current write
and read contracts are assessed. The `DatabaseService` facade remains the
current database ownership boundary.

## Consequences

An installation using an old database row may lose legacy model selections,
MCP or plugin settings, and emotion state. Explicit config saves can still
write MCP settings through the current MCP repository; the removed startup
migration no longer discovers them in old stored config rows. A database with
the old scheduled-task table shape is unsupported by 1.2. Existing backups
remain available for recovery; no automatic upgrade from old formats runs at
startup.
