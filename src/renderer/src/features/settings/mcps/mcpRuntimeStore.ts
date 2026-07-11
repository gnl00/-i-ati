import { create } from 'zustand'

const areStringArraysEqual = (left: string[], right: string[]): boolean => {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

const areToolMapsEqual = (left: Map<string, MCPTool[]>, right: Map<string, MCPTool[]>): boolean => {
  if (left.size !== right.size) {
    return false
  }

  for (const [serverName, leftTools] of left.entries()) {
    const rightTools = right.get(serverName)
    if (!rightTools || JSON.stringify(leftTools) !== JSON.stringify(rightTools)) {
      return false
    }
  }

  return true
}

const areErrorMapsEqual = (
  left: Record<string, string | undefined>,
  right: Record<string, string | undefined>
): boolean => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (!areStringArraysEqual(leftKeys.sort(), rightKeys.sort())) {
    return false
  }

  return leftKeys.every(key => left[key] === right[key])
}

type McpRuntimeState = {
  availableMcpTools: Map<string, MCPTool[]>
  selectedServerNames: string[]
  connectingServerNames: string[]
  lastErrorByServer: Record<string, string | undefined>
}

type McpRuntimeActions = {
  addServerTools: (serverName: string, tools: MCPTool[]) => void
  removeServerTools: (serverName: string) => void
  getServerTools: (serverName: string) => MCPTool[] | undefined
  getAllTools: () => MCPTool[]
  setSelectedServerNames: (names: string[]) => void
  addSelectedServer: (name: string) => void
  removeSelectedServer: (name: string) => void
  startConnecting: (name: string) => void
  finishConnecting: (name: string) => void
  isConnecting: (name: string) => boolean
  setServerError: (name: string, error?: string) => void
  hydrateFromSnapshot: (snapshot: McpRuntimeSnapshot) => void
  pruneServers: (validNames: string[]) => void
}

export const useMcpRuntimeStore = create<McpRuntimeState & McpRuntimeActions>((set, get) => ({
  availableMcpTools: new Map(),
  selectedServerNames: [],
  connectingServerNames: [],
  lastErrorByServer: {},

  addServerTools: (serverName, tools) => {
    const next = new Map(get().availableMcpTools)
    next.set(serverName, tools)
    set({ availableMcpTools: next })
  },

  removeServerTools: (serverName) => {
    const next = new Map(get().availableMcpTools)
    next.delete(serverName)
    set({ availableMcpTools: next })
  },

  getServerTools: (serverName) => {
    return get().availableMcpTools.get(serverName)
  },

  getAllTools: () => {
    return Array.from(get().availableMcpTools.values()).flatMap(tools => tools)
  },

  setSelectedServerNames: (names) => set({ selectedServerNames: names }),

  addSelectedServer: (name) => {
    const current = get().selectedServerNames
    if (!current.includes(name)) {
      set({ selectedServerNames: [...current, name] })
    }
  },

  removeSelectedServer: (name) => {
    const current = get().selectedServerNames
    set({ selectedServerNames: current.filter(item => item !== name) })
  },

  startConnecting: (name) => {
    const current = get().connectingServerNames
    if (!current.includes(name)) {
      set({ connectingServerNames: [...current, name] })
    }
  },

  finishConnecting: (name) => {
    const current = get().connectingServerNames
    set({ connectingServerNames: current.filter(item => item !== name) })
  },

  isConnecting: (name) => {
    return get().connectingServerNames.includes(name)
  },

  setServerError: (name, error) => {
    const next = { ...get().lastErrorByServer }
    if (!error) {
      delete next[name]
    } else {
      next[name] = error
    }
    set({ lastErrorByServer: next })
  },

  hydrateFromSnapshot: (snapshot) => {
    const availableMcpTools = new Map<string, MCPTool[]>()
    const selectedServerNames: string[] = []
    const lastErrorByServer: Record<string, string | undefined> = {}

    snapshot.servers.forEach((server) => {
      if (server.connected) {
        selectedServerNames.push(server.name)
        availableMcpTools.set(server.name, server.tools)
      }
      if (server.lastError) {
        lastErrorByServer[server.name] = server.lastError
      }
    })

    const current = get()
    if (
      areToolMapsEqual(current.availableMcpTools, availableMcpTools) &&
      areStringArraysEqual(current.selectedServerNames, selectedServerNames) &&
      current.connectingServerNames.length === 0 &&
      areErrorMapsEqual(current.lastErrorByServer, lastErrorByServer)
    ) {
      return
    }

    set({
      availableMcpTools,
      selectedServerNames,
      connectingServerNames: [],
      lastErrorByServer
    })
  },

  pruneServers: (validNames) => {
    const validSet = new Set(validNames)
    const nextTools = new Map(
      Array.from(get().availableMcpTools.entries()).filter(([serverName]) => validSet.has(serverName))
    )
    const nextSelected = get().selectedServerNames.filter(name => validSet.has(name))
    const nextConnecting = get().connectingServerNames.filter(name => validSet.has(name))
    const nextErrors = Object.fromEntries(
      Object.entries(get().lastErrorByServer).filter(([serverName]) => validSet.has(serverName))
    )

    const current = get()
    if (
      areToolMapsEqual(current.availableMcpTools, nextTools) &&
      areStringArraysEqual(current.selectedServerNames, nextSelected) &&
      areStringArraysEqual(current.connectingServerNames, nextConnecting) &&
      areErrorMapsEqual(current.lastErrorByServer, nextErrors)
    ) {
      return
    }

    set({
      availableMcpTools: nextTools,
      selectedServerNames: nextSelected,
      connectingServerNames: nextConnecting,
      lastErrorByServer: nextErrors
    })
  }
}))
