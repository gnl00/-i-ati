# ADR-0039: Versioned workspace text mutations

**Status:** Accepted<br>
**Date:** 2026-10-04<br>
**Related architecture:** [Workspace file operations](../architecture/sandbox-design.md#workspace-file-operation-confinement)

## Context

A literal match can remain present after another writer changes a different part
of the file. Unique matching therefore proves the replacement target exists,
while a content precondition establishes which complete file the caller used as
its editing basis. Concurrent read-modify-write calls can also overwrite each
other if their filesystem operations interleave.

The file tools already read complete files before returning a bounded window.
Computing a content fingerprint during that read requires no additional file
read. An explicit precondition works across chats, subagents, direct IPC calls,
and runtime reconstruction without a session observation registry.

## Decision

### Explicit content versions

`read` returns `file_version`, formed as `sha256:<lowercase hexadecimal digest>`
over the complete original file bytes. Its bounded text window, BOM removal,
and line-ending view do not change the fingerprint. Versions are content
fingerprints: recreating the same bytes has the same version, and permission or
ownership changes do not change that version.

`edit` requires a non-null `expected_version` from a successful read or mutation.
`write` requires `expected_version` as well: a string means replace that content
version, and `null` means create only when the target is absent. There is no
unconditional overwrite mode. Missing or malformed versions fail before
filesystem mutation. A stale precondition requires reading again and rebuilding
the intended change; the runtime does not retry mutations automatically.

Successful `edit` and `write` return the version of the bytes they published.
The caller can use that version for a subsequent mutation without reading again.
A successful dry run retains the current file version and does not publish.
Version fields remain part of the stable model-visible tool result. There is no
persisted or session-owned observation map.

This intentionally breaks the previous write/edit input contract. The top-level
`search`/`replace`, `regex`, `all`, `expected_replacements`, and edit line-range
controls are retired. Existing stored tool results remain historical facts;
they do not receive fabricated content versions.

### One serialized filesystem boundary

A main-process global promise queue serializes Read, Edit, Write, Mkdir, and
Mv through their shared filesystem boundary. This deliberately favors straightforward ownership and correctness
over parallel throughput. It covers all calls using the service, including
embedded tools and renderer IPC. Search, traversal, unrelated services, and
external writers retain their own behavior.

Resolve the requested path through the existing workspace confinement boundary
inside the serialized operation. The canonical target determines filesystem I/O,
so an internal symlink remains a symlink and the target receives the mutation.
Existing hard-linked files are rejected rather than silently detaching one name
from the shared inode during atomic replacement. Paths through external or
unresolvable symlinks keep the existing confinement failures.

Queued cancellation can return promptly while later operations still wait for
the active operation. Once started, the queue remains occupied until I/O settles;
the descriptor read does not support interruption mid-read. Cancellation cannot
release the queue while an unfinished operation may still complete. A per-file queue can
replace the global queue if measured text-tool contention justifies the extra
canonical-key and missing-path registration rules.

### One strict UTF-8 text view

Read, Edit, and Write operate on valid UTF-8 text. Invalid UTF-8, NUL content, and
unpaired UTF-16 surrogates in input text are rejected rather than silently
replaced during decoding or encoding. The caller cannot select another encoding.

Read reports `bom` and `line_ending` (`none`, `lf`, `crlf`, or `mixed`). A leading
UTF-8 BOM is excluded from the model text and preserved by Edit. Pure CRLF files
use an LF view for both Read and Edit, and Edit restores CRLF when materializing
the file. Mixed endings remain distinct; untouched text is preserved instead of
converting the whole file to one dominant line-ending style.

`edit` takes `edits: [{ search, replace }, ...]`. Every non-empty literal search
must match exactly one region of the original text view. Match counts include
overlapping occurrences. All blocks are located and validated against the same
original file before publishing, and replacement regions may not overlap or
nest. Applying a block does not change the matching basis of a later block.
Near-match diagnostics remain advisory and never relax the replacement rule.
The failed block's `block_index` is zero-based. `dry_run` and bounded
`max_diagnostics` remain available.

Read retains line and column continuation. Its final formatted model text,
including version, metadata, and continuation instructions, fits within 32,000
UTF-16 code units. Pagination respects surrogate boundaries and keeps exact
continuation coordinates. This character ceiling is distinct from the runtime's
request token budget. Literal text such as `data:image/...` remains text in the
read result. The model-view text kind is persisted with the prepared view and
restored during Chat history replay, so normalization in later turns preserves
literal image data instead of extracting it as an image result.

### Atomic publication and its limits

Prepare the complete replacement in an exclusive `wx` temporary file with
mode `0600` next to the canonical target on the same filesystem. Sync the staged content before
publication, revalidate the content precondition close to publication, then
atomically replace the canonical target. Creating a new file uses an atomic
no-replace publication primitive so a competing creator is preserved.

Existing-file updates confirm write access. On POSIX, supported replacements
retain the target owner/group and ordinary permission bits; a target owned by
another user or using special mode bits is rejected. Newly created files use
mode `0600`. Replacement changes the inode and requires writable parent
filesystem directories. ACLs, extended attributes, Windows DACLs, and other
platform-specific file metadata are not copied by this implementation. Native
Windows access-control behavior requires separate platform acceptance. The
writer syncs the staged file, but does not sync the parent directory and therefore
does not promise directory-entry durability after power loss.

Cancellation checked before publication leaves the target unchanged. Once
publication succeeds, cancellation or staging cleanup must not report the
operation as an uncommitted failure. Cleanup is best effort after commit.

Content checks and atomic replacement remain separate system calls. An external
writer can change the file after the final check and before replacement. The
process queue does not serialize editors, Bash, formatters, other app processes,
or other filesystem providers. These tools therefore provide guarded
same-process mutations and atomic content visibility, with a residual external
check-to-publication race. They do not provide global cross-process CAS,
a multi-file transaction, or universal crash/partition durability. The existing
pathname confinement also retains its documented TOCTOU limitations.

## Consequences

- Models carry their exact complete-file content precondition in each mutation.
- All blocks in one Edit either validate and publish together or leave the file
  unchanged; a missing, ambiguous, or overlapping block cannot partially apply.
- Two parallel mutations using the same old version cannot both succeed through
  this service when the first changes the content.
- Hashing adds linear CPU work. Publication-time revalidation adds another
  complete-file read, and the global queue limits throughput across files.
- Text decoding, matching, and write-back share one BOM and line-ending contract.
- Hard links and unsupported text input fail explicitly rather than silently
  losing their original representation.
- Platform metadata preservation and hostile external pathname/content races
  remain separate acceptance boundaries.

## Verification

Processor and service tests cover raw-byte versions, stale writes despite a
still-matching target, two concurrent disjoint edits using one old version,
whole-batch validation, ambiguous and overlapping literals, creation without
clobber, dry runs, BOM/CRLF/mixed endings, invalid UTF-8/NUL/surrogates, bounded
continuation, and failure/cancellation around publication. Tool schemas,
normalization, stable model replay, and real processor-to-runtime failure
propagation have focused coverage. Native platform checks and cross-process
race/crash experiments are reported separately from those automated tests.
