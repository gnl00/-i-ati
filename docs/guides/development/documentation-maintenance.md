# Documentation maintenance

## Find the current source

Start at [docs/README](../../README.md). Classify each document as a current
contract, architecture, executable guide, decision, active work, external
reference or historical record. Verify behavior against exports, callers and
relevant tests before updating current claims.

Keep one current explanation for each ownership or lifecycle rule. Link plans
and guides to it rather than copying the rule. Architecture may link to a pending
acceptance task; pending acceptance must remain visible after implementation
history is archived.

## Complete or archive work

Use the [governance metadata](../../specs/documentation-governance.md).
`Active` can cover implemented code with remaining verification. Record approval,
implementation and acceptance separately in the body. Use `Done` only after exit
criteria are satisfied. Move Done/Cancelled work to `archive/YYYY/`, add the archive
header and link to the current source. Timestamp new archive filenames so a later
record with the same topic does not overwrite history.

Before moving a file, resolve relative links from its original directory, rebase
them from its destination, then update inbound links and indexes. Historical
migration tables retain their original source/destination facts; add a new batch
rather than rewriting previous migration history.

## References and links

Use repository-relative file links without local machine prefixes or editor-only
`:line` suffixes. For external material, record the upstream URL, revision or
explicitly unpinned status, source-check date and project use. Prefer a source card
over a full external README, source dump or mutable service directory.

Verify command names against `package.json`. Project procedures use pnpm. Preserve
quoted historical commands as historical context, with an archive header.

## Checks

```bash
pnpm run check:renderer-doc-paths
pnpm run check:main-doc-paths
git diff --check
```

The process-specific path checks cover selected source-path references. They do
not validate all Markdown links, anchors, external URLs, lifecycle metadata or
semantic accuracy. Also inspect relative links and index coverage for moved/new
documents, duplicate ADR identifiers, work/spec metadata, local machine paths,
command names and current claims. Review the diff before delivery.

Documentation-only changes require these applicable documentation checks. They
do not establish fresh behavior-test or Electron acceptance results. Preserve
existing staged changes when working in a dirty tree; report documentation edits
separately from unrelated work.
