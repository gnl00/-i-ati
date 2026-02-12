import React, { useState, useEffect } from 'react'
import { AlertTriangle, ShieldAlert, Terminal } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

/**
 * 命令确认请求参数
 */
export interface CommandConfirmationRequest {
  command: string
  risk_level: 'risky' | 'dangerous'
  risk_reason: string
}

/**
 * 命令确认组件属性
 */
interface CommandConfirmationProps {
  request: CommandConfirmationRequest
  onConfirm: () => void
  onCancel: () => void
  className?: string
}

/**
 * 获取风险级别的视觉配置
 */
function getRiskLevelConfig(riskLevel: 'risky' | 'dangerous') {
  if (riskLevel === 'dangerous') {
    return {
      icon: ShieldAlert,
      title: 'Dangerous Command',
      gradient: 'from-red-500/10 via-red-500/5 to-transparent',
      iconBg: 'bg-red-500/10 dark:bg-red-500/20',
      iconColor: 'text-red-600 dark:text-red-400',
      titleColor: 'text-red-900 dark:text-red-100',
    }
  }

  return {
    icon: AlertTriangle,
    title: 'Risky Command',
    gradient: 'from-orange-500/10 via-orange-500/5 to-transparent',
    borderGlow: 'shadow-xs',
    iconBg: 'bg-orange-500/10 dark:bg-orange-500/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
    titleColor: 'text-orange-900 dark:text-orange-100',
    borderColor: 'border-orange-200 dark:border-orange-600'
  }
}

/**
 * 命令确认组件 - 简洁设计
 * 用于在执行危险命令前请求用户确认
 */
export const CommandConfirmation: React.FC<CommandConfirmationProps> = ({
  request,
  onConfirm,
  onCancel,
  className
}) => {
  const config = getRiskLevelConfig(request.risk_level)
  const Icon = config.icon
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className={cn(
        'my-2 transition-all duration-300 ease-out',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        className
      )}
    >
      {/* 主容器 */}
      <div className={cn(
        'relative overflow-hidden rounded-xl shadow-xs backdrop-blur-xs',
        'bg-white/80 dark:bg-gray-900/80',
      )}>
        {/* 背景 */}
        <div className={cn(
          'absolute inset-0 bg-linear-to-br opacity-50',
          config.gradient
        )} />

        {/* 内容区域 */}
        <div className="relative p-2">
          {/* 头部：图标 + 标题 */}
          <div className="flex items-start gap-3 mb-2.5">
            {/* 图标 */}
            <div className={cn(
              'flex items-center justify-center w-6 h-6 rounded-lg shrink-0',
              config.iconBg
            )}>
              <Icon className={cn('w-4 h-4', config.iconColor)} />
            </div>

            {/* 标题 */}
            <div className="flex-1 min-w-0">
              <h3 className={cn('text-sm font-medium', config.titleColor)}>
                {config.title}
              </h3>
            </div>
          </div>

          {/* 命令显示区域 */}
          <div className="mb-3">
            <div className={cn(
              'rounded-md overflow-hidden',
              'bg-gray-600/5 dark:bg-gray-750/50',
              'border border-gray-200 dark:border-gray-800'
            )}>
              {/* 命令内容 */}
              <div className="px-3 py-2 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 shrink-0" />
                <code className={cn(
                  'text-xs font-mono leading-relaxed',
                  'text-gray-800 dark:text-gray-200',
                  'break-all flex-1'
                )}>
                  {request.command}
                </code>
              </div>
            </div>
          </div>

          {/* 操作按钮区域 */}
          <div className="flex flex-col-reverse justify-end sm:flex-row gap-2 sm:gap-2.5">
            {/* Cancel 按钮 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className={cn(
                'flex-1 sm:flex-initial sm:min-w-[100px] rounded-xl transition-colors',
                'text-gray-300 dark:text-gray-300',
                'hover:bg-gray-100 hover:text-blue-500 dark:hover:bg-gray-800 dark:hover:text-blue-400'
              )}
            >
              Cancel
            </Button>

            {/* Execute 按钮 */}
            <Button
              variant={request.risk_level === 'dangerous' ? 'destructive' : 'default'}
              size="sm"
              onClick={onConfirm}
              className={cn(
                'flex-1 sm:flex-initial sm:min-w-[120px] font-medium rounded-xl transition-colors',
                request.risk_level === 'dangerous'
                  ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700'
                  : 'text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-400 dark:hover:bg-orange-900/50'
              )}
            >
              Execute
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
