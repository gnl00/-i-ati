# Documentation governance

Status: Active<br>
Owner: Repository maintainers<br>
Last verified: 2026-09-29<br>
Scope: `docs/` and documentation links in repository guidance<br>
Source of truth: This document<br>
Related ADRs: [`decisions/`](../decisions/README.md)<br>
Related architecture: [`architecture/`](../architecture/README.md)<br>
Related tests: Documentation link check described below<br>
Supersedes: Historical OpenSpec documentation-governance references

## Purpose and scope

This specification defines the lifecycle, location, metadata, and maintenance
rules for project documentation. Every document has one primary purpose and one
lifecycle state. Topic folders live below the document type when grouping adds
useful navigation.

## Directory contract

| Directory | Contract |
| --- | --- |
| `specs/` | Active behavior, protocol, security, and tool contracts |
| `architecture/` | Current system structure, boundaries, and data flow |
| `decisions/` | Durable decisions and their consequences in ADR form |
| `guides/` | Executable development, testing, and troubleshooting procedures |
| `work/` | Time-bounded plans, investigations, and tasks with exit criteria |
| `reference/` | Source-indexed external material used by the project |
| `archive/YYYY/` | Completed, cancelled, retired, or superseded records |

Domain material that remains useful but has not completed content review may
stay in its existing topic directory. Each migration batch records those
exceptions in the archive inventory.

## Specification rules

A specification MUST declare `Status`, `Owner`, `Last verified`, `Scope`,
`Source of truth`, `Related ADRs`, `Related architecture`, `Related tests`, and
`Supersedes`. Valid statuses are `Draft`, `Active`, `Deprecated`, and
`Superseded`.

Normative rules use MUST, SHOULD, and MAY. A spec SHOULD cover scope, behavior,
inputs and outputs, state or failure semantics, compatibility and security
boundaries, acceptance criteria, and test mapping. Implementations and tests
MUST be updated when an Active contract changes.

## Work rules

Work documents MUST declare `Owner`, `Status`, `Started`, `Target`, `Exit
criteria`, `Related specs`, and `Related implementation`. Valid statuses are
`Proposed`, `Active`, `Blocked`, `Done`, and `Cancelled`.

`plans/` holds approved implementation sequences, `investigations/` holds
evidence and unresolved findings, and `tasks/` holds bounded execution lists.
Approval and implementation progress belong in the body. Implemented work with
remaining runtime or platform acceptance MUST remain `Active` (or `Blocked` when
a concrete blocker is recorded); `Approved` and `Implemented` are not separate
lifecycle states. Historical implementation records MAY be archived while a
linked active task preserves the remaining exit criteria.

When work reaches `Done` or `Cancelled`, maintainers MUST update durable specs,
architecture, and ADRs, then move the work record to `archive/YYYY/`.

## Archive rules

Archived documents preserve their original body and receive an archive header
with `Archived`, `Reason`, `Original path`, and `Replaced by`. Archives MUST use
the year of archival and SHOULD retain a domain subdirectory. New archive files
SHOULD use an archival date prefix, such as `2026-09-29-topic.md`. Current docs MAY
link to an archive for history; archives MUST point to the current source when
one exists.

## Links and references

Repository files use relative links. Source-code links resolve relative to the document directory to the repository
source. For example, use `../../src/main/index.ts` from `docs/architecture/`,
and `../../../src/main/index.ts` from `docs/guides/development/`. Links MUST NOT
contain machine-local repository prefixes or editor-only line suffixes. External mirrors
record source URL, upstream version or commit, retrieval date, and project use.
Generated output and machine-local absolute paths are excluded from durable
documentation.

Each documentation change SHOULD check Markdown links, orphaned index entries,
required lifecycle metadata, duplicate titles, and machine-local absolute
paths. `docs/README.md` is the navigation source of truth.

See [Documentation maintenance](../guides/development/documentation-maintenance.md)
for the review procedure and the limits of the source-path checks.
