# Claude Code Skills Implementation

This document summarizes the skills implementation in `/Users/gnl/Workspace/code/claude-code-analysis/src/skills` and compares it with this app's current skills implementation.

## Core Model

Claude Code models a skill as a `Command` with `type: 'prompt'`. The main conversion path is in `/Users/gnl/Workspace/code/claude-code-analysis/src/skills/loadSkillsDir.ts`.

The command object carries both command behavior and skill metadata:

- `name`, `description`, `whenToUse`, `version`
- `allowedTools`
- `argumentHint` and parsed argument names
- `model` and `effort`
- `disableModelInvocation`
- `userInvocable`
- `hooks`
- `context: 'inline' | 'fork'`
- `agent`
- `paths`
- `source` and `loadedFrom`
- `skillRoot`
- `getPromptForCommand(args, context)`

This means skills are part of the slash-command and tool-command registry, rather than a separate installed-skill database.

## Frontmatter Parsing

`parseSkillFrontmatterFields()` parses shared fields for file-based skills and MCP skills:

- `description`
- `allowed-tools`
- `argument-hint`
- `arguments`
- `when_to_use`
- `version`
- `model`
- `disable-model-invocation`
- `user-invocable`
- `hooks`
- `context: fork`
- `agent`
- `effort`
- `shell`

Description can fall back to markdown-body extraction through `extractDescriptionFromMarkdown()`. `paths` is parsed separately by `parseSkillPaths()` using CLAUDE.md-style path patterns.

## Prompt Command Creation

`createSkillCommand()` builds the `Command` object and defines `getPromptForCommand()`.

At invocation time, `getPromptForCommand()`:

1. Prepends `Base directory for this skill: <baseDir>` when the skill has a directory.
2. Substitutes arguments into the markdown body.
3. Replaces `${CLAUDE_SKILL_DIR}` with the skill directory.
4. Replaces `${CLAUDE_SESSION_ID}` with the current session id.
5. Executes inline shell expansions in the prompt for non-MCP skills.
6. Temporarily extends command permission rules with the skill's `allowedTools`.

MCP skills skip inline shell execution because MCP skill content is remote and treated as untrusted.

## File-Based Discovery

`getSkillsPath(source, dir)` maps setting source to a skills or commands directory:

- managed/policy settings: managed `.claude/skills`
- user settings: Claude config home `skills`
- project settings: `.claude/skills`
- plugin: virtual plugin path

`loadSkillsFromSkillsDir(basePath, source)` loads only the directory format:

```text
<basePath>/
  <skill-name>/
    SKILL.md
```

Each direct child directory or symlink is checked for `SKILL.md`. Single markdown files inside `/skills` are skipped. The directory entry name is the resolved skill name.

`loadSkillsFromCommandsDir(cwd)` supports legacy `/commands` entries. It accepts both regular markdown commands and `SKILL.md` inside a directory. For `SKILL.md`, the parent directory name becomes the command name, with namespace prefixes derived from subdirectories.

## Startup Aggregation

`getSkillDirCommands(cwd)` is memoized and loads skills from several sources in parallel:

- managed skills
- user skills
- project skills from directories up to home
- additional directories
- legacy command directories

It supports `--bare` mode, where discovery is limited to explicit additional directories. It also respects setting-source enablement and plugin-only restrictions.

After loading, it deduplicates by resolved real path, so symlinks and overlapping directory walks only produce one skill. It then splits skills into:

- unconditional skills returned immediately
- conditional skills with `paths` frontmatter, stored for later activation

## Dynamic And Conditional Skills

`discoverSkillDirsForPaths(filePaths, cwd)` walks upward from touched file paths toward the project root and looks for nested `.claude/skills` directories. It skips directories already checked and skips gitignored directories.

`addSkillDirectories(dirs)` loads newly discovered skill directories and merges them into the dynamic skill map. Deeper directories take precedence over shallower ones.

`activateConditionalSkillsForPaths(filePaths, cwd)` activates previously stored `paths`-filtered skills when a touched file matches their gitignore-style patterns. Activated skills move into the dynamic skill map and emit a signal so dependent caches can clear.

## Bundled Skills

Bundled skills live under `/Users/gnl/Workspace/code/claude-code-analysis/src/skills/bundled`.

`bundledSkills.ts` provides a programmatic registry:

- `registerBundledSkill(definition)`
- `getBundledSkills()`
- `clearBundledSkills()`

Bundled skill definitions can include metadata, hooks, execution context, model settings, and a `getPromptForCommand()` implementation. They can also include reference files as an in-memory `files` map. Those files are lazily extracted on first invocation into a deterministic bundled-skill root and then exposed through the same `Base directory for this skill` prompt prefix.

`bundled/index.ts` initializes built-in skills at startup. Some registrations are gated by feature flags or runtime checks.

## MCP Builder Registration

`mcpSkillBuilders.ts` is a small write-once registry that exposes `createSkillCommand` and `parseSkillFrontmatterFields` to MCP skill discovery without introducing broad import cycles.

`loadSkillsDir.ts` registers these builders at module initialization:

```text
registerMCPSkillBuilders({
  createSkillCommand,
  parseSkillFrontmatterFields,
})
```

## SkillTool Invocation

The actual model-facing invocation mechanism is `SkillTool` in `/Users/gnl/Workspace/code/claude-code-analysis/src/tools/SkillTool/SkillTool.ts`.

The tool input is:

```json
{
  "skill": "skill-name",
  "args": "optional arguments"
}
```

`SkillTool` builds its prompt listing through `/Users/gnl/Workspace/code/claude-code-analysis/src/tools/SkillTool/prompt.ts`. The listing includes skill names and descriptions within a character budget derived from the context window. Full skill content is loaded on invocation.

Invocation flow:

1. Validate the skill name and strip a leading slash.
2. Resolve the command from local, bundled, dynamic, plugin, or MCP command registries.
3. Reject disabled or non-prompt commands.
4. Check permission rules for the `Skill` tool.
5. For `context: 'fork'`, run the skill in a sub-agent with its own context.
6. For inline skills, process the prompt slash command and return new messages that expand the skill content into the conversation.
7. Apply context modifiers for `allowedTools`, `model`, and `effort`.

Permission behavior is command-aware. Skills with only allowlisted safe command properties can auto-allow; richer skills require an ask/allow/deny decision unless a rule already matches.

## Comparison With This App

The two systems implement similar `SKILL.md` capability packages, but their runtime architecture is different.

| Dimension | This app | Claude Code analysis |
|---|---|---|
| Primary abstraction | Installed `SkillMetadata` plus chat activation rows | `Command` with `type: 'prompt'` |
| Storage | Copies skills into Electron `userData/skills` | Reads from managed/user/project/additional dirs; bundled skills can extract reference files lazily |
| Activation | Explicit per-chat `load_skill` writes `chat_skills` | Skills are command candidates; model invokes via `SkillTool` |
| Prompt footprint | Every request includes installed skill list and full content for loaded chat skills | Prompt lists skill names/descriptions within budget; full content loads on invocation |
| Discovery | Settings folders and startup rescan | Managed/user/project discovery, additional dirs, bare mode, dynamic nested discovery |
| Conditional activation | Current implementation uses explicit chat activation | `paths` frontmatter activates skills after matching file operations |
| Conflict handling | Installed-name conflicts are renamed on folder import | Command registry ordering, realpath dedupe, dynamic deeper-path precedence |
| Arguments | Current activation stores skill names; loaded `SKILL.md` content is static | Arguments are parsed/substituted into the skill prompt |
| Tool permissions | `allowed-tools` appears in prompt metadata; embedded tool metadata marks skill tools by risk | `allowedTools` modifies command permission context during invocation |
| Execution mode | Loaded skills are prompt context in the main chat | Inline expansion or forked sub-agent execution |
| Hooks | Current skill metadata covers prompt guidance and references | Frontmatter hooks can be registered with skill root context |
| Model override | Current runtime uses the chat request model | `model` and `effort` can modify invocation context |
| Bundled skills | Current implementation focuses on installed filesystem skills | First-class bundled registry with feature gating |
| Remote/MCP skills | URL install is supported | MCP skills reuse command builders; remote skill search exists behind flags |

## Design Takeaways

This app's implementation is simple and predictable for a desktop app:

- Skills are installed once into app-owned storage.
- Users can curate watched folders in Settings.
- Chat activation is persistent and explicit.
- The model sees available skills and can load them with a tool.

Claude Code's implementation is optimized for a command-driven coding agent:

- Skills stay lightweight until invocation.
- The model sees a budgeted index and invokes only the needed skill.
- Skills can carry arguments, hooks, tool permissions, model/effort overrides, and forked execution settings.
- Project-local and path-conditional skills can appear as the working set changes.

The main architectural tradeoff is prompt size versus explicit chat state. This app pays prompt tokens for loaded skills on every request and gains stable per-chat activation. Claude Code keeps the baseline prompt smaller and shifts complexity into command discovery, permission checks, and invocation-time expansion.

## Potential Improvements For This App

The highest-value ideas to borrow are:

- Add a unique constraint or upsert behavior for `(chat_id, skill_name)`.
- Treat `allowed-tools` as an executable permission hint when a loaded skill drives tool use.
- Add argument-aware skill invocation, either through `load_skill` arguments or a separate `invoke_skill` tool.
- Keep full skill content out of the system prompt until a skill is invoked, using a budgeted skill index for discovery.
- Support path-conditioned skills with a `paths` frontmatter field.
- Add skill-level `model`, `effort`, and optional forked execution only after the invocation model exists.
- Expand tests around duplicate activation, path traversal, IPC registration, Settings rescan, and startup folder import.
