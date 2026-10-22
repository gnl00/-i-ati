# Skills

Skills are read directly from embedded resources and configured source folders.
There is no managed installation copy. Source files remain owned by the user or
third-party package. See [ADR-0047](../decisions/0047-source-folder-skills.md).

## Sources and discovery

- Development embedded root: `resources/skills`.
- Packaged embedded root: `process.resourcesPath/skills`.
- External roots: `appConfig.skills.folders`, in configured order.

[SkillService](../../src/main/services/skills/SkillService.ts) awaits an initial
scan before Desktop, CLI or TUI can prepare a request. It publishes a complete
in-memory catalog. Listing that catalog performs no filesystem scan and reads
no persistent metadata cache. Configured folder changes trigger a rescan before
config-save IPC resolves. Settings Refresh explicitly rescans file changes.
No filesystem watcher or per-turn rescan is used.

[SkillCollector](../../src/main/services/skills/SkillCollector.ts) recursively
finds SKILL.md, including a root that itself is a skill, to depth 5. It stops
below a discovered skill and skips `.git`, `node_modules`, and nested directory
symlinks. Explicit source-root symlinks are resolved through realpath. Canonical
skill roots are deduplicated across overlapping sources.

A source skill with a given normalized frontmatter name wins over an embedded
skill. Among source folders, the first configured folder wins. Traversal within
one folder is sorted for deterministic selection. Shadowed entries are reported
with their paths and the winning path; files and names are never rewritten.
Missing folders, malformed skills, and unreadable subdirectories produce source
notices while healthy siblings continue. Missing folders remain configured.

Only configured roots and embedded resources participate. Old userData skill
copies, metadata cache, source markers, staging/backup directories, and recovery
transactions are neither consulted nor migrated. This change does not delete
old on-disk copies or source files.

## Format and paths

A skill directory contains SKILL.md plus optional scripts, references and assets.
The entry starts with YAML frontmatter: required `name` and `description`
(1-1024 characters), optional license, compatibility (up to 500 characters),
metadata and allowed-tools. Names normalize to lowercase hyphenated identifiers;
`frontmatterName` preserves the original spelling. The directory name is not
rewritten. Third-party descriptions remain intact; no generated short summaries
are introduced.

`SkillMetadata.path` points to the source SKILL.md and `source` identifies the
configured folder or `built-in`. Built-in frontend-artifact, project-context and
search-general workflows retain their existing source content and behavior.
[SkillPathResolver](../../src/main/services/skills/SkillPathResolver.ts) checks
relative paths and canonical containment. References or entry files escaping a
skill root through symlinks remain rejected. Reads resolve their paths again at
execution, so a missing source fails rather than falling back to a stale copy.

## Model tools

- `load_skill`: mark an available skill active and return complete SKILL.md plus
  its real skill_root, including when already active. Reuse instructions already
  in context; no second entry-file read is required.
- `unload_skill`: remove the current chat's selection marker; files remain intact.
- `read_skill_file`: read a source file or list a skill-relative directory.
- `run_skill_script`: execute a source script in place with explicit interpreter,
  runtime SKILL_ROOT/SKILL_SCRIPT, and the existing exec approval/output/timeout/
  cancellation behavior. Default cwd is the task workspace; explicit cwd may
  select the source skill root. References adjacent to the script remain in the
  source tree. A script that writes its own directory now writes that source.

POSIX: `node "$SKILL_SCRIPT" render diagram.json`.
Windows cmd: `node "%SKILL_SCRIPT%" render diagram.json`.
Runtime skill variables cannot be overridden. Script paths retain canonical
containment checks. Sources are not an exemption from command approval rules.

The installation/import tools and URL/archive installation routes are removed.
Users register local source folders; obtaining or updating third-party packages
happens outside the skill installation system.

## IPC and Settings

[Skill IPC](../../src/main/ipc/skills.ts) exposes skill:list, skill:scan-result,
skill:refresh, skill:get, skill:read-file, skill:load, skill:unload, and
skill:reveal-in-folder. The install, import-folder and delete endpoints are
removed together with their renderer invokers and model registrations.

[SkillsManager](../../src/renderer/src/features/settings/skills/SkillsManager.tsx)
uses the existing Settings layout for Source Folders and Available Skills.
Adding/removing a source awaits config persistence and discovery. Refresh scans
all sources; source notices display unavailable/invalid/shadowed paths. Removing
a source never removes its files. Skill rows expose Reveal at the actual source,
with no per-skill filesystem deletion action. Search includes name, original
description, compatibility and allowed tools. Active status follows chat state.

## Per-skill context switch

Every Available Skills row has a persistent, default-on switch. Settings saves
canonical names in `appConfig.skills.disabledNames`; it does not edit source
files or clear per-chat selections. The complete scan result retains disabled
rows for Settings, with `enabled: false`. `listSkills()` returns only enabled
entries for model discovery and manual `/sk:` choices. Availability changes read
the saved config without rescanning files. Source refresh/restart preserves them.

Disabled entries are excluded from both the system catalog and loaded-skills
request context. New load/read/script calls reject disabled skills rather than
returning instructions through another route. Settings Reveal explicitly allows
inspection of their source location. Existing chat choices become visible again
when re-enabled. Saving serializes switch changes; a failed save leaves the
previous state intact.

Context changes apply to newly prepared runs; already-sent instructions and
canonical transcript/tool-result history are not rewritten. This is a skill
availability preference, not a filesystem security boundary.

## Activation and context

Standalone `/sk:<name>` remains an idle-time manual selection without a user
message or model request. Welcome can create an empty chat for that selection.
The exact canonical catalog name is required; additional task text follows the
ordinary message path. Activation remains optional guidance, with existing
idempotency, draft/attachment preservation and chat-switch guards.

`chat_skills` stores selection names and ordering, not skill bodies. Available
skill metadata enters the stable system catalog through SkillsPromptProvider;
SystemPromptComposer has no chat-specific skill argument. Full instructions
enter as load_skill results, never through restored installation copies.

[LoadedSkillsContextProvider](../../src/main/hosts/chat/preparation/request/LoadedSkillsContextProvider.ts)
resolves selected names against the current catalog and injects only available
names and paths into hidden request context. Removed names are omitted without
rewriting historical chat rows or restoring old files. The same projection is
used after load/unload during a run. Existing transcript/tool-result replay is
unchanged. See [System prompt runtime context](../architecture/system-prompt-runtime-context.md).

## Verification

Source discovery/service tests cover priority, realpath deduplication, malformed
and missing sources, unchanged source bytes, refresh/restart/removal and ignoring
old userData copies. Real command integration tests resolve scripts through the
source catalog and verify workspace I/O, adjacent resources, cwd, timeout and
cancellation. IPC tests cover source-change rescans and endpoint removal.
Settings and activation tests cover discovery feedback, removal without file
deletion, Reveal, search, chat switching and unavailable activation references.
