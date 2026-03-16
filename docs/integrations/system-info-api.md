# SystemInfo API

在 Renderer 进程中获取操作系统信息。

## 实现方式

通过 **Preload + ContextBridge** 在应用启动时获取 OS 信息，同步暴露给 Renderer 进程。

- ✅ 同步访问，无需 await
- ✅ 无 IPC 开销
- ✅ 符合 Electron 最佳实践
- ✅ 类型安全

## API 定义

```typescript
interface SystemInfo {
  platform: NodeJS.Platform  // 'darwin' | 'win32' | 'linux' | 'freebsd' | 'openbsd'
  arch: string               // 'x64' | 'arm64' | 'arm' | 'ia32' | ...
  osType: string             // 'Darwin' | 'Windows_NT' | 'Linux' | ...
}

window.systemInfo(): SystemInfo
```

## 使用示例

```typescript
// 基础使用
const sysInfo = window.systemInfo()

console.log(sysInfo.platform) // 'darwin' (macOS)
console.log(sysInfo.arch)     // 'arm64' (Apple Silicon)
console.log(sysInfo.osType)   // 'Darwin'

// 条件判断
const sysInfo = window.systemInfo()
if (sysInfo.platform === 'darwin') {
  // macOS 特定逻辑
}

// 类型导入
import type { SystemInfo } from '@preload/index.d'

const sysInfo: SystemInfo = window.systemInfo()
```

## Platform 常用值

| Platform | 说明 |
|----------|------|
| `darwin` | macOS |
| `win32` | Windows (包括 64 位) |
| `linux` | Linux |
| `freebsd` | FreeBSD |
| `openbsd` | OpenBSD |

## Arch 常用值

| Arch | 说明 |
|------|------|
| `x64` | 64-bit x86 |
| `arm64` | 64-bit ARM (Apple Silicon) |
| `arm` | 32-bit ARM |
| `ia32` | 32-bit x86 |

## 相关文件

- **实现**: `src/preload/index.ts:6-10,18,26`
- **类型**: `src/preload/index.d.ts:3-7,12`
