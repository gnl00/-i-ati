import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
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
      <AccordionItem value="folders" className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">

        {/* Header trigger */}
        <AccordionTrigger className="px-4 py-4 hover:no-underline hover:bg-gray-50/60 dark:hover:bg-gray-700/20 transition-colors duration-150 group [&>svg]:hidden">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-pointer">
                Skill Folders
              </Label>
              <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
                {folders.length} {folders.length === 1 ? 'folder' : 'folders'}
              </Badge>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </div>
        </AccordionTrigger>

        <AccordionContent className="border-t border-gray-100 dark:border-gray-700/50">

          {/* Description + actions */}
          <div className="px-4 py-3.5 flex items-start justify-between gap-4 bg-gray-50/40 dark:bg-gray-900/20 border-b border-gray-100 dark:border-gray-700/50">
            <div className="space-y-0.5 flex-1 min-w-0">
              <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Scan folders for skills. Subfolders are scanned recursively, stopping at any folder containing <span className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">SKILL.md</span>.
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Name conflicts resolve by appending the folder name.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onRescanAll() }}
                disabled={folders.length === 0 || pendingFolders.size > 0}
                className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:pointer-events-none transition-all duration-150"
              >
                <i className="ri-refresh-line text-[12px]" />
                Rescan
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onAddFolder() }}
                className="h-7 px-3 flex items-center gap-1.5 rounded-md text-[11px] font-medium bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 active:scale-[0.97] transition-all duration-150 shadow-sm shadow-gray-900/10"
              >
                <i className="ri-folder-add-line text-[12px]" />
                Add Folder
              </button>
            </div>
          </div>

          {/* Folder list */}
          <div className="bg-gray-50/40 dark:bg-gray-900/30">
            {folders.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2.5 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <i className="ri-folder-line text-[15px] text-gray-400 dark:text-gray-500" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">No folders added</p>
                  <p className="text-[11.5px] text-gray-400 dark:text-gray-500">Add a folder to start scanning for skills.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800/70">
                {folders.map(folder => {
                  const isPending = pendingFolders.has(folder)
                  return (
                    <div
                      key={folder}
                      className="group/folder flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-white/70 dark:hover:bg-gray-800/40 transition-colors duration-150"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <i className={`ri-folder-3-line text-[14px] shrink-0 ${isPending ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`} />
                        <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300 truncate">
                          {folder}
                        </span>
                        {isPending && (
                          <span className="text-[10px] text-amber-500 dark:text-amber-400 shrink-0">scanning…</span>
                        )}
                      </div>
                      <button
                        onClick={() => onRemoveFolder(folder)}
                        disabled={isPending}
                        className="h-6 px-2 flex items-center gap-1 rounded-md text-[11px] font-medium text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-0 group-hover/folder:opacity-100 disabled:opacity-30 disabled:pointer-events-none active:scale-[0.97] transition-all duration-150"
                      >
                        <i className="ri-delete-bin-line text-[12px]" />
                        Remove
                      </button>
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
