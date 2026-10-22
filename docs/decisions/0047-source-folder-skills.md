# ADR-0047: Direct source-folder skills

**Status:** Accepted<br>
**Date:** 2026-10-18<br>
**Supersedes:** [ADR-0020](0020-skill-install-recovery.md)
**Related:** [Skills integration](../integrations/skills.md)

## Context

Copying configured third-party skill directories into userData created a second
owner for files and required synchronization, publication, conflict renaming,
backup, recovery and persistent metadata-cache logic. Instructions already load
on demand, so restoring managed copies is unnecessary for request construction.

## Decision

External skills are discovered only in configured source folders. Embedded
resources remain the built-in source. Startup awaits a complete scan; folder
configuration changes and explicit Refresh replace an in-memory catalog in a
serialized queue. No model-generated summaries, copy, persistent cache, watcher,
per-turn scan, userData fallback or migration is introduced.

Configured folder order determines external priority; external skills override
embedded names. Canonical roots deduplicate aliases. Conflicts and unavailable
sources are visible; failed sources do not remove configuration or hide healthy
siblings. Skill names use normalized frontmatter identifiers without rewriting
source files.

Load/read/run/reveal resolve through the catalog into source roots and retain
canonical path containment. Script cwd defaults to the task workspace. Existing
exec approvals remain responsible for execution and outside-workspace effects.
Manual activation remains a per-chat choice marker; unavailable choices are
omitted from model context. It never restores skill bodies into the system prompt.

Remove installation/import/delete tools, IPC and Settings actions, URL/archive
acquisition, installer publication transactions, locks, backups and recovery.
Old on-disk userData copies are ignored and left intact. There is no compatibility
or automatic data conversion path.

## Consequences

Source availability is required for use; removing a source immediately removes
its skills from new requests after config-save discovery completes. External
edits are seen after Refresh or restart. Source scripts execute against their
original resources, and may write there if that is what the approved command
does. Metadata volume only decreases if the discovered catalog loses stale or
duplicate entries; no token or latency reduction is assumed from copy removal.

Per-skill availability is a config preference (`skills.disabledNames`), defaulting
to enabled. Settings retains the full scan catalog; model discovery and selected
context omit disabled names, and new load/read/run calls reject them. Source
files and canonical chat history remain unchanged.
