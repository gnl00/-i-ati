import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import { Search, X } from 'lucide-react'

interface AvailableSkillsProps {
  skills: SkillMetadata[]
  filteredSkills: SkillMetadata[]
  activeSkills: string[]
  pendingSkills: Set<string>
  hasActiveChat: boolean
  isRefreshing: boolean
  searchQuery: string
  setSearchQuery: (query: string) => void
  onRefreshSkills: () => void
  onToggleSkillActive: (name: string, nextActive: boolean) => void
}

const AvailableSkills: React.FC<AvailableSkillsProps> = ({
  skills,
  filteredSkills,
  activeSkills,
  pendingSkills,
  hasActiveChat,
  isRefreshing,
  searchQuery,
  setSearchQuery,
  onRefreshSkills,
  onToggleSkillActive
}) => {
  const activeCount = activeSkills.length

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden">

      {/* Header */}
      <div className="px-4 py-4 flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label className="text-[13.5px] font-semibold text-gray-900 dark:text-gray-100 tracking-tight cursor-default">
              Available Skills
            </Label>
            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-gray-500 border-gray-200 bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
              {skills.length} installed
            </Badge>
            {activeCount > 0 && (
              <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                {activeCount} active
              </Badge>
            )}
          </div>
          <p className="text-[12px] text-gray-400 dark:text-gray-500 leading-relaxed">
            Toggle skills to activate or deactivate them for the current chat.
          </p>
        </div>
        <button
          onClick={onRefreshSkills}
          disabled={isRefreshing}
          className="h-7 px-2.5 flex items-center gap-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 disabled:opacity-40 transition-all duration-150 shrink-0"
        >
          <i className={`ri-refresh-line text-[13px] ${isRefreshing ? 'animate-spin' : ''}`} />
          Reload
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
          <Input
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-8 text-[12px] bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700/60 dark:text-gray-200
              focus-visible:ring-0 focus-visible:ring-offset-0
              focus-visible:border-emerald-400 dark:focus-visible:border-emerald-600
              transition-all duration-200 rounded-lg placeholder:text-gray-400/60 dark:placeholder:text-gray-600 shadow-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/40 dark:bg-gray-900/30">
        <div className="max-h-[360px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent">

          {filteredSkills.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-2.5 text-center">
              {searchQuery ? (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">No skills match</p>
                    <p className="text-[11.5px] text-gray-400 dark:text-gray-500">
                      Try a different keyword or{' '}
                      <button
                        onClick={() => setSearchQuery('')}
                        className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        clear search
                      </button>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <i className="ri-magic-line text-[15px] text-gray-400 dark:text-gray-500" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[12.5px] font-medium text-gray-600 dark:text-gray-300">No skills installed</p>
                    <p className="text-[11.5px] text-gray-400 dark:text-gray-500">Use Reload to discover available skills.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {filteredSkills.map(skill => {
            const isActive = activeSkills.includes(skill.name)
            const isPending = pendingSkills.has(skill.name)
            return (
              <div
                key={skill.name}
                className="group flex items-start justify-between gap-4 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800/70 last:border-b-0 hover:bg-white/70 dark:hover:bg-gray-800/40 transition-colors duration-150"
              >
                <div className="flex-1 space-y-1.5 min-w-0">
                  {/* Name + badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100 tracking-tight">
                      {skill.name}
                    </span>
                    {isActive && (
                      <Badge variant="secondary" className="text-[9.5px] h-[18px] px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                        Active
                      </Badge>
                    )}
                    {skill.allowedTools && skill.allowedTools.length > 0 && (
                      <Badge variant="outline" className="text-[9.5px] h-[18px] px-1.5 text-blue-600 border-blue-200/80 bg-blue-50/80 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/60">
                        {skill.allowedTools.length} tools
                      </Badge>
                    )}
                  </div>

                  {/* Description */}
                  {skill.description && (
                    <p className="text-[11.5px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      {skill.description}
                    </p>
                  )}

                  {/* Allowed tools chips */}
                  {skill.allowedTools && skill.allowedTools.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {skill.allowedTools.map(tool => (
                        <span
                          key={tool}
                          className="inline-flex px-1.5 py-0.5 rounded font-mono text-[9.5px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200/70 dark:border-gray-700/60"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Compatibility */}
                  {skill.compatibility && (
                    <p className="text-[10.5px] text-gray-400 dark:text-gray-500 italic">
                      {skill.compatibility}
                    </p>
                  )}
                </div>

                <div className="flex items-center pt-0.5 shrink-0">
                  <Switch
                    checked={isActive}
                    onCheckedChange={(checked) => onToggleSkillActive(skill.name, checked)}
                    disabled={!hasActiveChat || isPending}
                    className="data-[state=checked]:bg-emerald-600 scale-90 origin-center disabled:opacity-40"
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default AvailableSkills
