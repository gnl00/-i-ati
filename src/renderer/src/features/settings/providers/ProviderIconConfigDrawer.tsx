import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ProviderIcon } from '@renderer/shared/components/ProviderIcon'
import { Button } from '@renderer/shared/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerTrigger
} from '@renderer/shared/components/ui/drawer'
import DrawerHeaderBar from '@renderer/shared/components/ui/DrawerHeaderBar'
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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        {trigger}
      </DrawerTrigger>
      <DrawerContent className="max-h-[80vh] bg-white dark:bg-(--app-surface-raised) border-gray-200 dark:border-(--app-border-standard) dark:text-(--app-text-body)">
        <DrawerHeaderBar
          title="Provider Icon"
          description="Select the icon shown in the provider list, model picker, and message badge."
        />
        <div className="px-6 pb-4 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200/80 dark:border-(--app-border-standard) bg-gray-50/80 dark:bg-(--app-surface-inset) p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200/80 dark:border-(--app-border-standard) bg-white dark:bg-(--app-surface-raised)">
              <ProviderIcon
                provider={draftIconKey || providerDefinition?.id}
                alt={providerDefinition?.displayName || 'Provider icon'}
                className="h-5 w-5 select-none"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-gray-800 dark:text-(--app-text-body)">
                {providerDefinition?.displayName || 'Provider'}
              </p>
              <p className="truncate text-[11px] text-gray-500 dark:text-(--app-text-secondary)">
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
