import React from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
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
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs overflow-hidden transition-all duration-200 hover:shadow-sm">
      <div className="p-4 flex justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-base font-medium text-gray-900 dark:text-gray-100">
              Available Skills
            </Label>
            <Badge variant="outline" className="select-none text-[10px] h-5 px-1.5 font-normal text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
              {skills.length} total
            </Badge>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Toggle a skill to activate or deactivate it for the current chat.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="xs"
            onClick={onRefreshSkills}
            disabled={isRefreshing}
            className="h-8 rounded-full px-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-gray-800/70 disabled:opacity-60"
          >
            <i className="ri-refresh-line mr-1.5"></i>
            Reload
          </Button>
        </div>
      </div>
      <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/30">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search installed skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 h-9 text-sm bg-white/80 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 dark:text-gray-200 
              focus-visible:ring-0 focus-visible:ring-offset-0
              focus-visible:border-blue-500 dark:focus-visible:border-blue-400
              focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus-visible:shadow-[0_0_0_3px_rgba(96,165,250,0.15)]
              transition-all duration-200 
              rounded-xl placeholder:text-muted-foreground/50 shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700/50">
        <div className="max-h-[360px] overflow-y-auto">
          {filteredSkills.length === 0 && (
            <div className="p-5 text-sm text-gray-500 dark:text-gray-400">
              {searchQuery ? (
                <div className="flex flex-col items-start gap-2">
                  <span>No skills match your search.</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery('')}
                    className="px-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Reset search
                  </Button>
                </div>
              ) : (
                'No skills installed yet.'
              )}
            </div>
          )}
          {filteredSkills.map(skill => {
            const isActive = activeSkills.includes(skill.name)
            const isPending = pendingSkills.has(skill.name)
            return (
              <div key={skill.name} className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{skill.name}</span>
                    {isActive && (
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Active
                      </Badge>
                    )}
                    {skill.allowedTools && skill.allowedTools.length > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                        {skill.allowedTools.length} tools
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {skill.description}
                  </p>
                  {skill.compatibility && (
                    <p className="text-xs text-gray-400">{skill.compatibility}</p>
                  )}
                  {skill.allowedTools && skill.allowedTools.length > 0 && (
                    <p className="text-xs text-gray-400">
                      Allowed tools: {skill.allowedTools.join(' ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={isActive}
                    onCheckedChange={(checked) => onToggleSkillActive(skill.name, checked)}
                    disabled={!hasActiveChat || isPending}
                    className="data-[state=checked]:bg-emerald-600"
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
