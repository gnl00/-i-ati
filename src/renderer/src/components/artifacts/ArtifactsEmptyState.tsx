import React from 'react'

interface ArtifactsEmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
}

export const ArtifactsEmptyState: React.FC<ArtifactsEmptyStateProps> = ({ icon, title, description }) => (
  <div className="flex-1 w-full flex flex-col items-center justify-center bg-zinc-50/50 p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 dark:bg-zinc-950">
    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-60/50 text-zinc-300 shadow-xs dark:border-white/8 dark:bg-zinc-900 dark:text-zinc-700">
      {icon}
    </div>
    <h3 className="mb-1.5 text-sm font-semibold text-zinc-700 dark:text-zinc-100">{title}</h3>
    <p className="max-w-[240px] text-xs leading-5 text-zinc-500 dark:text-zinc-400">
      {description}
    </p>
  </div>
)
