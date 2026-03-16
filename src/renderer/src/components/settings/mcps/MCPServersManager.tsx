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
import { useMcpConnection } from '@renderer/hooks/useMcpConnection'
import { useMcpRuntimeStore } from '@renderer/store/mcpRuntime'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import {
  Code,
  Clipboard,
  Globe,
  Loader2,
  Search,
  Server
} from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
  CachedServers,
  MCPServersManagerProps,
  RegistryResponse,
  RegistryServerItem
} from './MCPServersManager.types'
import MCPServerCard from './MCPServerCard'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const API_BASE_URL = 'https://registry.modelcontextprotocol.io/v0.1/servers'

// Content props (without drawer-specific props)
export interface MCPServersManagerContentProps {
  mcpServerConfig: McpServerConfig
  setMcpServerConfig: (config: McpServerConfig) => void
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
  const selectedServerNames = useMcpRuntimeStore(state => state.selectedServerNames)
  const connectingServerNames = useMcpRuntimeStore(state => state.connectingServerNames)
  const availableMcpTools = useMcpRuntimeStore(state => state.availableMcpTools)
  const lastErrorByServer = useMcpRuntimeStore(state => state.lastErrorByServer)
  const { hydrateFromRuntime } = useMcpConnection()

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
    let config: LocalMcpServerConfig = {}

    if (item.server.remotes?.[0]) {
      const remote = item.server.remotes[0]
      config = { type: remote.type === 'sse' ? 'sse' : 'streamableHttp', url: remote.url, description: item.server.description, version: item.server.version }
    } else if (item.server.packages?.[0]) {
      const pkg = item.server.packages[0]
      if (pkg.registryType === 'npm') {
        config = { command: 'npx', args: ['-y', pkg.identifier], description: item.server.description, version: item.server.version }
      } else if (pkg.registryType === 'oci') {
        config = { command: 'docker', args: ['run', '-i', pkg.identifier], description: item.server.description, version: item.server.version }
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

  const handleAddFromClipboard = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text)
      const servers = parsed?.mcpServers
      if (!servers || typeof servers !== 'object') {
        toast.error('Clipboard JSON must include "mcpServers" object')
        return
      }
      setMcpServerConfig({
        ...mcpServerConfig,
        mcpServers: { ...(mcpServerConfig.mcpServers || {}), ...servers }
      })
      toast.success('MCP servers imported from clipboard')
    } catch (error: any) {
      toast.error(`Failed to import from clipboard: ${error.message}`)
    }
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
    void hydrateFromRuntime()
  }, [hydrateFromRuntime])

  useEffect(() => {
    if (activeTab === 'registry') {
      if (isCacheValid() && serversCache) setRegistryServers(serversCache.servers)
      else if (registryServers.length === 0) fetchServers()
    }
  }, [activeTab])

  const getRuntimeStatus = (serverName: string): 'connected' | 'connecting' | 'error' | 'idle' => {
    if (connectingServerNames.includes(serverName)) {
      return 'connecting'
    }
    if (selectedServerNames.includes(serverName)) {
      return 'connected'
    }
    if (lastErrorByServer[serverName]) {
      return 'error'
    }
    return 'idle'
  }

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-neutral-950/30">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col overflow-hidden">

        {/* ── Tab bar + toolbar ─────────────────────────────────── */}
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
            <div className="flex items-center gap-3">
              <button
                onClick={handleAddFromClipboard}
                className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all duration-150"
              >
                <Clipboard className="h-3 w-3" />
                From Clipboard
              </button>
              <div className="flex items-center gap-2">
                <Code className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                <Label
                  htmlFor="edit-mode"
                  className={cn(
                    "text-[11px] font-medium transition-colors duration-150 cursor-pointer select-none",
                    editMode === 'json'
                      ? "text-gray-700 dark:text-gray-200"
                      : "text-gray-400 dark:text-gray-500"
                  )}
                >
                  JSON
                </Label>
                <Switch
                  id="edit-mode"
                  checked={editMode === 'json'}
                  onCheckedChange={(checked) => setEditMode(checked ? 'json' : 'visual')}
                  className="scale-90 data-[state=checked]:bg-gray-700 dark:data-[state=checked]:bg-gray-300"
                />
              </div>
            </div>
          )}

          {activeTab === 'registry' && (
            <div className="relative flex-1 max-w-[280px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <Input
                placeholder="Search registry… Enter"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                className="pl-8 h-8 text-[12px] bg-white dark:bg-gray-900/40 border-gray-200 dark:border-gray-700/60 dark:text-gray-200
                  placeholder:text-gray-400/60 dark:placeholder:text-gray-600 shadow-none rounded-lg
                  focus-visible:ring-2 focus-visible:ring-gray-300/80 dark:focus-visible:ring-gray-600/80 focus-visible:ring-offset-0
                  focus-visible:border-gray-400 dark:focus-visible:border-gray-500
                  transition-all duration-200"
                disabled={isFetching}
              />
              {isSearching && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400" />
              )}
            </div>
          )}
        </div>

        {/* ── Registry tab ─────────────────────────────────────── */}
        <TabsContent value="registry" className="flex-1 min-h-0 m-0 mt-0 flex flex-col overflow-hidden px-4 data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300">
          <div className="flex-1 overflow-y-auto -mx-4 px-4 pt-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {(isFetching && registryServers.length === 0) || isSearching ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="relative h-9 w-9 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-gray-800 border-t-gray-600 dark:border-t-gray-400 animate-spin" />
                  <Globe className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                </div>
                <p className="text-[12px] font-medium text-gray-400 dark:text-gray-500">
                  {isSearching ? 'Searching registry…' : 'Connecting to registry…'}
                </p>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                </div>
                <div className="space-y-0.5 text-center">
                  <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">No results matched your search</p>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="text-[11.5px] text-gray-400 dark:text-gray-500 underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                      Clear search
                    </button>
                  )}
                </div>
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
                      runtimeStatus={installed ? getRuntimeStatus(item.server.name) : 'idle'}
                      runtimeError={lastErrorByServer[item.server.name]}
                      toolCount={availableMcpTools.get(item.server.name)?.length}
                      onInstall={() => handleInstallServer(item)}
                      animationDelay={idx * 50}
                    />
                  )
                })}

                {!searchQuery && hasMore && (
                  <div className="flex justify-center pt-4 pb-2">
                    <button
                      onClick={loadMore}
                      disabled={isFetching}
                      className="h-8 px-5 flex items-center gap-2 rounded-lg text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 disabled:opacity-40 disabled:pointer-events-none transition-all duration-150"
                    >
                      {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                      {isFetching ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Local / Installed tab ─────────────────────────────── */}
        <TabsContent value="local" className="flex-1 min-h-0 m-0 mt-0 flex flex-col overflow-hidden px-4 pb-4 data-[state=inactive]:hidden data-[state=active]:animate-in data-[state=active]:fade-in data-[state=active]:duration-300">
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-transparent mt-4">
            {editMode === 'visual' ? (
              <div className="overflow-hidden h-full flex flex-col">
                {Object.keys(mcpServerConfig.mcpServers || {}).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2.5 pb-10">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs">
                      <Server className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <div className="space-y-1 text-center">
                      <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-200 tracking-tight">No servers installed</p>
                      <p className="text-[12px] text-gray-400 dark:text-gray-500 max-w-[260px] leading-relaxed">
                        Browse the registry or paste a JSON config to get started.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => setActiveTab('registry')}
                        className="h-8 px-4 rounded-md text-[12px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10"
                      >
                        Browse Registry
                      </button>
                      <button
                        onClick={() => setEditMode('json')}
                        className="h-8 px-4 rounded-md text-[12px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150"
                      >
                        Add Manually
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent -mx-4 px-4">
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
                          config.version ||
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
                            runtimeStatus={getRuntimeStatus(name)}
                            runtimeError={lastErrorByServer[name]}
                            toolCount={availableMcpTools.get(name)?.length}
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
                <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-gray-200/80 dark:border-gray-700/60 shadow-xs bg-white dark:bg-gray-900/60 relative">
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

                <div className="shrink-0 flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/40">
                  <div className="flex items-center gap-2">
                    <Code className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">JSON Edit Mode</span>
                  </div>
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Auto-saved</span>
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
              <div className="h-10 w-10 rounded-xl bg-gray-900 dark:bg-gray-100 flex items-center justify-center shadow-xs">
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
              <i className="ri-close-line text-[18px] text-gray-500 dark:text-gray-400" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-hidden">
          <MCPServersManagerContent
            mcpServerConfig={mcpServerConfig}
            setMcpServerConfig={setMcpServerConfig}
          />
        </div>

        <DrawerFooter className="border-t border-gray-100 dark:border-gray-900 px-6 py-3 bg-gray-50/50 dark:bg-transparent">
          <div className="flex justify-end w-full">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-5 font-medium border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900 transition-all h-8 text-[12px]"
            >
              Close
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export default MCPServersManager
