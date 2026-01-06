import React from 'react'

interface ArtifactsEmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
}

export const ArtifactsEmptyState: React.FC<ArtifactsEmptyStateProps> = ({ icon, title, description }) => (
  <div className="flex-1 w-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="w-20 h-20 rounded-3xl bg-gray-50/50 dark:bg-gray-900/50 border border-black/5 dark:border-white/5 flex items-center justify-center text-gray-300 dark:text-gray-700 mb-6 shadow-sm">
      {icon}
    </div>
    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[240px] leading-relaxed">
      {description}
    </p>
  </div>
)
