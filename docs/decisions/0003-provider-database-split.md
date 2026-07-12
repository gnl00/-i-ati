# Provider DB Split Summary

**Status:** Accepted<br>
**Date:** 2026-07-11<br>
**Related specs:** [Documentation governance](../specs/documentation-governance.md)<br>
**Related architecture:** [Provider account and model sync](../features/model-capabilities-sync.md)

## Scope
Refactor database layer to separate provider/account/model data into dedicated tables and repositories, add provider/model IPC + repository accessors, and update renderer persistence to use repository calls instead of full config saves.

## Key Changes

### Database Core + Repositories
- Added `AppDatabase` core to own connection, schema creation, index creation, and migration.
- Built-in provider definitions live in `resources/providers/providers.json`, which the renderer bundles directly and the packaged main process loads from `process.resourcesPath/providers/providers.json`.
- Added repositories:
  - `ConfigRepository`
  - `ProviderRepository`
  - `ChatRepository`
  - `ChatSkillRepository`
  - `MessageRepository`
  - `CompressedSummaryRepository`
  - `RunEventRepository`
  - `AssistantRepository`

### DatabaseService
- Now acts as a thin facade delegating to repositories.
- Initializes repositories after DB core.
- `getConfig` / `saveConfig` only persist base config; providers/accounts stored separately.
- Provider CRUD uses repo + validation (`providerId` must exist).

### Provider CRUD + Incremental Model APIs
- New IPC constants for provider/model operations.
- Main IPC handlers for provider/model save/delete/set-enabled.
- Renderer `ProviderRepository` supports:
  - provider definitions + accounts
  - model save/delete/set-enabled
- Fetch Models now runs through `provider:fetch-models` IPC. The renderer passes the selected account to main, and main performs the `/models` request through `ProviderModelsFetchService`.
- `ProviderModelsFetchService` prefers Electron `net.fetch` so model discovery follows the desktop network stack, while tests can inject a fetch implementation and runtime can fall back to global `fetch`.
- Recommended API Base URL values stop at the provider version/base segment, for example `https://ark.example.com/api/v3`. Fetch Models normalizes this to `https://ark.example.com/api/v3/models`. A fully configured `.../models` URL is preserved.

### Renderer Store & Export
- `useAppConfigStore` now persists provider/account/model changes via ProviderRepository.
- `setAppConfig` strips providers/accounts before saving.
- `exportConfigAsJSON` can optionally include providers/accounts/models by querying ProviderRepository.

## Type/Runtime Fixes
- MCP tool call args now coerced to object before calling `mcpToolCall`.
- `cancel` reason unused fixed by underscore param.

## Notable Files
- `src/main/db/core/Database.ts`
- `src/main/db/core/ProviderDefinitionLoader.ts`
- `src/main/db/repositories/*`
- `src/main/db/DatabaseService.ts`
- `src/shared/constants/index.ts`
- `src/main/main-ipc.ts`
- `src/renderer/src/infrastructure/ipc/index.ts`
- `src/renderer/src/infrastructure/persistence/ProviderRepository.ts`
- `src/renderer/src/infrastructure/config/appConfig.ts`
- `src/renderer/src/infrastructure/persistence/ConfigRepository.ts`
- `resources/providers/providers.json`

## Tests/Checks
- `pnpm exec vitest run src/shared/providers/__tests__/fetchModels.test.ts src/main/services/providers/__tests__/ProviderModelsFetchService.test.ts src/main/ipc/__tests__/providers.test.ts src/renderer/src/features/settings/providers/__tests__/FetchModelsDrawer.cacheKey.test.ts`
- `pnpm run test:package-providers` builds an unpacked app and verifies that its provider definitions are present, parseable, and byte-for-byte identical to `resources/providers/providers.json`.
- `pnpm run typecheck`
