import React, { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter
} from '@renderer/components/ui/drawer'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { Badge } from '@renderer/components/ui/badge'
import {
  Search,
  Server,
  Globe,
  Loader2,
  ExternalLink,
  Check,
  Trash2,
  Code,
  Eye
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import CodeEditor from '@uiw/react-textarea-code-editor'
import type {
  MCPServersManagerProps,
  RegistryServerItem,
  RegistryResponse,
  CachedServers,
  LocalServerConfig
} from './MCPServersManager.types'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const API_BASE_URL = 'https://registry.modelcontextprotocol.io/v0.1/servers'

const MCPServersManager: React.FC<MCPServersManagerProps> = ({
  open,
  onOpenChange,
  mcpServerConfig,
  setMcpServerConfig
}) => {
  // State
  const [activeTab, setActiveTab] = useState<'registry' | 'local'>('registry')
  const [isFetching, setIsFetching] = useState(false)
  const [registryServers, setRegistryServers] = useState<RegistryServerItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [serversCache, setServersCache] = useState<CachedServers | null>(null)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [configJson, setConfigJson] = useState('')
  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual')

  // Sync JSON from config
  useEffect(() => {
    const jsonStr = JSON.stringify(mcpServerConfig.mcpServers || {}, null, 2)
    setConfigJson(jsonStr)
  }, [mcpServerConfig])

  // Check if cache is valid
  const isCacheValid = (): boolean => {
    if (!serversCache) return false
    return Date.now() - serversCache.timestamp < CACHE_TTL
  }

  // Fetch servers from API
  const fetchServers = async (cursor?: string): Promise<void> => {
    setIsFetching(true)
    try {
      const url = cursor
        ? `${API_BASE_URL}?limit=50&cursor=${cursor}`
        : `${API_BASE_URL}?limit=50`

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`)
      }

      const data: RegistryResponse = await response.json()

      setRegistryServers((prev) => (cursor ? [...prev, ...data.servers] : data.servers))
      setNextCursor(data.metadata.nextCursor)
      setHasMore(!!data.metadata.nextCursor)

      // Update cache only for initial fetch
      if (!cursor) {
        setServersCache({ servers: data.servers, timestamp: Date.now() })
      }
    } catch (error: any) {
      toast.error(`Failed to fetch MCP servers: ${error.message}`)
    } finally {
      setIsFetching(false)
    }
  }

  // Load more servers
  const loadMore = (): void => {
    if (nextCursor && !isFetching) {
      fetchServers(nextCursor)
    }
  }

  // Check if a server is installed
  const isInstalled = (serverName: string): boolean => {
    return !!mcpServerConfig.mcpServers?.[serverName]
  }

  // Install a server
  const handleInstallServer = (item: RegistryServerItem): void => {
    const serverName = item.server.name
    let config: LocalServerConfig = {}

    // Priority 1: Use remotes
    if (item.server.remotes?.[0]) {
      const remote = item.server.remotes[0]
      config = {
        type: remote.type === 'sse' ? 'sse' : 'streamableHttp',
        url: remote.url
      }
    }
    // Priority 2: Use packages
    else if (item.server.packages?.[0]) {
      const pkg = item.server.packages[0]
      if (pkg.registryType === 'npm') {
        config = { command: 'npx', args: ['-y', pkg.identifier] }
      } else if (pkg.registryType === 'oci') {
        config = { command: 'docker', args: ['run', '-i', pkg.identifier] }
      }
    }
    // Fallback: Empty config
    else {
      config = {}
      toast.warning(`${serverName} has no auto-config. Please configure manually.`)
    }

    setMcpServerConfig({
      ...mcpServerConfig,
      mcpServers: { ...mcpServerConfig.mcpServers, [serverName]: config }
    })

    toast.success(`Installed ${serverName}`)
  }

  // Uninstall a server
  const handleUninstallServer = (serverName: string): void => {
    const newServers = { ...mcpServerConfig.mcpServers }
    delete newServers[serverName]
    setMcpServerConfig({ ...mcpServerConfig, mcpServers: newServers })
    toast.success(`Uninstalled ${serverName}`)
  }

  // Handle JSON config change
  const handleJsonConfigChange = (newJson: string): void => {
    setConfigJson(newJson)
    try {
      const parsed = JSON.parse(newJson)
      setMcpServerConfig({ ...mcpServerConfig, mcpServers: parsed })
    } catch (error) {
      // Invalid JSON, don't update config
    }
  }

  // Filter servers
  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) return registryServers
    const query = searchQuery.toLowerCase()
    return registryServers.filter(
      (item) =>
        item.server.name.toLowerCase().includes(query) ||
        item.server.description?.toLowerCase().includes(query) ||
        item.server.title?.toLowerCase().includes(query)
    )
  }, [registryServers, searchQuery])

  // Auto-fetch on drawer open
  useEffect(() => {
    if (open && activeTab === 'registry') {
      if (isCacheValid() && serversCache) {
        setRegistryServers(serversCache.servers)
      } else if (registryServers.length === 0) {
        fetchServers()
      }
    }
  }, [open, activeTab])

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] flex flex-col">
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP Servers Manager
          </DrawerTitle>
          <DrawerDescription>
            Browse and manage Model Context Protocol servers
          </DrawerDescription>
        </DrawerHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 w-fit">
            <TabsTrigger value="registry" className="gap-2">
              <Globe className="h-4 w-4" />
              Registry
            </TabsTrigger>
            <TabsTrigger value="local" className="gap-2">
              <Server className="h-4 w-4" />
              Local Config
            </TabsTrigger>
          </TabsList>

          {/* Registry Tab */}
          <TabsContent value="registry" className="flex-1 flex flex-col overflow-hidden mt-0 px-6">
            {/* Search Bar */}
            <div className="relative py-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search servers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 transition-all"
                disabled={isFetching}
              />
            </div>

            {/* Server List */}
            <div className="flex-1 overflow-y-auto -mx-6 px-6">
              {isFetching && registryServers.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Search className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No servers found</p>
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery('')}
                      className="mt-2"
                    >
                      Clear search
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {filteredServers.map((item, idx) => {
                    const installed = isInstalled(item.server.name)
                    const connectionType = item.server.remotes?.[0]?.type || item.server.packages?.[0]?.registryType
                    const isOfficial = item._meta['io.modelcontextprotocol.registry/official']
                    const status = isOfficial?.status

                    return (
                      <div
                        key={idx}
                        className={cn(
                          'p-4 rounded-lg border transition-all',
                          installed
                            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Header */}
                            <div className="flex items-start gap-2 mb-2">
                              {item.server.icons?.[0] && (
                                <img
                                  src={item.server.icons[0].src}
                                  alt=""
                                  className="h-6 w-6 rounded flex-shrink-0"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold text-sm truncate">
                                    {item.server.title || item.server.name}
                                  </h4>
                                  <Badge variant="outline" className="text-xs flex-shrink-0">
                                    v{item.server.version}
                                  </Badge>
                                  {status === 'deprecated' && (
                                    <Badge variant="destructive" className="text-xs">
                                      Deprecated
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {item.server.name}
                                </p>
                              </div>
                            </div>

                            {/* Description */}
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {item.server.description}
                            </p>

                            {/* Footer */}
                            <div className="flex items-center gap-2 flex-wrap">
                              {connectionType && (
                                <Badge variant="secondary" className="text-xs">
                                  {connectionType}
                                </Badge>
                              )}
                              {item.server.repository && (
                                <a
                                  href={item.server.repository.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {item.server.repository.source}
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Install Button */}
                          <Button
                            size="sm"
                            variant={installed ? 'outline' : 'default'}
                            onClick={() => handleInstallServer(item)}
                            disabled={installed}
                            className={cn('flex-shrink-0', installed && 'gap-1')}
                          >
                            {installed ? (
                              <>
                                <Check className="h-4 w-4" />
                                Installed
                              </>
                            ) : (
                              'Install'
                            )}
                          </Button>
                        </div>
                      </div>
                    )
                  })}

                  {/* Load More Button */}
                  {!searchQuery && hasMore && (
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="outline"
                        onClick={loadMore}
                        disabled={isFetching}
                        className="gap-2"
                      >
                        {isFetching ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          'Load More'
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Local Config Tab */}
          <TabsContent value="local" className="flex-1 flex flex-col overflow-hidden mt-0 px-6">
            <div className="py-4 border-b flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {Object.keys(mcpServerConfig.mcpServers || {}).length} server(s) installed
              </p>
              <Tabs value={editMode} onValueChange={(v) => setEditMode(v as any)} className="w-auto">
                <TabsList className="h-8">
                  <TabsTrigger value="visual" className="gap-1 text-xs h-7">
                    <Eye className="h-3 w-3" />
                    Visual
                  </TabsTrigger>
                  <TabsTrigger value="json" className="gap-1 text-xs h-7">
                    <Code className="h-3 w-3" />
                    JSON
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1 overflow-hidden">
              {editMode === 'visual' ? (
                <div className="overflow-y-auto h-full py-4">
                  {Object.keys(mcpServerConfig.mcpServers || {}).length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                      <Server className="h-12 w-12 mb-3 opacity-30" />
                      <p className="text-sm">No servers installed</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab('registry')}
                        className="mt-2"
                      >
                        Browse Registry
                      </Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Config</TableHead>
                          <TableHead className="w-20">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(mcpServerConfig.mcpServers || {}).map(([name, config]) => (
                          <TableRow key={name}>
                            <TableCell className="font-mono text-sm">{name}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {config.type || (config.command ? 'stdio' : 'unknown')}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-md">
                              <code className="text-xs text-muted-foreground block truncate">
                                {config.url ||
                                  (config.command && `${config.command} ${config.args?.join(' ') || ''}`) ||
                                  'No config'}
                              </code>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUninstallServer(name)}
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ) : (
                <div className="h-full overflow-y-auto py-4">
                  <CodeEditor
                    value={configJson}
                    language="json"
                    placeholder="{}"
                    onChange={(e) => handleJsonConfigChange(e.target.value)}
                    className="dark:bg-gray-900"
                    style={{
                      backgroundColor: '#f5f5f5',
                      fontFamily:
                        'ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace',
                      fontSize: 13,
                      minHeight: '400px'
                    }}
                    padding={15}
                    data-color-mode="dark"
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DrawerFooter className="border-t">
          <div className="flex justify-between items-center w-full">
            <p className="text-xs text-muted-foreground">
              {activeTab === 'registry'
                ? `${filteredServers.length} server(s) available`
                : `${Object.keys(mcpServerConfig.mcpServers || {}).length} server(s) installed`}
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export default MCPServersManager
