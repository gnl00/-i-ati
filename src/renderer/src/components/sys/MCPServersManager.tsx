import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from '@renderer/components/ui/drawer'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsContent } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'
import CodeEditor from '@uiw/react-textarea-code-editor'
import {
  Check,
  Code,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Server,
  Trash2
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
  CachedServers,
  LocalServerConfig,
  MCPServersManagerProps,
  RegistryResponse,
  RegistryServerItem
} from './MCPServersManager.types'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const API_BASE_URL = 'https://registry.modelcontextprotocol.io/v0.1/servers'

// Content props (without drawer-specific props)
export interface MCPServersManagerContentProps {
  mcpServerConfig: { mcpServers?: Record<string, LocalServerConfig> }
  setMcpServerConfig: (config: any) => void
}

// Extracted core component that can be used standalone or in a drawer
export const MCPServersManagerContent: React.FC<MCPServersManagerContentProps> = ({
  mcpServerConfig,
  setMcpServerConfig
}) => {
  // State
  const [activeTab, setActiveTab] = useState<'registry' | 'local'>('local')
  const [isFetching, setIsFetching] = useState(false)
  const [registryServers, setRegistryServers] = useState<RegistryServerItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [serversCache, setServersCache] = useState<CachedServers | null>(null)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(true)
  const [configJson, setConfigJson] = useState('')
  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<RegistryServerItem[]>([])

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
        ? `${API_BASE_URL}?limit=96&cursor=${cursor}&version=latest`
        : `${API_BASE_URL}?limit=96&version=latest`

      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`)
      }

      const data: RegistryResponse = await response.json()

      setRegistryServers((prev) => (cursor ? [...prev, ...data.servers] : data.servers))
      setNextCursor(data.metadata.nextCursor)
      setHasMore(!!data.metadata.nextCursor)

      if (!cursor) {
        setServersCache({ servers: data.servers, timestamp: Date.now() })
      }
    } catch (error: any) {
      toast.error(`Failed to fetch MCP servers: ${error.message}`)
    } finally {
      setIsFetching(false)
    }
  }

  // Search servers from API
  const searchServers = async (keyword: string): Promise<void> => {
    if (!keyword.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const url = `${API_BASE_URL}?limit=96&search=${encodeURIComponent(keyword)}&version=latest`
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Search failed: ${response.statusText}`)
      const data: RegistryResponse = await response.json()
      setSearchResults(data.servers)
    } catch (error: any) {
      toast.error(`Search failed: ${error.message}`)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchSubmit = (): void => {
    if (!searchQuery.trim()) return
    const query = searchQuery.toLowerCase()
    const localResults = registryServers.filter(
      (item) =>
        item.server.name.toLowerCase().includes(query) ||
        item.server.description?.toLowerCase().includes(query) ||
        item.server.title?.toLowerCase().includes(query)
    )
    if (localResults.length > 0) return
    searchServers(searchQuery)
  }

  const loadMore = (): void => {
    if (nextCursor && !isFetching) fetchServers(nextCursor)
  }

  const isInstalled = (serverName: string): boolean => {
    return !!mcpServerConfig.mcpServers?.[serverName]
  }

  const handleInstallServer = (item: RegistryServerItem): void => {
    const serverName = item.server.name
    let config: LocalServerConfig = {}

    if (item.server.remotes?.[0]) {
      const remote = item.server.remotes[0]
      config = { type: remote.type === 'sse' ? 'sse' : 'streamableHttp', url: remote.url }
    } else if (item.server.packages?.[0]) {
      const pkg = item.server.packages[0]
      if (pkg.registryType === 'npm') {
        config = { command: 'npx', args: ['-y', pkg.identifier] }
      } else if (pkg.registryType === 'oci') {
        config = { command: 'docker', args: ['run', '-i', pkg.identifier] }
      }
    } else {
      config = {}
      toast.warning(`${serverName} has no auto-config. Please configure manually.`)
    }

    setMcpServerConfig({
      ...mcpServerConfig,
      mcpServers: { ...mcpServerConfig.mcpServers, [serverName]: config }
    })
    toast.success(`Installed ${serverName}`)
  }

  const handleUninstallServer = (serverName: string): void => {
    const newServers = { ...mcpServerConfig.mcpServers }
    delete newServers[serverName]
    setMcpServerConfig({ ...mcpServerConfig, mcpServers: newServers })
    toast.success(`Uninstalled ${serverName}`)
  }

  const handleJsonConfigChange = (newJson: string): void => {
    setConfigJson(newJson)
    try {
      const parsed = JSON.parse(newJson)
      setMcpServerConfig({ ...mcpServerConfig, mcpServers: parsed })
    } catch (error) { }
  }

  const filteredServers = useMemo(() => {
    if (!searchQuery.trim()) return registryServers
    const query = searchQuery.toLowerCase()
    const localResults = registryServers.filter(
      (item) =>
        item.server.name.toLowerCase().includes(query) ||
        item.server.description?.toLowerCase().includes(query) ||
        item.server.title?.toLowerCase().includes(query)
    )
    return localResults.length > 0 ? localResults : searchResults
  }, [registryServers, searchQuery, searchResults])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setIsSearching(false)
    }
  }, [searchQuery])

  useEffect(() => {
    if (activeTab === 'registry') {
      if (isCacheValid() && serversCache) setRegistryServers(serversCache.servers)
      else if (registryServers.length === 0) fetchServers()
    }
  }, [activeTab])

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-black/20">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mx-4 mt-4 mb-0">
          <AnimatedTabsList
            tabs={[
              {
                value: 'local',
                label: `Installed (${Object.keys(mcpServerConfig.mcpServers || {}).length})`,
                icon: <Server className="h-3.5 w-3.5" />
              },
              { value: 'registry', label: 'Registry', icon: <Globe className="h-3.5 w-3.5" /> }
            ]}
            value={activeTab}
            tabsListClassName="h-9"
          />

          {activeTab === 'local' && (
            <div className="flex items-center gap-2 px-1.5 py-0.5 rounded-full bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700/80 shadow-sm backdrop-blur-md transition-all duration-300">
              <Label
                htmlFor="edit-mode"
                className={cn(
                  "text-[9px] uppercase tracking-wider font-bold transition-colors duration-200 cursor-pointer select-none",
                  editMode === 'json' ? "text-primary" : "text-muted-foreground"
                )}
              >
                JSON
              </Label>
              <Switch
                id="edit-mode"
                checked={editMode === 'json'}
                onCheckedChange={(checked) => setEditMode(checked ? 'json' : 'visual')}
                className="scale-75 data-[state=checked]:bg-primary"
              />
            </div>
          )}
        </div>

        <TabsContent value="registry" className="flex-1 min-h-0 m-0 mt-0 flex flex-col overflow-hidden px-4 data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300">
          <div className="relative py-4 flex-none group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-foreground transition-colors" />
            <Input
              placeholder="Search registry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
              className="pl-8 h-9 text-sm bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 dark:text-gray-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 transition-all rounded-lg placeholder:text-muted-foreground/50"
              disabled={isFetching}
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 overflow-y-auto -mx-4 px-4 custom-scrollbar">
            {(isFetching && registryServers.length === 0) || isSearching ? (
              <div className="flex flex-col items-center justify-center h-64">
                <div className="relative h-10 w-10 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-gray-800 border-t-gray-900 dark:border-t-gray-100 animate-spin" />
                  <Globe className="h-4 w-4 text-gray-900 dark:text-gray-100" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mt-4 animate-pulse">
                  {isSearching ? 'Scouring the registry...' : 'Connecting to Registry...'}
                </p>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-white dark:bg-gray-900/20 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                <Search className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">No results matched your search</p>
                {searchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="mt-4 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full px-4">
                    Reset search
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5 pb-6">
                {filteredServers.map((item, idx) => {
                  const installed = isInstalled(item.server.name)
                  const connectionType = item.server.remotes?.[0]?.type || item.server.packages?.[0]?.registryType
                  const isOfficial = item._meta['io.modelcontextprotocol.registry/official']
                  const status = isOfficial?.status

                  return (
                    <div
                      key={`${item.server.name}-${idx}`}
                      className={cn(
                        "group relative p-3.5 rounded-xl border transition-all duration-300 overflow-hidden",
                        "bg-white dark:bg-gray-900/40",
                        "border-gray-200/60 dark:border-gray-800/60",
                        "shadow-sm hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20",
                        "flex items-start justify-between gap-4",
                        installed && "bg-gray-50/50 dark:bg-gray-900/10 border-gray-200/50 dark:border-gray-800/30 opacity-80 hover:opacity-100"
                      )}
                    >
                      {/* Subtle gradient overlay on hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-gray-900/0 to-gray-900/0 group-hover:from-gray-900/[0.02] group-hover:to-gray-900/[0.04] dark:group-hover:from-white/[0.02] dark:group-hover:to-white/[0.04] transition-all duration-500 pointer-events-none" />
                      <div className="flex-1 min-w-0 relative">
                        <div className="flex items-start gap-3.5 mb-2.5">
                          <div className="h-10 w-10 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center flex-shrink-0 border border-gray-100 dark:border-gray-700/50 transition-all duration-300 shadow-sm">
                            {item.server.icons?.[0] ? (
                              <img src={item.server.icons[0].src} alt="" className="h-6 w-6 rounded-sm opacity-90 group-hover:opacity-100 transition-opacity" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                            ) : (
                              <Server className="h-5 w-5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pt-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <h4 className="font-semibold text-[14px] leading-tight tracking-tight truncate text-gray-900 dark:text-gray-100">
                                {item.server.title || item.server.name}
                              </h4>
                              <div className="flex items-center gap-1.5 select-none">
                                <Badge variant="outline" className="text-[9px] font-medium h-4 px-1 py-0 text-muted-foreground border-gray-200 dark:border-gray-700 bg-transparent hover:bg-transparent">
                                  v{item.server.version}
                                </Badge>
                                {isOfficial && (
                                  <Badge className="text-[9px] font-bold bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 border-none h-4 px-1.5 rounded-sm">
                                    OFFICIAL
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground/50 font-mono tracking-tight truncate">
                              @{item.server.name}
                            </p>
                          </div>
                        </div>

                        <p className="text-xs font-sans text-gray-600 dark:text-gray-400 line-clamp-2 mb-4 leading-relaxed font-medium">
                          {item.server.description}
                        </p>

                        <div className="flex items-center gap-3.5 flex-wrap select-none">
                          {connectionType && (
                            <Badge
                              className={cn(
                                "text-[9px] font-bold uppercase px-1.5 py-0 h-4 border-none rounded-md ",
                                connectionType === 'sse' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                                  connectionType === 'npm' ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" :
                                    "bg-gray-100 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300"
                              )}
                            >
                              {connectionType}
                            </Badge>
                          )}
                          {item.server.repository && (
                            <a
                              href={item.server.repository.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 group/link transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-2.5 w-2.5 opacity-50 group-hover/link:opacity-100 transition-opacity" />
                              <span className="hover:underline underline-offset-2">
                                {item.server.repository.source}
                              </span>
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="pt-0 flex-shrink-0">
                        <Button
                          size="sm"
                          variant={installed ? 'outline' : 'default'}
                          onClick={() => handleInstallServer(item)}
                          disabled={installed}
                          className={cn(
                            'h-8 px-3.5 text-xs font-semibold transition-all duration-200 rounded-lg',
                            installed
                              ? "bg-transparent text-muted-foreground border-transparent hover:bg-transparent cursor-default px-0"
                              : "bg-gray-900 hover:bg-gray-800 text-white dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 shadow-sm"
                          )}
                        >
                          {installed ? (
                            <div className="flex items-center gap-1.5">
                              <Check className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-muted-foreground/60 text-[11px]">Installed</span>
                            </div>
                          ) : (
                            <span>Install</span>
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}

                {!searchQuery && hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={isFetching}
                      className="gap-2 px-8 py-5 rounded-2xl font-bold border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all shadow-sm"
                    >
                      {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                      {isFetching ? 'Fetching more...' : 'Load Complete Registry'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="local" className="flex-1 min-h-0 m-0 mt-0 flex flex-col overflow-hidden px-4 data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300">
          <div className="flex-1 overflow-hidden flex flex-col bg-transparent mt-4">
            {editMode === 'visual' ? (
              <div className="overflow-hidden h-full flex flex-col">
                {Object.keys(mcpServerConfig.mcpServers || {}).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground pb-12 relative">
                    {/* Decorative background elements */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/5 dark:bg-blue-400/5 rounded-full blur-3xl" />
                      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/5 dark:bg-purple-400/5 rounded-full blur-3xl" />
                    </div>

                    <div className="relative z-10 flex flex-col items-center">
                      {/* Animated icon container */}
                      <div className="relative mb-6 group">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-400/20 dark:to-purple-400/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500" />
                        <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center border border-gray-200/50 dark:border-gray-700/50 shadow-lg group-hover:scale-105 transition-transform duration-300">
                          <Server className="h-9 w-9 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors duration-300" />
                          <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-700 border-2 border-white dark:border-gray-950" />
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
                        No Servers Installed
                      </h3>
                      <p className="text-sm text-muted-foreground text-center mb-6 max-w-[280px] leading-relaxed">
                        Your workspace is ready. Install servers from the registry or configure them manually.
                      </p>

                      <div className="flex items-center gap-3">
                        <Button
                          onClick={() => setActiveTab('registry')}
                          size="sm"
                          className="h-9 px-5 text-xs font-semibold bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 shadow-sm rounded-lg transition-all duration-200"
                        >
                          Browse Registry
                        </Button>
                        <Button
                          onClick={() => setEditMode('json')}
                          size="sm"
                          variant="outline"
                          className="h-9 px-5 text-xs font-semibold border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
                        >
                          Add Manually
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto custom-scrollbar -mx-4 px-4">
                    <div className="grid grid-cols-1 gap-3 pb-6">
                      {Object.entries(mcpServerConfig.mcpServers || {}).map(([name, config], index) => {
                        const serverType = config.type || (config.command ? 'STDIO' : 'GENERIC')
                        const configDisplay = config.url || (config.command && `${config.command} ${config.args?.join(' ') || ''}`)

                        return (
                          <div
                            key={name}
                            className="group relative bg-white dark:bg-gray-900/40 rounded-xl border border-gray-200/60 dark:border-gray-800/60 transition-all duration-300 overflow-hidden shadow-sm hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20"
                            style={{
                              animationDelay: `${index * 50}ms`,
                              animation: 'fadeInUp 0.4s ease-out forwards',
                              opacity: 0
                            }}
                          >
                            {/* Subtle gradient overlay on hover */}
                            <div className="absolute inset-0 bg-gradient-to-br from-gray-900/0 to-gray-900/0 group-hover:from-gray-900/[0.02] group-hover:to-gray-900/[0.04] dark:group-hover:from-white/[0.02] dark:group-hover:to-white/[0.04] transition-all duration-500 pointer-events-none" />

                            <div className="relative p-2">
                              {/* Header section */}
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                  {/* Icon */}
                                  <div className="h-11 w-11 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center flex-shrink-0 border border-gray-200/50 dark:border-gray-700/50 transition-all duration-300 shadow-sm">
                                    <Server className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors duration-300" />
                                  </div>

                                  {/* Server info */}
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1.5 tracking-tight truncate">
                                      {name}
                                    </h4>
                                    <div className="flex items-center gap-2">
                                      <Badge
                                        variant="secondary"
                                        className={cn(
                                          "text-[9px] font-mono font-bold px-2 py-0.5 h-5 uppercase tracking-wider rounded-md border-none shadow-sm",
                                          serverType === 'sse' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                                            serverType === 'STDIO' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                                              serverType === 'streamableHttp' ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                                                "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                        )}
                                      >
                                        {serverType}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>

                                {/* Right side: Installed badge + Action buttons */}
                                <div className="flex flex-col items-end gap-2 flex-shrink-0 select-none">
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] font-bold px-2 py-0.5 h-5 uppercase tracking-wider rounded-md border-none bg-gray-50 transition-all duration-300 flex items-center gap-1"
                                  >
                                    <Check className="h-2.5 w-2.5" />
                                    Installed
                                  </Badge>

                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(config, null, 2))
                                        toast.success('Configuration copied to clipboard')
                                      }}
                                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
                                      title="Copy Configuration"
                                    >
                                      <Code className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleUninstallServer(name)}
                                      className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
                                      title="Uninstall Server"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              {/* Configuration display */}
                              {configDisplay && (
                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800/50">
                                  <div className="flex items-start gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mt-0.5 flex-shrink-0">
                                      Config
                                    </span>
                                    <code className="text-[11px] leading-relaxed text-muted-foreground font-mono break-all flex-1">
                                      {configDisplay}
                                    </code>
                                  </div>
                                </div>
                              )}

                              {!configDisplay && (
                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800/50">
                                  <p className="text-[11px] text-muted-foreground/50 italic">
                                    No configuration specified
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full overflow-hidden flex flex-col p-4 pt-0">
                <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-inner bg-gray-50/50 dark:bg-black/20">
                  <CodeEditor
                    value={configJson}
                    language="json"
                    placeholder="{}"
                    onChange={(e) => handleJsonConfigChange(e.target.value)}
                    className="h-full w-full dark:bg-gray-950/50"
                    style={{
                      fontFamily: 'JetBrains Mono, Fira Code, ui-monospace, monospace',
                      fontSize: 12,
                      height: '100%',
                      backgroundColor: 'transparent'
                    }}
                    padding={16}
                    data-color-mode="dark"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground font-medium px-1">
                  <div className="flex items-center gap-1.5">
                    <Code className="h-3 w-3" />
                    <span>DIRECT CONFIG FORMATTING</span>
                  </div>
                  <span>AUTO-SAVED</span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

const MCPServersManager: React.FC<MCPServersManagerProps> = ({
  open,
  onOpenChange,
  mcpServerConfig,
  setMcpServerConfig
}) => {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] flex flex-col bg-white dark:bg-neutral-950 border-gray-200 dark:border-gray-800 shadow-2xl">
        <DrawerHeader className="border-b border-gray-100 dark:border-gray-900 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gray-900 dark:bg-gray-100 flex items-center justify-center shadow-sm">
                <Server className="h-5 w-5 text-white dark:text-black" />
              </div>
              <div>
                <DrawerTitle className="text-xl font-black tracking-tight text-gray-900 dark:text-neutral-50 uppercase">
                  MCP Registry
                </DrawerTitle>
                <DrawerDescription className="text-xs font-semibold text-muted-foreground/60 tracking-wider">
                  EXTEND YOUR WORKSPACE WITH MODEL CONTEXT PROTOCOL
                </DrawerDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} className="rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
              <Code className="h-4 w-4" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden">
          <MCPServersManagerContent
            mcpServerConfig={mcpServerConfig}
            setMcpServerConfig={setMcpServerConfig}
          />
        </div>

        <DrawerFooter className="border-t border-gray-100 dark:border-gray-900 px-6 py-4 bg-gray-50/50 dark:bg-transparent">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground/60 tracking-tight">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                REGISTRY STATUS: ONLINE
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                V2.1 INTERFACE
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-6 font-medium border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all h-9 text-xs"
            >
              Close Manager
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export default MCPServersManager
