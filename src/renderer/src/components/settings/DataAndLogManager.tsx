import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { exportConfigAsJSON, getConfig, importConfigFromJSON } from '@renderer/db/ConfigRepository'
import { invokeOpenPath } from '@renderer/invoker/ipcInvoker'
import { createRendererLogger } from '@renderer/services/logging/rendererLogger'
import { useAppConfigStore } from '@renderer/store/appConfig'
import React from 'react'
import { toast } from 'sonner'
import {
  SettingsPageShell,
  SettingsSection,
  SettingsSectionHeader,
  SettingsToolbar,
  SettingsToolbarLabel,
  settingsOutlineButtonClassName,
  settingsPrimaryButtonClassName
} from './common/SettingsLayout'

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
    <SettingsPageShell scrollable contentClassName="space-y-2">
      <SettingsSection>
        <SettingsSectionHeader
          title={<Label className="cursor-default">Configuration Backup</Label>}
          badges={(
            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">
              DATA
            </Badge>
          )}
          description="Export your configuration to a JSON file for backup or transfer to another device. You can also import a previously saved configuration."
        />
        <SettingsToolbar>
          <div className="flex items-center justify-between gap-4">
            <SettingsToolbarLabel>Backup & Restore</SettingsToolbarLabel>
            <div className="flex items-center gap-2">
              <button onClick={handleExportConfig} className={settingsPrimaryButtonClassName}>
                <i className="ri-download-line text-[12px]" />
                Export
              </button>
              <button onClick={handleImportConfig} className={settingsOutlineButtonClassName}>
                <i className="ri-upload-line text-[12px]" />
                Import
              </button>
            </div>
          </div>
        </SettingsToolbar>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title={<Label className="cursor-default">Logs</Label>}
          badges={(
            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-slate-600 border-slate-200 bg-slate-50 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700">
              LOG
            </Badge>
          )}
          description="Open the application logs directory to inspect daily log files, compressed archives, and runtime diagnostics."
        />
        <SettingsToolbar>
          <div className="flex items-center justify-between gap-4">
            <SettingsToolbarLabel>Log Files</SettingsToolbarLabel>
            <button
              onClick={handleOpenLogs}
              className={settingsOutlineButtonClassName}
            >
              <i className="ri-folder-open-line text-[12px]" />
              Open Logs
            </button>
          </div>
        </SettingsToolbar>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title={(
            <Label htmlFor="toggle-stream-chunk-debug" className="cursor-default">
              Debug Mode
            </Label>
          )}
          badges={(
            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-rose-600 border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800">
              REQUEST
            </Badge>
          )}
          description="Log provider request bodies into the request log and raw stream chunks into the daily log. Use this while debugging streaming, parser, or provider request behavior."
          actions={(
            <Switch
              checked={streamChunkDebugEnabled}
              onCheckedChange={setStreamChunkDebugEnabled}
              id="toggle-stream-chunk-debug"
              className="data-[state=checked]:bg-rose-500 mt-0.5 shrink-0"
            />
          )}
        />
      </SettingsSection>
    </SettingsPageShell>
  )
}

export default DataAndLogManager
