# ADR-0020: Skill installation publication and recovery

**Status:** Accepted<br>
**Date:** 2026-09-03<br>
**Related guide:** [Skill installation, recovery, and startup failure reporting](../guides/development/skill-install-recovery-implementation.md)<br>
**Related integration:** [Skills](../integrations/skills.md)<br>

## Context

Skill installation writes user supplied directory trees beneath
`userData/skills`. A replacement can be interrupted between moving the existing
directory and publishing the candidate, and a copy failure can leave an
incomplete candidate. Folder import also needs to identify an incomplete entry
and its source ownership so an explicitly configured source can rebuild it.
Startup import reports both thrown source errors and per-skill failures so a
later configured source continues processing.

## Decision

All skill mutations share the filesystem protocol in
`src/main/services/skills/SkillInstallation.ts`:

- An exclusive `.skill-lock` directory serializes writers across processes.
  The owner record includes a pid and token. Active, permission-protected, and
  unknown owner states retain the lock. Stale reclamation uses an exclusive
  marker in the lock directory and rechecks ownership before cleanup.
- Candidates are prepared under `.skill-staging` on the installation
  filesystem. The complete tree, metadata, source record, and symbolic-link
  containment are validated before publication. Relative links are copied with
  their original link text.
- `.skill-transactions/<uuid>.json` records the target, staging directory,
  backup directory, process id, and publication state. Record updates use a
  sibling temporary file followed by rename. Replacements move the previous
  target into `.skill-backups` and then publish the candidate. A failure attempts
  rollback and retains enough transaction state for recovery after restart.
- Recovery handles only validated, stale records whose paths are direct
  children of the reserved roots and remain canonically inside the installation
  root. Active or unknown records, unreadable targets, unsafe links, and
  malformed records remain available for diagnosis.
- Cache and collector enumeration exclude the reserved internal directories.
  Import inspects source ownership for incomplete entries, restores a matching
  configured source in place with a preserved backup, and uses the existing
  conflict rename behavior for a different source. Startup recovers transactions
  first, imports folders sequentially, and logs every summary failure.

## Consequences

Complete installed skills remain available during candidate preparation. A
recoverable record and backup preserve the previous version across process
interruption. Cross-process writers fail fast while a lock is held, and stale
state with an unrecognizable owner remains protected for manual diagnosis.

The protocol adds a small set of reserved directories under the skill root and
requires recovery to preserve records when filesystem inspection is ambiguous.
Source ownership remains part of import conflict resolution, including for
incomplete entries.

## Verification

- `pnpm exec vitest run src/main/services/skills/__tests__/SkillInstallation.test.ts`
  covers rollback, stale recovery, active transaction protection, malformed
  path records, and lock contention.
- `pnpm exec vitest run src/main/services/skills/__tests__` covers the complete
  service, importer, installation, cache, and recovery flow suites.
- Main-process boundary and documentation path checks apply to the service
  imports and this integration documentation.
