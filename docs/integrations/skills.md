# Skills

This app supports Agent Skills as file-based capability packages. Skills can come from built-in app resources or the Electron app data directory, appear in the system prompt as available capabilities, and can be activated on demand through the `load_skill` tool or a standalone `/sk:<name>` chat command. Active skill names and paths are injected into model context as hidden user messages sourced from the current chat's `chat_skills` rows. Activation is a hint, not a requirement to use the skill. When the model needs instructions absent from its current context, `load_skill` returns `SKILL.md` directly, including for an already-active skill.

## File Format

User-installed skills live under `app.getPath('userData')/skills`:

```text
skills/
  <skill-name>/
    SKILL.md
    references/
    scripts/
    assets/
    .skill-source.json
```

`SKILL.md` must start with YAML frontmatter. The current parser supports these fields:

- `name`: required. Normalized to lowercase hyphenated form for the installed directory name.
- `description`: required, 1-1024 characters.
- `license`: optional.
- `compatibility`: optional, up to 500 characters.
- `metadata`: optional nested key/value map.
- `allowed-tools`: optional space-separated list.

Installed metadata is represented by `SkillMetadata` in [src/types/index.d.ts](../../src/types/index.d.ts). The app keeps both `name` and `frontmatterName` because the directory name can be normalized or conflict-renamed while the original frontmatter name remains useful for display/debugging.

## Built-In Skills

Built-in skills are app resources under `resources/skills` in development and `process.resourcesPath/skills` in packaged builds:

```text
resources/
  skills/
    frontend-artifact/
      SKILL.md
    project-context/
      SKILL.md
    search-general/
      SKILL.md
```

`electron-builder.yml` ships this directory as an `extraResources` entry with target `skills`.

Built-in skills use the same `SKILL.md` format as user-installed skills. `SkillService.listSkills()` merges built-in metadata with user-installed metadata, marks built-in entries with `source: 'built-in'`, and lets a user-installed skill with the same normalized name take precedence for listing and content reads.

The current built-in skills are:

- `frontend-artifact`: runnable frontend artifact creation, preview workflow,
  and visual execution quality.
- `project-context`: repository instruction discovery and focused `.ati-kb` /
  `.claude` knowledge routing.
- `search-general`: mandatory workflow for any user request that asks to search, web search, look up, browse, find latest/current information, verify facts, cite sources, or use `web_search`/`web_fetch`.

## Main-Process Service

[SkillService](../../src/main/services/skills/SkillService.ts) owns installation, listing, content reading, deletion, startup sync, and metadata caching.

The service installs skills into `userData/skills` from:

- local `SKILL.md` files
- local skill directories
- local `.zip`, `.tar`, `.tar.gz`, and `.tgz` archives
- remote `SKILL.md` URLs
- remote archive URLs
- recursively scanned folders containing one or more `SKILL.md` files

Installation validates frontmatter, normalizes the skill name with `^[a-z0-9]+(?:-[a-z0-9]+)*$`, prepares a complete candidate, copies the source directory or writes the `SKILL.md`, records the source in `.skill-source.json`, publishes the candidate through the installation transaction, and marks the in-memory metadata cache dirty.

Archive installation extracts to a temporary directory, rejects unsafe archive paths, scans up to depth 5 for `SKILL.md`, and requires exactly one skill directory for single-skill archive installs. Local extraction uses system `tar`/`unzip`.

`listSkills()` reads built-in and user-installed skill directories and returns sorted `SkillMetadata[]`. User-installed metadata uses an in-memory cache and a config DB cache keyed by `skillsMetadataCache`; cache validity is based on installed `SKILL.md` mtimes and root path. Built-in metadata is read from the app resource directory and merged into the returned list. Incomplete entries are omitted with a warning, while unreadable and unsafe entries retain their failure reason for import and recovery decisions.

`listInstalledSkills()` returns only user-installed skill metadata and is used by folder import conflict detection.

`getSkillContent(name)` and `resolveSkillRootPath(name)` use the same precedence rule: user-installed skill first, then built-in skill.

`importSkillsFromFolder(folderPath)` recursively finds skill directories under a configured folder. It overwrites a previously imported skill when `.skill-source.json` points to the same source path. When a new source conflicts by normalized name, it creates a unique name by appending the scanned folder name and, if needed, a numeric suffix.

`initializeFromConfig(config)` runs on app startup from [MainApplication](../../src/main/app/MainApplication.ts) or [CliApplication](../../src/main/app/CliApplication.ts), recovers validated stale installation transactions, then imports each path in `config.skills.folders` in configuration order. Source-level exceptions and every item in an import summary's `failed` list are logged before the next source is processed.

### Installation publication and recovery

[SkillInstallation](../../src/main/services/skills/SkillInstallation.ts) owns the filesystem protocol shared by install, import, delete, and startup recovery. Mutating operations acquire an exclusive `.skill-lock` directory under `userData/skills`; the owner record contains the process id and a random token. Active processes, permission-denied process probes, and unrecognizable lock state keep the lock protected. Stale lock reclamation uses an exclusive marker inside the lock directory so concurrent reclaimers cannot remove a newly acquired lock.

Preparation writes into `.skill-staging` on the installation filesystem. The candidate tree is validated after copying, including relative and internal symbolic links, and source file modes and resources are retained. `.skill-source.json` is written into the candidate before publication. Transaction records live in `.skill-transactions`, use a UUID-matching filename, and are updated through a sibling temporary record followed by rename. Replaced directories move to `.skill-backups` before the candidate moves into the target directory; a publication failure rolls back the previous directory when possible and leaves a validated transaction record for restart recovery when rollback needs later attention.

Startup recovery processes only validated records created by this protocol. It restores a previous directory after an interrupted `previous-moved` step, publishes a complete staged candidate when the target is absent, and removes completed records and temporary trees. Active or unknown process records remain available for their owner, and unreadable targets or unsafe paths keep their record and error for diagnosis. The reserved staging, backup, transaction, lock, and temporary directories are excluded from installed-skill enumeration and folder collection.

Folder import reads source ownership for incomplete entries as well as complete entries. A configured source can rebuild a same-name incomplete directory while preserving the original directory in the backup area. A different source follows the existing conflict rename policy, and unreadable or unsafe same-name entries produce an explicit failure.

## Embedded Tools

The model-facing tool definitions live in [src/shared/tools/skills/definitions.ts](../../src/shared/tools/skills/definitions.ts), with tool metadata in [src/shared/tools/skills/metadata.ts](../../src/shared/tools/skills/metadata.ts). Main handlers are registered through [src/main/tools/index.ts](../../src/main/tools/index.ts).

The available skill tools are:

- `install_skill`: install one skill from a URL, file, directory, or archive.
- `load_skill`: activate an available skill for the current chat and return its `SKILL.md` instructions and `skill_root`.
- `import_skills`: recursively import all skills from a folder.
- `unload_skill`: remove a skill from the current chat.
- `read_skill_file`: read a text file inside an available skill directory.
- `run_skill_script`: run a script bundled inside an available skill directory.

[SkillToolsProcessor](../../src/main/tools/skills/SkillToolsProcessor.ts) adapts tool calls to services and database writes:

- Relative install/import sources resolve against the current chat workspace when `chat_uuid` is available, then fall back to `userData`.
- `load_skill` requires `chat_uuid`, verifies the available `SKILL.md`, resolves the chat row, writes the skill name to `chat_skills` when it is absent, and returns `{ success, name, loaded, contextInjected, content, skill_root }`. Already-active skills return the current content without inserting another activation row. Body read failures leave activation unchanged.
- `unload_skill` requires `chat_uuid`, resolves the chat row, and deletes the row from `chat_skills`.
- `read_skill_file` accepts only a relative path inside the resolved skill root and rejects path traversal.
- `run_skill_script` requires `name`, a relative `script` path inside the resolved skill root, and a complete shell `command`. It validates canonical script containment, keeps the script in place, and sets `SKILL_ROOT` and `SKILL_SCRIPT` environment variables. Commands select their interpreter explicitly. The working directory defaults to the current task workspace using the runtime chat UUID; optional `cwd` overrides it with an absolute or workspace-relative directory. To run at the skill root, pass the returned `skill_root`. No script copying or implicit interpreter selection occurs. The former `args` input is retired; include arguments in `command`.

Example script invocation on macOS/Linux:

```json
{
  "name": "seecode",
  "script": "scripts/seecode.mjs",
  "command": "node \"$SKILL_SCRIPT\" render diagrams/ponte.json"
}
```

Windows commands use the existing `cmd.exe` convention, for example
`node "%SKILL_SCRIPT%" render diagrams/ponte.json`. Custom `env` entries cannot
override the runtime skill variables, including case variants. Command approvals,
timeouts, cancellation, streamed output and model output limits reuse `exec`.
Skill scripts can reference installed resources through their own file location
or `SKILL_ROOT`; relative task paths resolve from `cwd`. See
[ADR-0045](../decisions/0045-on-demand-skill-content-and-workspace-commands.md).

The tool metadata marks `install_skill`, `import_skills`, `load_skill`, `unload_skill`, and `run_skill_script` as `riskLevel: 'warning'`; `read_skill_file` is `riskLevel: 'none'`.

## IPC And Renderer UI

[src/main/ipc/skills.ts](../../src/main/ipc/skills.ts) exposes the service and processor through Electron IPC:

- `skill:list`
- `skill:get`
- `skill:read-file`
- `skill:install`
- `skill:load`
- `skill:unload`
- `skill:import-folder`
- `skill:delete`

Renderer settings helpers live in [src/renderer/src/features/settings/skills/SkillService.ts](../../src/renderer/src/features/settings/skills/SkillService.ts) and [src/renderer/src/infrastructure/ipc/integrations.ts](../../src/renderer/src/infrastructure/ipc/integrations.ts). The IPC capability module delegates to [src/main/ipc/skills.ts](../../src/main/ipc/skills.ts); model-facing skill tools are registered in [src/main/tools/index.ts](../../src/main/tools/index.ts) and implemented by [SkillToolsProcessor](../../src/main/tools/skills/SkillToolsProcessor.ts).

[SkillsManager](../../src/renderer/src/features/settings/skills/SkillsManager.tsx) is the Settings UI for skills. It:

- lists available skills and active skills for the current chat
- labels built-in skills and keeps their delete action hidden
- stores watched folders in `appConfig.skills.folders`
- lets users add a folder through the directory picker
- imports one folder immediately after adding it
- validates and rescans all configured folders
- removes invalid folder paths from config
- filters available skills by name, description, compatibility, and allowed tools
- deletes installed skills

The current UI displays active status. Chat activation is available through the standalone command below, the model-facing `load_skill` tool, or DB helpers. Deactivation is available through the composer skill chips, `unload_skill`, and DB helpers.

### Manual chat activation

Type `/sk:` in Chat or Welcome to list available skills in the existing slash-command panel. Each candidate shows the installed skill name, description, and `Active` status when it is already loaded for the selected chat.

- Submit an exact standalone command such as `/sk:pdf` with Enter or Send, or click a candidate. For a partial name, use the arrow keys to select a candidate before pressing Enter. An unselected unknown name reports an error instead of activating a different skill.
- The command changes chat state and gives local feedback. It does not create a user message or start a model request. The next task receives the usual compact loaded-skills context; the assistant still reads the full skill document with `read_skill_file`.
- Names use the canonical `SkillMetadata.name` from the available catalog. `/sk:pdf` requires an available skill named `pdf`; it is not an alias for `pdf-processing`.
- Activation is available while the chat is idle, without pending blocking post-run jobs or an unanswered model question. Finish an in-progress queued-message edit before activating a skill.
- Welcome creates and selects an empty `NewChat` after validating the skill. It ensures the default workspace directory and preserves the selected model, chat instruction, and approval mode. The chat and activated skill remain available in history even before the first task is sent.
- Successful activation clears the submitted command while retaining attachments and any draft edited during activation. Failures retain the input. Navigation during an asynchronous activation cannot select its old chat or clear the new chat's draft.
- Repeated activation is idempotent. Manual and assistant activation share the same persistent per-chat skill set, and assistant `unload_skill` retains its existing behavior.
- A message containing additional task text, such as `/sk:pdf process this file`, follows the ordinary message path. The first version handles independent activation commands.

[useSkillActivation](../../src/renderer/src/features/chat/input/useSkillActivation.ts) validates available names and calls the existing `skill:load` IPC. [ChatInputArea](../../src/renderer/src/features/chat/input/ChatInputArea.tsx) routes both command selection and standalone submission through that activation path. A per-chat skills revision refreshes the composer slot, command panel, Chat statistics, and Settings active status after a manual activation or deactivation. [chatRunEvent](../../src/renderer/src/features/chat/runtime/chatRunEvent.ts) also updates that revision when a persisted `TOOL_RESULT_ATTACHED` belongs to `load_skill` or `unload_skill`, including results for a background chat. Consumers re-read the persistent skill set; they do not infer active status from tool-result text.

### Active skills in the composer

[ActiveSkillsSlot](../../src/renderer/src/features/chat/input/ActiveSkillsSlot.tsx) displays the current chat's active names inside the shared Chat and Welcome composer, below the queue rail and above attachments and task text. It shows the first three skills by default; `+N` reveals the remainder and `Show less` collapses the list. Long names retain their full text in the tooltip and accessible content, and an expanded list wraps within a bounded scroll area.

The slot follows the existing persistent per-chat state, remains visible after sending a task, and keeps an empty Welcome composer expanded while skills are active. Switching chats resets the disclosure state. Disclosure clicks preserve textarea focus, draft, and selection.

Each chip has a separate `Deactivate <name>` button, displayed as ×. Clicking the skill name keeps the chip unchanged; clicking × invokes the existing `skill:unload` handler for the selected chat. The handler removes that chat's activation row and retains the installed skill files. The next task rebuilds loaded-skills context from the remaining set. A skill can be activated again with `/sk:<name>`.

Deactivation requires an idle persistent chat with no blocking post-run jobs, unanswered model question, or queued-message edit. Activation and deactivation share a mutation lock and `isUpdatingSkills` state; task submission and queued-task flushing wait for the update to settle. Buttons are disabled during those blocked states. Successful deactivation re-reads the remaining persisted names, while failed requests retain the current chips and report an error. Both paths preserve text, attachments, and selection. Async completion refreshes its owning chat and cannot update a newly selected chat or clear its draft. Deactivation also supports residual active names whose installed skill is no longer available.

## Chat Load State

Loaded skill state is stored per chat in SQLite. The `chat_skills` table contains `chat_id`, `skill_name`, `load_order`, and `loaded_at` ([src/main/db/core/Database.ts](../../src/main/db/core/Database.ts)).

[SkillDao](../../src/main/db/dao/SkillDao.ts) inserts and deletes skill rows and returns skills ordered by `load_order`. [ChatRepository](../../src/main/db/repositories/ChatRepository.ts) materializes `load_order` as the current max plus one.

`processLoadSkill()` checks `DatabaseService.getSkills(chat.id)` before inserting, so repeated `load_skill` calls for the same chat return a successful status without adding another row. The schema also has a unique `(chat_id, skill_name)` index.

## Prompt Injection

The chat request pipeline uses [SkillsPromptProvider](../../src/main/hosts/chat/preparation/request/SkillsPromptProvider.ts). For each request it:

1. Lists all available skills through `SkillService.listSkills()`.
2. Builds `<skills_context>` with [buildSkillsPrompt](../../src/shared/services/skills/SkillPromptBuilder.ts).
3. Wraps it in `<skills_system>` policy text through [buildSkillsSystemPrompt](../../src/shared/prompts/skills.ts).

The generated context has one data section:

- `Available Skills`: every available skill as `name: description`, plus `allowed-tools` when present.

The system prompt tells the model that available skills are discoverable options. The model chooses skills relevant to the current task. If instructions are absent, it calls `load_skill`; the tool result carries the instructions and root path, and the runtime refreshes only active names and paths in hidden context. Instructions already available in current context are reused without a second read.

Specialized workflow details live in built-in skills:

- `project-context` carries repository instruction and project knowledge
  routing. The static system prompt keeps one trigger for repository work that
  requires local instructions, architecture, conventions, or knowledge.
- `frontend-artifact` carries runnable artifact, preview, and aesthetic
  execution conventions.
- `search-general` carries web search depth and source-selection workflow.

The available-skills catalog descriptions provide the normal activation
surface. The static system prompt retains only cross-task triggers that protect
core repository behavior.

## Loaded Skills Context Injection

Loaded skill state is assembled by [LoadedSkillsContextProvider](../../src/main/hosts/chat/preparation/request/LoadedSkillsContextProvider.ts) and [buildLoadedSkillsContextMessage](../../src/shared/services/skills/LoadedSkillsContext.ts).

For every chat request, `RunRequestFactory` reads `chat_skills` for the current chat and passes a compact virtual context message to `buildContextMessages`. The compact context carries active skill names, metadata paths when available, and a reminder to choose relevant skills and call `load_skill` only when needed instructions are absent. Manual `/sk:` activation does not inject the full skill body.

The injected message shape is:

```ts
{
  role: 'user',
  source: MESSAGE_SOURCE.SKILLS_CONTEXT,
  content: '<loaded_skills_context>\n<skill name="frontend-design" path="<user-skills-root>/frontend-design/SKILL.md" />\n<skill name="hunt" path="<user-skills-root>/hunt/SKILL.md" />\n<instruction>Use an active skill only when relevant. If you need its instructions and they are absent from the current context, call load_skill; it returns SKILL.md even when already active. Reuse instructions already present without rereading them.</instruction>\n</loaded_skills_context>',
  segments: []
}
```

[buildContextMessages](../../src/main/hosts/chat/preparation/request/buildContextMessages.ts) inserts this virtual message before the latest user message. The following shows logical host context order with compression; protocol projection later merges runtime context into the following user message:

```text
system prompt
user: [Previous conversation summary ...]
user: <loaded_skills_context>
<skill name="frontend-design" path="<user-skills-root>/frontend-design/SKILL.md" />
<skill name="hunt" path="<user-skills-root>/hunt/SKILL.md" />
<instruction>Use an active skill only when relevant. If you need its instructions and they are absent from the current context, call load_skill; it returns SKILL.md even when already active. Reuse instructions already present without rereading them.</instruction>
</loaded_skills_context>
user: latest user request
```

Skill paths come from `SkillService.listSkills()` metadata assembled from the skill registry/cache. The compact context only points at the `SKILL.md` path. The model calls `load_skill` when it needs the instructions. Its tool result enters ordinary history once and uses existing bounded tool-result normalization and recovery for oversized content; the hidden context never duplicates the body. `read_skill_file` remains available for references, scripts, directories and missing-content recovery.
Loaded skill XML fragments are generated through the shared XML helper, so skill names and metadata paths are escaped consistently when rendered as attributes.

During the same run, `AgentLoop` refreshes the hidden context after successful `load_skill` or `unload_skill` tool results by using `ChatLoadedSkillsTranscriptContextProvider`. This makes the next model continuation see the updated active skill set within the same run.

The skill prompt hierarchy has three layers:

1. `<skills_system>` / `<skills_context>` list available skills by name, description, and global usage rules.
2. `<loaded_skills_context>` records the current chat's active skill names and metadata paths as transient state.
3. `load_skill` returns `SKILL.md` instructions on demand. `read_skill_file` reads additional bundled resources or recovers missing content.

Renderer UI and history search filter `MESSAGE_SOURCE.SKILLS_CONTEXT`, so the hidden carrier message stays out of visible transcript surfaces and searchable chat history.

## Runtime Flow

Folder import from Settings:

```text
SkillsManager
  -> invokeImportSkills(folder)
  -> ipcMain skill:import-folder
  -> processImportSkills()
  -> SkillService.importSkillsFromFolder()
  -> userData/skills/<skill-name>/
  -> refresh installed skills and active chat skills
```

Model installs a skill:

```text
tool call install_skill
  -> embeddedToolsRegistry
  -> processInstallSkill()
  -> SkillService.loadSkill()
  -> userData/skills/<skill-name>/
```

Model loads a skill:

```text
tool call load_skill
  -> processLoadSkill()
  -> verify resolved skill root contains SKILL.md
  -> DatabaseService.getChatByUuid(chat_uuid)
  -> SkillService.getSkillContent(name)
  -> DatabaseService.addSkill(chat.id, name)
  -> return { success, name, loaded, contextInjected, content, skill_root }
  -> AgentLoop refreshes hidden loaded skills context for the next model continuation
```

Next chat request:

```text
SystemPromptComposer
  -> SkillsPromptProvider.build(chatId)
  -> SkillService.listSkills()
  -> buildSkillsPrompt()
  -> buildSkillsSystemPrompt()
  -> provider request system prompt with Available Skills only
RunRequestFactory
  -> LoadedSkillsContextProvider.build(chatId)
  -> buildContextMessages({ contexts: [...] })
  -> ContextManager prepares records and projectContextRequest merges request context
  -> provider user message includes hidden <loaded_skills_context>
```

Reference file reading:

```text
tool call read_skill_file
  -> processReadSkillFile()
  -> resolve available skill root
  -> resolve <relative-path> inside that root
  -> reject absolute paths and traversal
  -> return full file or selected line range
```

## Test Coverage

Existing tests cover the service and part of the tool processor:

- [SkillService.test.ts](../../src/main/services/skills/__tests__/SkillService.test.ts): installs from single `SKILL.md`, installs from directory and copies assets, imports folders with conflict renaming, and installs a zip archive when archive tooling is available.
- [SkillInstallation.test.ts](../../src/main/services/skills/__tests__/SkillInstallation.test.ts): verifies publication rollback, stale transaction restoration, active transaction protection, invalid record containment, and cross-process lock contention.
- [SkillRecoveryFlow.integration.test.ts](../../src/main/services/skills/__tests__/SkillRecoveryFlow.integration.test.ts): verifies incomplete skill recovery, old-version preservation after copy failure, startup failure reporting, and symlink handling through `SkillService`.
- [SkillToolsProcessor.test.ts](../../src/main/tools/skills/__tests__/SkillToolsProcessor.test.ts): covers `unload_skill` validation and DB deletion, plus instruction-returning `load_skill`, duplicate-load behavior and script command delegation.
- [SkillPromptBuilder.test.ts](../../src/shared/services/skills/__tests__/SkillPromptBuilder.test.ts): covers available skill prompt formatting and verifies loaded skill content is omitted from the initial prompt.
- [SkillsPromptProvider.test.ts](../../src/main/hosts/chat/preparation/request/__tests__/SkillsPromptProvider.test.ts): verifies prompt assembly lists available metadata without reading loaded skill content.
- [LoadedSkillsContextProvider.test.ts](../../src/main/hosts/chat/preparation/request/__tests__/LoadedSkillsContextProvider.test.ts): verifies active chat skills are rebuilt into hidden context messages.
- [buildContextMessages.test.ts](../../src/main/hosts/chat/preparation/request/__tests__/buildContextMessages.test.ts): verifies hidden context insertion after compression summaries.
- [ContextRequest.test.ts](../../src/main/agent/runtime/context/__tests__/ContextRequest.test.ts): verifies runtime-context projection into the following user protocol message.
- [DefaultMainAgentRuntimeRunner.integration.test.ts](../../src/main/orchestration/chat/run/runtime/__tests__/DefaultMainAgentRuntimeRunner.integration.test.ts): verifies the continuation receives skill instructions in the tool result while refreshed hidden context remains metadata-only.

- [SkillToolsProcessor.execution.test.ts](../../src/main/tools/skills/__tests__/SkillToolsProcessor.execution.test.ts): runs real interpreter/shell processes against non-executable scripts, workspace inputs and outputs, skill-root overrides, nonzero exits, timeouts and cancellation.
