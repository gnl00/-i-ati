# Provider DB Split Summary

## Scope
Refactor database layer to separate provider/account/model data into dedicated tables and repositories, add provider/model IPC + repository accessors, and update renderer persistence to use repository calls instead of full config saves.

## Key Changes

### Database Core + Repositories
- Added `AppDatabase` core to own connection, schema creation, index creation, and migration.
- Added repositories:
  - `ConfigRepository`
  - `ProviderRepository`
  - `ChatRepository`
  - `ChatSkillRepository`
  - `MessageRepository`
  - `CompressedSummaryRepository`
  - `ChatSubmitEventRepository`
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

### Renderer Store & Export
- `useAppConfigStore` now persists provider/account/model changes via ProviderRepository.
- `setAppConfig` strips providers/accounts before saving.
- `exportConfigAsJSON` can optionally include providers/accounts/models by querying ProviderRepository.

## Type/Runtime Fixes
- MCP tool call args now coerced to object before calling `mcpToolCall`.
- `cancel` reason unused fixed by underscore param.

## Notable Files
- `src/main/db/Database.ts`
- `src/main/db/repositories/*`
- `src/main/services/DatabaseService.ts`
- `src/shared/constants/index.ts`
- `src/main/main-ipc.ts`
- `src/renderer/src/invoker/ipcInvoker.ts`
- `src/renderer/src/db/ProviderRepository.ts`
- `src/renderer/src/store/appConfig.ts`
- `src/renderer/src/db/ConfigRepository.ts`

## Tests/Checks
- `npm run test:run -- DatabaseService` → no tests found (expected).
- `npm run typecheck:node` still reports pre-existing errors outside this change set.
