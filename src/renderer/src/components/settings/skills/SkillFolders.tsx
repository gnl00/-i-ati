import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { ChevronDown } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@renderer/components/ui/accordion'

interface SkillFoldersProps {
  folders: string[]
  pendingFolders: Set<string>
  onRescanAll: () => void
  onAddFolder: () => void
  onRemoveFolder: (folder: string) => void
}

const SkillFolders: React.FC<SkillFoldersProps> = ({
  folders,
  pendingFolders,
  onRescanAll,
  onAddFolder,
  onRemoveFolder
}) => {
  return (
    <Accordion type="single" collapsible defaultValue="folders" className="w-full">
      <AccordionItem value="folders" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs hover:shadow-sm transition-all duration-200">
        <AccordionTrigger className="px-4 py-3 hover:no-underline group">
          <div className="flex items-center justify-between w-full pr-2">
            <div className="flex items-center gap-2">
              <Label className="text-base font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                Skill Folders
              </Label>
              <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-indigo-600 border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800">
                {folders.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-4 pb-3">
          <div className="space-y-2 pt-1">
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Add folders to scan for skills. Subfolders are scanned recursively and stop at any folder containing SKILL.md.
            </p>
            <div id="action-button-container" className="w-full flex p-0">
              <div className="flex-1">
                <p className="text-xs text-gray-400">
                  Name conflicts are resolved by appending the folder name (e.g. <span className="font-mono">skill-folder</span>).
                </p>
              </div>
              <div
                id="action-button"
                className="inline-flex gap-0.5 rounded-full border border-gray-200/80 dark:border-gray-700/70 bg-white/70 dark:bg-gray-900/40 p-1"
              >
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRescanAll()
                  }}
                  disabled={folders.length === 0 || pendingFolders.size > 0}
                  className="h-8 rounded-full px-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-gray-800/70 disabled:opacity-60"
                >
                  <i className="ri-refresh-line mr-1.5"></i>
                  Rescan All
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddFolder()
                  }}
                  className="h-8 rounded-full px-3 text-xs font-medium shadow-none bg-linear-to-r from-gray-900 to-gray-700 hover:from-gray-900 hover:to-gray-800 dark:from-gray-100 dark:to-gray-200 dark:hover:from-white dark:hover:to-gray-100 text-white dark:text-gray-900"
                >
                  <i className="ri-folder-add-line mr-1.5"></i>
                  Add Folder
                </Button>
              </div>
            </div>

            {folders.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 pt-2">
                No folders added yet.
              </p>
            ) : (
              <div className="space-y-2 pt-2">
                {folders.map(folder => {
                  const isPending = pendingFolders.has(folder)
                  return (
                    <div key={folder} className="group/folder flex items-center justify-between gap-3 px-3 py-1 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40">
                      <div className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                        {folder}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onRemoveFolder(folder)}
                          disabled={isPending}
                          className="h-7 rounded-full px-2.5 text-[11px] font-medium text-rose-500 hover:text-rose-600 hover:bg-rose-50/70 dark:hover:bg-rose-500/10 opacity-0 group-hover/folder:opacity-100 transition-all disabled:opacity-50"
                        >
                          <i className="ri-delete-bin-line mr-1.5"></i>
                          Remove
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export default SkillFolders
