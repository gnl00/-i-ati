import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { exportConfigAsJSON, getConfig, importConfigFromJSON } from '@renderer/db/ConfigRepository'
import { invokeOpenPath } from '@renderer/invoker/ipcInvoker'
import { createRendererLogger } from '@renderer/services/logging/rendererLogger'
import { useAppConfigStore } from '@renderer/store/appConfig'
import React from 'react'
import { toast } from 'sonner'

interface DataAndLogManagerProps {
  streamChunkDebugEnabled: boolean
  setStreamChunkDebugEnabled: (value: boolean) => void
}

const DataAndLogManager: React.FC<DataAndLogManagerProps> = ({
  streamChunkDebugEnabled,
  setStreamChunkDebugEnabled
}) => {
  const logger = React.useMemo(() => createRendererLogger('DataAndLogManager'), [])
  const { setAppConfig } = useAppConfigStore()

  const handleExportConfig = async () => {
    try {
      const jsonStr = await exportConfigAsJSON()
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ati-config-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Config exported successfully')
    } catch (error) {
      logger.error('config_export_failed', error)
      toast.error('Failed to export config')
    }
  }

  const handleImportConfig = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async (e) => {
      try {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        const text = await file.text()
        await importConfigFromJSON(text)

        const newConfig = await getConfig()
        if (newConfig) {
          await setAppConfig(newConfig)
          toast.success('Config imported successfully. Reloading...')
          setTimeout(() => window.location.reload(), 1000)
        }
      } catch (error: any) {
        logger.error('config_import_failed', error)
        toast.error('Failed to import config: ' + error.message)
      }
    }
    input.click()
  }

  const handleOpenLogs = async () => {
    try {
      const result = await invokeOpenPath('logs')
      if (!result.success) {
        toast.error(result.error || 'Failed to open logs folder')
        return
      }
      toast.success('Logs folder opened')
    } catch (error: any) {
      logger.error('logs_open_failed', error)
      toast.error(error?.message || 'Failed to open logs folder')
    }
  }

  return (
    <div className='w-[700px] h-[600px] focus:ring-0 focus-visible:ring-0'>
      <div className='w-full h-full space-y-2 p-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent'>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="px-4 py-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Configuration Backup
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
                  DATA
                </Badge>
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Export your configuration to a JSON file for backup or transfer to another device. You can also import a previously saved configuration.
              </p>
            </div>
          </div>
          <div className="bg-gray-50/40 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700/50">
            <div className="px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Backup & Restore</span>
              <div className="flex items-center gap-2">
                <button onClick={handleExportConfig} className="h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10">
                  <i className="ri-download-line text-[12px]" />
                  Export
                </button>
                <button onClick={handleImportConfig} className="h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-[0.97] transition-all duration-150">
                  <i className="ri-upload-line text-[12px]" />
                  Import
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="px-4 py-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Logs
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-slate-600 border-slate-200 bg-slate-50 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700">
                  LOG
                </Badge>
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Open the application logs directory to inspect daily log files, compressed archives, and runtime diagnostics.
              </p>
            </div>
          </div>
          <div className="bg-gray-50/40 dark:bg-gray-900/20 border-t border-gray-100 dark:border-gray-700/50">
            <div className="px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Log Files</span>
              <button
                onClick={handleOpenLogs}
                className="h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 active:scale-[0.97] transition-all duration-150"
              >
                <i className="ri-folder-open-line text-[12px]" />
                Open Logs
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">
          <div className="px-4 py-4 flex items-start gap-4">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="toggle-stream-chunk-debug" className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
                  Debug Mode
                </Label>
                <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800">
                  STREAM
                </Badge>
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
                Log raw stream chunks from request adapters into the daily log file. Keep this off unless you are actively debugging streaming or parser behavior.
              </p>
            </div>
            <Switch
              checked={streamChunkDebugEnabled}
              onCheckedChange={setStreamChunkDebugEnabled}
              id="toggle-stream-chunk-debug"
              className="data-[state=checked]:bg-rose-500 mt-0.5 shrink-0"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default DataAndLogManager
