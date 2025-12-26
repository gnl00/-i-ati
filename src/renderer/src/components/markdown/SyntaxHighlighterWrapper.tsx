import { ClipboardCopyIcon, CodeIcon, CopyIcon, EyeOpenIcon } from "@radix-ui/react-icons"
import { useTheme } from '@renderer/components/theme-provider'
import { cn } from '@renderer/lib/utils'
import React, { useCallback, useMemo, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { dracula, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { toast } from 'sonner'
import { Button } from "../ui/button"

const renderableLanguage = ['html', 'svg', 'jsx', 'tsx', 'vue']

const MemoSyntaxHighlighter = React.memo(SyntaxHighlighter)

export const CodeWrapper = React.memo(({ children, language, showHeader = true }: { children: string, language: string, showHeader?: boolean }) => {
  const [showCodeRender, setShowCodeRender] = useState<boolean>(false)
  const { theme } = useTheme()

  // Determine if dark mode is active
  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(String(children));
      toast.success('Copied')
    } catch (err) {
      toast.error('Copy failed')
    }
  }
  const onViewClick = () => {
    setShowCodeRender(!showCodeRender)
  }
  return (
    <div className='relative border border-slate-200/60 dark:border-slate-700/50 rounded-lg overflow-hidden shadow-sm bg-white dark:bg-slate-900/50'>
      {/* Header with language badge and action buttons */}
      {showHeader && (
        <div className='flex justify-between items-center bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm px-2 py-0.5 border-b border-slate-200/60 dark:border-slate-700/50'>
          <span className='px-2 py-0.5 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 select-none tracking-wide bg-slate-200/60 dark:bg-slate-700/60 rounded-md'>
            {language}
          </span>
          <div className='flex items-center gap-1'>
            {
              renderableLanguage.includes(language) && !showCodeRender && (
                <Button
                  size={'sm'}
                  variant={'ghost'}
                  onClick={onViewClick}
                  className='h-7 px-2 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-md transition-all duration-200'
                >
                  <EyeOpenIcon className='w-3.5 h-3.5 text-slate-500 dark:text-slate-400' />
                </Button>
              )
            }
            {
              showCodeRender && (
                <Button
                  size={'sm'}
                  variant={'ghost'}
                  onClick={onViewClick}
                  className='h-7 px-2 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-md transition-all duration-200'
                >
                  <CodeIcon className='w-3.5 h-3.5 text-slate-500 dark:text-slate-400' />
                </Button>
              )
            }
            <Button
              size={'sm'}
              variant={'ghost'}
              onClick={copyToClipboard}
              className='h-7 px-2 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-md transition-all duration-200'
            >
              <CopyIcon className='w-3.5 h-3.5 text-slate-500 dark:text-slate-400' />
            </Button>
          </div>
        </div>
      )}
      {/* Code content */}
      {
        !showCodeRender ?
          (
            <div className='max-h-[500px] overflow-auto custom-scrollbar'>
              <MemoSyntaxHighlighter
                customStyle={{
                  paddingTop: '0.5rem',
                  paddingLeft: '0.75rem',
                  paddingRight: '0.5rem',
                  paddingBottom: '0.5rem',
                  margin: '0',
                  fontSize: '0.8125rem',
                  lineHeight: '1.6',
                }}
                PreTag={'div'}
                children={String(children).replace(/\n$/, '')}
                language={language}
                style={isDarkMode ? vscDarkPlus : dracula}
                wrapLongLines={true}
                showLineNumbers={false}
              />
            </div>
          ) : (
            <div className="border-none rounded-b-lg overflow-hidden bg-white dark:bg-slate-900">
              <div className="relative">
                <iframe
                  srcDoc={children}
                  className="w-full h-96 border-none bg-white"
                  title={language}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          )
      }
    </div>
  )
})

export const CodeWrapperNoHeader = React.memo(({ children, language }: { children: string, language: string }) => {
  return <CodeWrapper children={children} language={language} showHeader={false} />
})

export const CodeCopyWrapper = React.memo(({ children, code, _language }: { children: React.ReactNode, code: string, _language?: string }) => {
  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(String(code));
      toast({
        variant: 'default',
        duration: 1000,
        className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
        description: '✅ Copied',
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        duration: 1000,
        className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
        description: '❌ Copy failed',
      })
    }
  }, [code])

  const MemolizedCopyBtn = useMemo(() => {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-2 right-2 h-8 w-8 rounded-md backdrop-blur-sm",
          "bg-slate-100/80 dark:bg-slate-800/80",
          "hover:bg-slate-200/90 dark:hover:bg-slate-700/90",
          "border border-slate-200/60 dark:border-slate-700/50",
          "shadow-sm transition-all duration-200",
          "opacity-0 group-hover:opacity-100"
        )}
        onClick={copyToClipboard}
      >
        <ClipboardCopyIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
      </Button>
    )
  }, [copyToClipboard])

  return (
    <div className='code-copy-wrapper relative group'>
      {children}
      {MemolizedCopyBtn}
    </div>
  )
})