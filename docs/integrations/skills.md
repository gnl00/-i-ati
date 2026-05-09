# Skills

This app supports Agent Skills as file-based capability packages. A skill is installed into the Electron app data directory, appears in the system prompt as an available capability, and can be activated on demand through the `load_skill` tool. Activated skill documents are injected into model context as hidden user messages sourced from the current chat's `chat_skills` rows.

## File Format

Installed skills live under `app.getPath('userData')/skills`:

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

Installed metadata is represented by `SkillMetadata` in [src/types/index.d.ts](/Users/gnl/Workspace/code/-i-ati/src/types/index.d.ts:286). The app keeps both `name` and `frontmatterName` because the directory name can be normalized or conflict-renamed while the original frontmatter name remains useful for display/debugging.

## Main-Process Service

[SkillService](/Users/gnl/Workspace/code/-i-ati/src/main/services/skills/SkillService.ts:1) owns installation, listing, content reading, deletion, startup sync, and metadata caching.

The service installs skills into `userData/skills` from:

- local `SKILL.md` files
- local skill directories
- local `.zip`, `.tar`, `.tar.gz`, and `.tgz` archives
- remote `SKILL.md` URLs
- remote archive URLs
- recursively scanned folders containing one or more `SKILL.md` files

Installation validates frontmatter, normalizes the skill name with `^[a-z0-9]+(?:-[a-z0-9]+)*$`, copies the source directory or writes the `SKILL.md`, records the source in `.skill-source.json`, and marks the in-memory metadata cache dirty.

Archive installation extracts to a temporary directory, rejects unsafe archive paths, scans up to depth 5 for `SKILL.md`, and requires exactly one skill directory for single-skill archive installs. Local extraction uses system `tar`/`unzip`.

`listSkills()` reads installed skill directories and returns sorted `SkillMetadata[]`. It uses an in-memory cache and a config DB cache keyed by `skillsMetadataCache`; cache validity is based on installed `SKILL.md` mtimes and root path. Invalid skill directories are skipped with a warning.

`importSkillsFromFolder(folderPath)` recursively finds skill directories under a configured folder. It overwrites a previously imported skill when `.skill-source.json` points to the same source path. When a new source conflicts by normalized name, it creates a unique name by appending the scanned folder name and, if needed, a numeric suffix.

`initializeFromConfig(config)` runs on app startup from [src/main/index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/index.ts:1) and imports every path in `config.skills.folders`.

## Embedded Tools

The model-facing tool definitions live in [src/shared/tools/skills/definitions.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/skills/definitions.ts:1), with tool metadata in [src/shared/tools/skills/metadata.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/tools/skills/metadata.ts:1). Main handlers are registered through [src/main/tools/index.ts](/Users/gnl/Workspace/code/-i-ati/src/main/tools/index.ts:1).

The available skill tools are:

- `install_skill`: install one skill from a URL, file, directory, or archive.
- `load_skill`: activate an installed skill for the current chat and return a lightweight status result.
- `import_skills`: recursively import all skills from a folder.
- `unload_skill`: remove a skill from the current chat.
- `read_skill_file`: read a text file inside an installed skill directory.

[SkillToolsProcessor](/Users/gnl/Workspace/code/-i-ati/src/main/tools/skills/SkillToolsProcessor.ts:1) adapts tool calls to services and database writes:

- Relative install/import sources resolve against the current chat workspace when `chat_uuid` is available, then fall back to `userData`.
- `load_skill` requires `chat_uuid`, verifies the installed `SKILL.md`, resolves the chat row, writes the skill name to `chat_skills` when it is absent, and returns `{ success, name, loaded, contextInjected }`.
- `unload_skill` requires `chat_uuid`, resolves the chat row, and deletes the row from `chat_skills`.
- `read_skill_file` accepts only a relative path inside the installed skill root and rejects path traversal.

The tool metadata marks `install_skill`, `import_skills`, `load_skill`, and `unload_skill` as `riskLevel: 'warning'`; `read_skill_file` is `riskLevel: 'none'`.

## IPC And Renderer UI

[src/main/ipc/skills.ts](/Users/gnl/Workspace/code/-i-ati/src/main/ipc/skills.ts:1) exposes the service and processor through Electron IPC:

- `skill:list`
- `skill:get`
- `skill:read-file`
- `skill:install`
- `skill:load`
- `skill:unload`
- `skill:import-folder`
- `skill:delete`

Renderer helpers live in [src/renderer/src/services/skills/SkillService.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/services/skills/SkillService.ts:1), [src/renderer/src/tools/skills/renderer/SkillToolsInvoker.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/tools/skills/renderer/SkillToolsInvoker.ts:1), and [src/renderer/src/invoker/ipcInvoker.ts](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/invoker/ipcInvoker.ts:1).

[SkillsManager](/Users/gnl/Workspace/code/-i-ati/src/renderer/src/components/settings/skills/SkillsManager.tsx:1) is the Settings UI for skills. It:

- lists installed skills and active skills for the current chat
- stores watched folders in `appConfig.skills.folders`
- lets users add a folder through the directory picker
- imports one folder immediately after adding it
- validates and rescans all configured folders
- removes invalid folder paths from config
- filters installed skills by name, description, compatibility, and allowed tools
- deletes installed skills

The current UI displays active status. Chat activation and deactivation are handled by the model-facing `load_skill` and `unload_skill` tools or by DB helpers.

## Chat Load State

Loaded skill state is stored per chat in SQLite. The `chat_skills` table contains `chat_id`, `skill_name`, `load_order`, and `loaded_at` ([src/main/db/core/Database.ts](/Users/gnl/Workspace/code/-i-ati/src/main/db/core/Database.ts:135)).

[SkillDao](/Users/gnl/Workspace/code/-i-ati/src/main/db/dao/SkillDao.ts:1) inserts and deletes skill rows and returns skills ordered by `load_order`. [ChatRepository](/Users/gnl/Workspace/code/-i-ati/src/main/db/repositories/ChatRepository.ts:58) materializes `load_order` as the current max plus one.

`processLoadSkill()` checks `DatabaseService.getSkills(chat.id)` before inserting, so repeated `load_skill` calls for the same chat return a successful status without adding another row. The schema itself does not enforce a unique `(chat_id, skill_name)` constraint, so a database-level unique index or DAO upsert would make this invariant stronger.

## Prompt Injection

The chat request pipeline uses [SkillsPromptProvider](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/preparation/request/SkillsPromptProvider.ts:1). For each request it:

1. Lists all installed skills through `SkillService.listSkills()`.
2. Builds `<skills_context>` with [buildSkillsPrompt](/Users/gnl/Workspace/code/-i-ati/src/shared/services/skills/SkillPromptBuilder.ts:1).
3. Wraps it in `<skills_system>` policy text through [buildSkillsSystemPrompt](/Users/gnl/Workspace/code/-i-ati/src/shared/prompts/skills.ts:1).

The generated context has one data section:

- `Available Skills`: every installed skill as `name: description`, plus `allowed-tools` when present.

The system prompt tells the model that available skills are discoverable options. When the current task clearly matches an available skill, the model should call `load_skill`; the tool result confirms activation, and the runtime injects the active skill documents through a hidden user context message.

## Loaded Skills Context Injection

Loaded skill content is assembled by [LoadedSkillsContextProvider](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/preparation/request/LoadedSkillsContextProvider.ts:1) and [buildLoadedSkillsContextMessage](/Users/gnl/Workspace/code/-i-ati/src/shared/services/skills/LoadedSkillsContext.ts:1).

For every chat request, `RunRequestFactory` reads `chat_skills` for the current chat, loads each active `SKILL.md`, and passes a virtual context message to `RequestMessageBuilder`.

The injected message shape is:

```ts
{
  role: 'user',
  source: MESSAGE_SOURCE.SKILLS_CONTEXT,
  content: '<loaded_skills_context>...</loaded_skills_context>',
  segments: []
}
```

`RequestMessageBuilder` inserts this virtual message before the latest user message. With compression enabled, the order becomes:

```text
system prompt
user: [Previous conversation summary ...]
user: <loaded_skills_context>...</loaded_skills_context>
user: latest user request
```

During the same run, `AgentLoop` refreshes the hidden context after successful `load_skill` or `unload_skill` tool results by using `ChatLoadedSkillsTranscriptContextProvider`. This makes the next model continuation see the updated active skill set within the same run.

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
  -> verify userData/skills/<name>/SKILL.md
  -> DatabaseService.getChatByUuid(chat_uuid)
  -> SkillService.getSkillContent(name)
  -> DatabaseService.addSkill(chat.id, name)
  -> return { success, name, loaded, contextInjected }
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
  -> RequestMessageBuilder.setEphemeralContextMessages([...])
  -> provider request messages include hidden <loaded_skills_context>
```

Reference file reading:

```text
tool call read_skill_file
  -> processReadSkillFile()
  -> resolve userData/skills/<name>/<relative-path>
  -> reject absolute paths and traversal
  -> return full file or selected line range
```

## Test Coverage

Existing tests cover the service and part of the tool processor:

- [SkillService.test.ts](/Users/gnl/Workspace/code/-i-ati/src/main/services/skills/__tests__/SkillService.test.ts:1): installs from single `SKILL.md`, installs from directory and copies assets, imports folders with conflict renaming, and installs a zip archive when archive tooling is available.
- [SkillToolsProcessor.test.ts](/Users/gnl/Workspace/code/-i-ati/src/main/tools/skills/__tests__/SkillToolsProcessor.test.ts:1): covers `unload_skill` validation and DB deletion, plus `load_skill` lightweight status and duplicate-load behavior.
- [SkillPromptBuilder.test.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/services/skills/__tests__/SkillPromptBuilder.test.ts:1): covers available skill prompt formatting and verifies loaded skill content is omitted from the initial prompt.
- [SkillsPromptProvider.test.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/preparation/request/__tests__/SkillsPromptProvider.test.ts:1): verifies prompt assembly lists available metadata without reading loaded skill content.
- [LoadedSkillsContextProvider.test.ts](/Users/gnl/Workspace/code/-i-ati/src/main/hosts/chat/preparation/request/__tests__/LoadedSkillsContextProvider.test.ts:1): verifies active chat skills are rebuilt into hidden context messages.
- [RequestMessageBuilder.test.ts](/Users/gnl/Workspace/code/-i-ati/src/shared/services/__tests__/RequestMessageBuilder.test.ts:1): verifies hidden context insertion after compression summaries.
- [DefaultMainAgentRuntimeRunner.integration.test.ts](/Users/gnl/Workspace/code/-i-ati/src/main/orchestration/chat/run/runtime/__tests__/DefaultMainAgentRuntimeRunner.integration.test.ts:1): verifies `load_skill` refreshes hidden context before same-run continuation.

Useful next test targets are `install_skill`, `import_skills`, `read_skill_file` traversal rejection, IPC registration, renderer folder rescan behavior, startup `initializeFromConfig`, and a database-level uniqueness/upsert path for `chat_skills`.
