import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@renderer/shared/providers/ThemeProvider'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast rounded-xl border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-xl',
          default: 'border-border/70',
          loading: 'border-border/70',
          success:
            'border-emerald-500/55 [&_[data-icon]]:text-emerald-500 dark:[&_[data-icon]]:text-emerald-400',
          info:
            'border-blue-500/55 [&_[data-icon]]:text-blue-500 dark:[&_[data-icon]]:text-blue-400',
          warning:
            'border-amber-500/60 [&_[data-icon]]:text-amber-500 dark:[&_[data-icon]]:text-amber-400',
          error:
            'border-red-500/60 [&_[data-icon]]:text-red-500 dark:[&_[data-icon]]:text-red-400',
          description: 'text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
