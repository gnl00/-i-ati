import { AnimatedTabsList } from '@renderer/components/ui/animated-tabs'
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
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import {
  Code,
  Globe,
  Loader2,
  Search,
  Server
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
import MCPServerCard from './MCPServerCard'

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
      config = { type: remote.type === 'sse' ? 'sse' : 'streamableHttp', url: remote.url, description: item.server.description }
    } else if (item.server.packages?.[0]) {
      const pkg = item.server.packages[0]
      if (pkg.registryType === 'npm') {
        config = { command: 'npx', args: ['-y', pkg.identifier], description: item.server.description }
      } else if (pkg.registryType === 'oci') {
        config = { command: 'docker', args: ['run', '-i', pkg.identifier], description: item.server.description }
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
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-neutral-950/30">
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
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-gray-100/90 to-gray-50/90 dark:from-gray-800/70 dark:to-gray-900/50 border border-gray-200/70 dark:border-gray-700/50 shadow-sm backdrop-blur-md transition-all duration-300">
              <Code className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              <Label
                htmlFor="edit-mode"
                className={cn(
                  "text-[10px] uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer select-none",
                  editMode === 'json'
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-500"
                )}
              >
                JSON Mode
              </Label>
              <div className="h-3 w-px bg-gray-300 dark:bg-gray-600"></div>
              <Switch
                id="edit-mode"
                checked={editMode === 'json'}
                onCheckedChange={(checked) => setEditMode(checked ? 'json' : 'visual')}
                className="scale-90 data-[state=checked]:bg-blue-600 dark:data-[state=checked]:bg-blue-500"
              />
            </div>
          )}
        </div>

        <TabsContent value="registry" className="flex-1 min-h-0 m-0 mt-0 flex flex-col overflow-hidden px-4 data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300">
          <div className="relative py-4 flex-none group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 group-focus-within:text-foreground transition-colors" />
            <Input
              placeholder="Discover servers in the registry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
              className="pl-9 h-10 text-sm bg-white/80 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 dark:text-gray-200 placeholder:text-muted-foreground/50 shadow-sm rounded-xl
              focus-visible:ring-0 focus-visible:ring-offset-0
              focus-visible:border-blue-500 dark:focus-visible:border-blue-400
              focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus-visible:shadow-[0_0_0_3px_rgba(96,165,250,0.15)]
              transition-all duration-200
              "
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
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground bg-white/50 dark:bg-gray-900/20 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 mx-1">
                <Search className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">No results matched your search</p>
                {searchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="mt-4 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full px-4">
                    Reset search
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3 pb-6">
                {filteredServers.map((item, idx) => {
                  const installed = isInstalled(item.server.name)
                  const connectionType = item.server.remotes?.[0]?.type || item.server.packages?.[0]?.registryType

                  return (
                    <MCPServerCard
                      key={`${item.server.name}-${idx}`}
                      mode="registry"
                      name={item.server.name}
                      title={item.server.title}
                      description={item.server.description}
                      version={item.server.version}
                      iconUrl={item.server.icons?.[0]?.src}
                      connectionType={connectionType}
                      repository={item.server.repository}
                      installed={installed}
                      onInstall={() => handleInstallServer(item)}
                      animationDelay={idx * 50}
                    />
                  )
                })}

                {!searchQuery && hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      onClick={loadMore}
                      disabled={isFetching}
                      className="gap-2 px-8 py-5 rounded-2xl font-bold border-gray-200 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-900 text-foreground hover:shadow-md transition-all shadow-sm"
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

        <TabsContent value="local" className="flex-1 min-h-0 m-0 mt-0 flex flex-col overflow-hidden px-4 pb-4 data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-transparent mt-4">
            {editMode === 'visual' ? (
              <div className="overflow-hidden h-full flex flex-col">
                {Object.keys(mcpServerConfig.mcpServers || {}).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground pb-12 relative">
                    {/* Decorative background elements */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
                      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gray-200/5 dark:bg-gray-700/5 rounded-full blur-3xl" />
                      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-gray-200/5 dark:bg-gray-700/5 rounded-full blur-3xl" />
                    </div>

                    <div className="relative z-10 flex flex-col items-center">
                      {/* Animated icon container */}
                      <div className="relative mb-6 group">
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-200/20 to-gray-300/20 dark:from-gray-700/20 dark:to-gray-800/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500" />
                        <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center border border-gray-200/50 dark:border-gray-700/50 shadow-lg group-hover:scale-105 transition-transform duration-300 will-change-transform">
                          <Server className="h-9 w-9 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors duration-300" />
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
                      const fallbackDescription =
                        config.description ||
                        registryServers.find((item) => item.server.name === name)?.server.description ||
                        searchResults.find((item) => item.server.name === name)?.server.description ||
                        serversCache?.servers.find((item) => item.server.name === name)?.server.description
                      const fallbackVersion =
                        registryServers.find((item) => item.server.name === name)?.server.version ||
                        searchResults.find((item) => item.server.name === name)?.server.version ||
                        serversCache?.servers.find((item) => item.server.name === name)?.server.version

                      return (
                        <MCPServerCard
                          key={name}
                          mode="installed"
                          name={name}
                          description={fallbackDescription}
                          version={fallbackVersion}
                          connectionType={serverType}
                          configDisplay={configDisplay || undefined}
                          onCopyConfig={() => {
                            navigator.clipboard.writeText(JSON.stringify(config, null, 2))
                            toast.success('Configuration copied to clipboard')
                          }}
                          onUninstall={() => handleUninstallServer(name)}
                          animationDelay={index * 50}
                        />
                      )
                    })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full overflow-hidden flex flex-col gap-3">
                <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-gray-200/80 dark:border-gray-700/60 shadow-sm bg-white dark:bg-gray-900/60 backdrop-blur-sm relative">
                  <CodeMirror
                    value={configJson}
                    height="100%"
                    extensions={[json()]}
                    onChange={(value) => handleJsonConfigChange(value)}
                    theme="dark"
                    basicSetup={{
                      lineNumbers: true,
                      highlightActiveLineGutter: true,
                      highlightSpecialChars: true,
                      foldGutter: true,
                      drawSelection: true,
                      dropCursor: true,
                      allowMultipleSelections: true,
                      indentOnInput: true,
                      syntaxHighlighting: true,
                      bracketMatching: true,
                      closeBrackets: true,
                      autocompletion: true,
                      rectangularSelection: true,
                      crosshairCursor: true,
                      highlightActiveLine: true,
                      highlightSelectionMatches: true,
                      closeBracketsKeymap: true,
                      defaultKeymap: true,
                      searchKeymap: true,
                      historyKeymap: true,
                      foldKeymap: true,
                      completionKeymap: true,
                      lintKeymap: true
                    }}
                    style={{
                      fontFamily: 'JetBrains Mono, Fira Code, ui-monospace, monospace',
                      fontSize: '13px',
                      height: '100%'
                    }}
                  />
                </div>

                <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-gray-100/80 to-gray-50/80 dark:from-gray-800/60 dark:to-gray-900/40 border border-gray-200/60 dark:border-gray-700/40 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gray-900 dark:bg-gray-100 flex items-center justify-center shadow-sm">
                      <Code className="h-3.5 w-3.5 text-white dark:text-black" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">JSON Edit Mode</span>
                      <span className="text-[9px] font-medium text-muted-foreground/70">Direct configuration mode</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-700/30">
                      <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Auto-Saved</span>
                    </div>
                  </div>
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
