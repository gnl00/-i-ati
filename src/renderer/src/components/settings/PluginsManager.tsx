import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'

interface PluginsManagerProps {
  plugins: AppPluginConfig[]
  setPlugins: (plugins: AppPluginConfig[]) => void
}

const PluginsManager: React.FC<PluginsManagerProps> = ({ plugins, setPlugins }) => {
  const activeCount = plugins.filter(p => p.enabled).length
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null)

  const handleToggle = (pluginId: string, enabled: boolean): void => {
    setPlugins(plugins.map(p => p.id === pluginId ? { ...p, enabled } : p))
  }

  const handleRemove = (pluginId: string): void => {
    setConfirmingId(null)
    setPlugins(plugins.filter(p => p.id !== pluginId))
  }

  return (
    <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
      <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-gray-500'>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">

          {/* Header */}
          <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-700/50">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                    Plugins
                  </Label>
                  <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
                    {plugins.length} installed
                  </Badge>
                  {activeCount > 0 && (
                    <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">
                      {activeCount} active
                    </Badge>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  Manage built-in adapter plugins for compatibility and integration.
                </p>
              </div>
              <Button
                size="xs"
                className="h-7 rounded-full px-3 text-[11px] font-medium shadow-none bg-linear-to-r from-gray-900 to-gray-700 hover:from-gray-900 hover:to-gray-800 dark:from-gray-100 dark:to-gray-200 dark:hover:from-white dark:hover:to-gray-100 text-white dark:text-gray-900 transition-all duration-200 active:scale-[0.97]"
              >
                <i className="ri-upload-2-line mr-1.5 text-[11px]"></i>
                Load Plugin
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="bg-gray-50/40 dark:bg-gray-900/30 divide-y divide-gray-100 dark:divide-gray-800/70">

            {plugins.length === 0 && (
              <div className="py-10 flex flex-col items-center gap-2.5 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <i className="ri-plug-line text-[15px] text-gray-400 dark:text-gray-500"></i>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">No plugins installed</p>
                  <p className="text-[11.5px] text-gray-400 dark:text-gray-500">Use Load Plugin to add an adapter package.</p>
                </div>
              </div>
            )}

            {plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="group flex items-start justify-between gap-4 px-5 py-3.5 hover:bg-white/70 dark:hover:bg-gray-800/40 transition-colors duration-150"
              >
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">{plugin.name}</span>
                    {plugin.enabled && (
                      <Badge variant="secondary" className="text-[9.5px] h-[18px] px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                        Active
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-gray-400 border-gray-200/80 bg-transparent dark:text-gray-500 dark:border-gray-700 font-normal">
                      Built-in
                    </Badge>
                  </div>
                  {plugin.description && (
                    <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">{plugin.description}</p>
                  )}
                  <p className="font-mono text-[10px] text-gray-400/60 dark:text-gray-600 tracking-tight">{plugin.id}</p>
                </div>

                <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
                  {confirmingId === plugin.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="h-6 px-2 rounded-md text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleRemove(plugin.id)}
                        className="h-6 px-2 rounded-md text-[11px] font-medium text-white bg-rose-500 hover:bg-rose-600 active:scale-[0.97] transition-all duration-150"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(plugin.id)}
                      className="h-6 w-6 flex items-center justify-center rounded-md text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-0 group-hover:opacity-100 transition-all duration-150"
                      aria-label="Uninstall"
                    >
                      <i className="ri-delete-bin-line text-[13px]"></i>
                    </button>
                  )}
                  <Switch
                    checked={Boolean(plugin.enabled)}
                    onCheckedChange={(checked) => handleToggle(plugin.id, checked)}
                    className="data-[state=checked]:bg-amber-500 scale-90 origin-center"
                  />
                </div>
              </div>
            ))}

          </div>
        </div>
      </div>
    </div>
  )
}

export default PluginsManager
