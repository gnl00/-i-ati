# execute_command Filesystem Scope

`execute_command` includes a model-declared filesystem scope so commands that may access files outside the active workspace require user confirmation.

## Tool Arguments

```ts
filesystem_scope: 'workspace' | 'outside_workspace' | 'unknown'
filesystem_scope_reason: string
```

Scope meanings:

- `workspace`: the command is expected to access files under the active workspace root.
- `outside_workspace`: the command is expected to access files outside the active workspace root.
- `unknown`: shell expansion, variables, scripts, or command behavior make filesystem access unclear.

Missing or invalid `filesystem_scope` is treated as `unknown`.

## Runtime Assessment

The runtime combines model declaration with local command scanning:

- `~` and `~/...`
- `$HOME`, `${HOME}`, `$USERPROFILE`, `${USERPROFILE}`
- absolute paths under `/Users`, `/home`, `/etc`, `/var`, `/private`, `/Library`
- parent directory references with `..`
- `source ~/...` and `. ~/...`
- redirection to home, environment home, or common absolute external roots

The shared helper is `assessCommandFilesystemScope()` in `src/main/tools/command/filesystemScope.ts`.

## Confirmation Policy

`execute_command` requires confirmation when any condition applies:

- command risk is `warning`
- command risk is `dangerous`
- declared filesystem scope is `outside_workspace`
- declared filesystem scope is `unknown`
- inferred filesystem scope is `outside_workspace`
- inferred filesystem scope is `unknown`

The `ToolExecutor` confirmation UI payload includes:

```ts
filesystemScope
inferredFilesystemScope
filesystemReason
```

`CommandProcessor` repeats the same scope assessment as a direct-call guard before execution.

## Examples

```json
{
  "command": "cat ./package.json",
  "filesystem_scope": "workspace",
  "filesystem_scope_reason": "Reads a file under the workspace root."
}
```

Runs without filesystem-scope confirmation when command risk is safe.

```json
{
  "command": "cat ~/.zshrc",
  "filesystem_scope": "workspace",
  "filesystem_scope_reason": "Read-only inspection."
}
```

Requires confirmation because runtime infers home directory access.

```json
{
  "command": "node scripts/inspect.js",
  "filesystem_scope": "unknown",
  "filesystem_scope_reason": "The script may read paths dynamically."
}
```

Requires confirmation because the declared boundary is unclear.

## Verification

Targeted tests:

```bash
pnpm exec vitest run src/main/tools/command/__tests__/filesystemScope.test.ts src/main/tools/command/__tests__/CommandProcessor.test.ts src/main/tools/command/__tests__/risk.test.ts src/main/agent/tools/__tests__/ToolExecutor.test.ts
```
