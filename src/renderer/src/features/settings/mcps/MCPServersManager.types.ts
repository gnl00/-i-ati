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

// Component Props
export interface MCPServersManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mcpServerConfig: McpServerConfig
  setMcpServerConfig: (config: McpServerConfig) => void
}
