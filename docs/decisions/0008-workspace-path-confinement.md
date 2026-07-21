# ADR-0008: Workspace path confinement

**Status:** Accepted<br>
**Date:** 2026-07-21<br>
**Related architecture:** [Sandbox system design](../architecture/sandbox-design.md#workspace-file-operation-confinement)

## Context

The file-operation tools expose read, write, edit, search, traversal, metadata,
directory creation, and move capabilities inside the active chat workspace.
Historically, `FileOperationsProcessor` combined workspace lookup, legacy path
compatibility, lexical normalization, and canonical boundary checks in one
private resolver. Individual operations then applied their own traversal and
file-type behavior.

Canonicalizing the requested root protects direct access through a symbolic
link. Recursive operations introduce another boundary: every discovered child
can be a symbolic link, and an external search process can report paths that
require validation before they enter a tool response. Creation destinations
also require canonicalizing the longest existing prefix because the final path
can be absent at resolution time.

The embedded tool contract benefits from one portable path format. Existing
renderer IPC callers still submit workspace-contained absolute paths, so the
migration needs an explicit compatibility boundary.

## Decision

### Shared resolver

Use one main-process `WorkspacePathResolver` service for every file-operation
tool. The resolver receives the effective workspace root, an input path, and an
operation intent. Its result contains an absolute filesystem path for internal
I/O and a normalized workspace-relative path for tool responses.

The strict embedded-tool path contract accepts workspace-relative paths. The
lexical validation stage:

- rejects empty or NUL-containing values;
- rejects POSIX, Windows drive, and UNC absolute paths;
- treats both slash styles as path separators and rejects every `..` segment;
- normalizes `.` and repeated separators;
- resolves the remaining path against the canonical workspace root and checks
  containment with `path.relative()` semantics.

Path shape is validated before filesystem lookup, so equivalent traversal
spellings share the same outcome across platforms.

### Legacy IPC adapter

The renderer IPC boundary keeps a compatibility adapter for workspace-contained
absolute paths and the historical `workspaces/<chatUuid>/...` form. The adapter
converts accepted input into a workspace-relative path and calls the same strict
resolver. Embedded tool handlers enter the strict resolver directly.

Compatibility is limited to input conversion. Permission checks, canonical
containment, and errors remain shared across both call paths. Embedded responses
use workspace-relative paths. Legacy IPC responses preserve the path shapes
required by existing renderer callers.

### Canonical and symbolic-link confinement

The workspace root is canonicalized with `realpath`. For each target, the
resolver walks toward the root with `lstat` and identifies the longest existing
prefix. It canonicalizes that prefix with `realpath`, appends the unresolved
suffix, and verifies that the resulting path remains inside the canonical
workspace root.

This rule supports existing targets and creation destinations. A symbolic link
whose resolved target stays within the workspace can serve direct file
operations. A symbolic link whose resolved target crosses the workspace
boundary produces `PATH_SYMLINK_ESCAPE` before the operation reaches
filesystem I/O. A dangling symbolic link whose target cannot be canonicalized
produces `PATH_CANONICALIZATION_FAILED`; filesystem I/O remains blocked.

Recursive directory operations use `lstat` for every discovered entry.
Symbolic-link directories appear as terminal entries, and recursion stops at
the link. This rule applies to tree, glob, JavaScript search fallback, directory
listing metadata, and future recursive consumers. It also bounds symbolic-link
cycles.

### Search output validation

Ripgrep starts from a resolver-approved traversal root. Every path returned by
ripgrep is normalized and resolved through the shared confinement layer before
it enters a tool response. Each canonical match must also stay within the
requested file or directory traversal root. Paths that fail either boundary are
discarded and recorded through structured security logging. The JavaScript
fallback validates each candidate through the same layer before reading it.

Embedded search, glob, tree, and list responses expose normalized
workspace-relative paths. This keeps model-visible results portable and avoids
host path disclosure.

### Operation coverage

All file-operation entry points use the shared resolver:

- read, read-media, edit, search-file, and stat require an existing target;
- write and mkdir resolve a creation target through its existing prefix;
- write resolves an optional `.backup` destination independently before copying;
- grep, glob, tree, ls, and search-files resolve a traversal root and validate
  discovered children;
- mv resolves the source and destination independently, including the
  destination's existing prefix, before performing the move;
- `list_allowed_directories` reports the effective canonical workspace root for
  the current chat through the renderer IPC surface.

Batch and compatibility operations reuse one resolved workspace root for the
request, then resolve each path independently.

Resolver intents label the intended operation for logging and review. The
processors own target existence and file-type checks and return their existing
operation-specific errors. Canonical longest-prefix resolution remains shared
across existing and creatable targets.

The embedded runtime owns chat workspace selection. `ToolExecutor` overwrites
model-supplied `chat_uuid` values with the active runtime chat UUID before an
embedded handler runs. Context-free embedded calls discard model-supplied chat
UUID values. MCP arguments retain their connector-defined contract.

### Error contract

Path confinement failures use `WorkspacePathError`, which carries a stable
machine-readable `code` and a safe user-facing message. The initial codes are:

- `PATH_INVALID_INPUT`
- `PATH_ABSOLUTE_REJECTED`
- `PATH_TRAVERSAL_REJECTED`
- `PATH_SYMLINK_ESCAPE`
- `PATH_CANONICALIZATION_FAILED`

Logs may include the operation name and error code. User-facing responses omit
canonical external targets and host filesystem details.

## Consequences

- File tools share one audited workspace boundary and one error vocabulary.
- Embedded tool schemas use workspace-relative paths consistently.
- Legacy renderer IPC retains its workspace-contained absolute-path workflow.
- Direct access through external symbolic links is rejected before I/O.
- Recursive tools expose symbolic links as leaf metadata and keep traversal
  inside the selected workspace tree.
- Move operations apply equal confinement to both sides of the operation.
- Embedded tool responses use portable workspace-relative paths.

Path validation and filesystem mutation remain separate system calls. A local
process with concurrent write access can replace path components during that
window. The resolver provides pathname confinement. Hard-link inode provenance,
bind mounts, filesystem-specific aliases, privileged mount changes, and TOCTOU
remain residual risks. Descriptor-relative operations or the planned operating
system sandbox are required to address those classes.

## Verification

- Embedded tools reject absolute paths, traversal segments, NUL values, Windows
  drive paths, and UNC paths.
- The IPC adapter accepts workspace-contained absolute paths and rejects paths
  outside the active workspace.
- Existing files, missing leaf targets, and missing nested targets resolve
  through their canonical existing prefix.
- Direct reads through an internal symbolic link succeed.
- Reads, writes, edits, and moves through an external symbolic link return
  `PATH_SYMLINK_ESCAPE` and preserve the external target.
- Dangling symbolic links return `PATH_CANONICALIZATION_FAILED` and preserve
  filesystem state.
- Tree, glob, grep fallback, search-files, and directory listings stop at
  symbolic-link directories and terminate cleanly on symbolic-link cycles.
- Ripgrep results receive workspace and requested-root confinement validation
  before response mapping.
- Move validates source and destination independently.
- `list_allowed_directories` returns the current chat's effective canonical
  workspace root.
- Embedded tool responses expose normalized workspace-relative paths across
  POSIX and Windows-style inputs.
