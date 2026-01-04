// Registry API types
export interface RegistryServerItem {
  server: {
    $schema?: string
    name: string // e.g., "ai.exa/exa"
    description: string
    title?: string
    repository?: {
      url: string
      source: string
    }
    version: string
    icons?: Array<{ src: string }>
    packages?: Array<{
      registryType: string
      identifier: string
      transport: { type: string }
      environmentVariables?: Array<{
        name: string
        description: string
        format?: string
        isSecret: boolean
      }>
    }>
    remotes?: Array<{
      type: 'sse' | 'streamable-http'
      url: string
    }>
  }
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: string
      publishedAt: string
      updatedAt: string
      isLatest: boolean
    }
  }
}

export interface RegistryResponse {
  servers: RegistryServerItem[]
  metadata: {
    nextCursor?: string
    count: number
  }
}

// Caching types
export interface CachedServers {
  servers: RegistryServerItem[]
  timestamp: number
}

// Local configuration types
export interface LocalServerConfig {
  type?: 'sse' | 'streamableHttp'
  url?: string
  command?: string
  args?: string[]
  env?: string[]
}

// Component Props
export interface MCPServersManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mcpServerConfig: { mcpServers?: Record<string, LocalServerConfig> }
  setMcpServerConfig: (config: any) => void
}
