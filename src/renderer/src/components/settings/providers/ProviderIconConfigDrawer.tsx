import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@renderer/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@renderer/components/ui/drawer'
import { getProviderIcon } from '@renderer/utils/providerIcons'
import { ProviderIconPicker } from './ProviderIconPicker'

type ProviderIconConfigDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerDefinition?: ProviderDefinition
  onSave: (iconKey: string | undefined) => void
  trigger: React.ReactNode
}

export const ProviderIconConfigDrawer: React.FC<ProviderIconConfigDrawerProps> = ({
  open,
  onOpenChange,
  providerDefinition,
  onSave,
  trigger
}) => {
  const [draftIconKey, setDraftIconKey] = useState<string | undefined>(providerDefinition?.iconKey)

  useEffect(() => {
    setDraftIconKey(providerDefinition?.iconKey)
  }, [providerDefinition?.id, providerDefinition?.iconKey, open])

  const previewIcon = useMemo(() => {
    return getProviderIcon(draftIconKey || providerDefinition?.id)
  }, [draftIconKey, providerDefinition?.id])

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        {trigger}
      </DrawerTrigger>
      <DrawerContent className="max-h-[80vh] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <DrawerHeader className="px-6 pt-6">
          <DrawerTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Provider Icon
          </DrawerTitle>
          <DrawerDescription className="text-xs text-slate-500 dark:text-slate-400">
            Select the icon shown in the provider list, model picker, and message badge.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-6 pb-4 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/40 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
              <img
                src={previewIcon}
                alt={providerDefinition?.displayName || 'Provider icon'}
                className="h-5 w-5 select-none dark:invert dark:brightness-90"
                draggable={false}
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-slate-800 dark:text-slate-200">
                {providerDefinition?.displayName || 'Provider'}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {draftIconKey || providerDefinition?.id || 'default'}
              </p>
            </div>
          </div>
          <ProviderIconPicker value={draftIconKey} onChange={setDraftIconKey} />
        </div>
        <DrawerFooter className="px-6 pb-6">
          <div className="flex items-center gap-2 w-full">
            <DrawerClose asChild>
              <Button variant="outline" className="flex-1 rounded-xl">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              className="flex-1 rounded-xl"
              onClick={() => {
                onSave(draftIconKey)
                toast.success('Provider icon updated')
                onOpenChange(false)
              }}
            >
              Save
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
