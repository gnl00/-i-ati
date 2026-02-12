import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { FileCode, Monitor } from 'lucide-react'
import React from 'react'

export const FloatingArtifactsToggle: React.FC = () => {
  const artifacts = useChatStore(state => state.artifacts)
  const artifactsPanelOpen = useChatStore(state => state.artifactsPanelOpen)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const setArtifactsActiveTab = useChatStore(state => state.setArtifactsActiveTab)

  if (!artifacts || artifactsPanelOpen) {
    return null
  }

  return (
    <div
      className={cn(
        "fixed right-2.5 top-1/3 -translate-y-1/2 flex flex-col gap-0.5 p-0.5 z-50",
        "bg-white/10 dark:bg-black/40 backdrop-blur-2xl border border-gray-200/50 dark:border-white/10 rounded-full shadow-2xl animate-in fade-in slide-in-from-right duration-500"
      )}
    >
      <button
        className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-all group relative"
        onClick={() => {
          setArtifactsActiveTab('preview')
          setArtifactsPanel(true)
        }}
        title="Open Preview"
      >
        <Monitor className="w-4 h-4" />
        <div className="absolute right-full mr-2 px-2 py-1 rounded bg-gray-900 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Preview</div>
      </button>

      <div className="mx-1.5 h-px bg-gray-200/50 dark:bg-white/10" />

      <button
        className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10 transition-all group relative"
        onClick={() => {
          setArtifactsActiveTab('files')
          setArtifactsPanel(true)
        }}
        title="Open Files"
      >
        <FileCode className="w-4 h-4" />
        <div className="absolute right-full mr-2 px-2 py-1 rounded bg-gray-900 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">Files</div>
      </button>
    </div>
  )
}

