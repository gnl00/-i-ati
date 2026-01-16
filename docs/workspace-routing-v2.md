# Workspace Routing V2 (Per-Request Resolution)

## Summary
Workspace resolution is now done per FileOps request using `chat_uuid` instead of relying on a global "last set" base dir. Custom workspace paths are persisted in the chat table and resolved on demand in the main process.

## Key Changes
- `workspace_path` is stored in `chats` and read via `DatabaseService.getWorkspacePathByUuid`.
- All FileOps args accept optional `chat_uuid`; renderer invoker auto-injects the current chat uuid.
- FileOps resolves base dir on each call; no global `setWorkspaceBaseDir` state.

## Breaking Changes
- `FILE_SET_WORKSPACE_BASE_DIR` IPC and `invokeSetFileOperationsBaseDir` are removed.
- Call sites must rely on `chat_uuid` (auto-injected by the FileOps invoker).

## Behavior
- If `chat_uuid` is present and a custom workspace exists, it is used.
- If `chat_uuid` is present but no custom path exists, fallback is `userData/workspaces/{chatUuid}`.
- If `chat_uuid` is missing, fallback is `userData/workspaces/tmp`.

## Notes
- Absolute paths are still supported for FileOps, with a warning when outside the chat base dir.

几个自然的下一步方向（按收益/风险）：

  1. 缓存/限流 DB 查询：FileOps 每次查 workspace_path 会打到 DB，可加简单 LRU/TTL 缓存，减少频繁查询。
  2. workspacePath 变更一致性：当用户切换/更新 workspace 时，确保 artifacts/devserver/UI 同步刷新（目前依赖 chatList 更
     新）。
  3. 权限/可写性校验：选择目录后做一次写权限检查并提示，不可写时阻止保存。


- 统一入口：封装一个 updateWorkspacePath(chatUuid, path)（放在 ChatContext 或 store action），内部顺序固定为：DB 更新
  → 更新 chatList → 触发 UI 刷新。避免各处自己 updateChat + updateChatList。
- 单一来源：新增 useCurrentWorkspacePath() / getChatWorkspacePath()（已部分实现）并确保所有消费方（Artifacts、
  DevServer、复制路径等）只读这一处，避免直接 getWorkspacePath(chatUuid)。
- 刷新链路明确：workspacePath 变化时：
    - 文件树强制刷新
    - 预览/dev server 检查并重启或停止
    - 当前选中文件/预览状态清理
- 时序保护：workspace 更新期间禁用 FileOps/预览按钮或显示 loading，确保 DB 更新完成后再触发后续操作（避免 FileOps 读取
  旧路径）。
- 补齐“复制路径”：copyWorkspacePath 目前只用 chatUuid 计算默认路径，建议改为读当前 workspacePath（避免复制错路径）。