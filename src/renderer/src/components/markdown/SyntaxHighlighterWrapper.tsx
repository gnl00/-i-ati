import React, { useMemo, useRef } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { dracula, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { toast } from "@renderer/components/ui/use-toast"
import { Button } from "../ui/button"
import { ClipboardCopyIcon, CopyIcon } from "@radix-ui/react-icons"
import { Badge } from '../ui/badge'

const MemoSyntaxHighlighter = React.memo(SyntaxHighlighter)

export const SyntaxHighlighterWrapper = React.memo(({ children, language }: { children: string, language: string }) => {
  const copyToClipboard = async () => {
    try {
        await navigator.clipboard.writeText(String(children));
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
            description: '❌ Code copy failed',
        })
    }
  }
  return (
    <div className='relative border rounded-lg overflow-hidden'>
      {/* Header with language and copy button */}
      <div className='flex justify-between items-center bg-black/5 dark:bg-gray-800 px-3 py-1 border-b'>
        <Badge variant={'outline'} className='text-sm text-gray-600 bg-gray-300 dark:text-gray-300 font-medium select-none'>
          {language}
        </Badge>
        <Button
          size={'sm'}
          variant={'ghost'}
          onClick={copyToClipboard}
          className='h-5 p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-md transition-colors'
        >
          <CopyIcon className='w-4 h-4 text-gray-500 dark:text-gray-400' />
        </Button>
      </div>
      {/* Code content */}
      <MemoSyntaxHighlighter
        customStyle={{ padding: '12px', margin: '0', borderRadius: '0 0 0 0' }}
        PreTag={'pre'}
        children={String(children).replace(/\n$/, '')}
        language={language}
        style={dracula}
        wrapLongLines={true}
      />
    </div>
  )
})

export const CodeCopyWrapper = React.memo(({ children, code, language }: { children: React.ReactNode, code: string, language?: string }) => {
  const copyToClipboard = async () => {
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
  }
  const MemolizedCopyBtn = useMemo(() => {
    return (
      <Button
      variant="ghost"
      size="icon"
      className="absolute -top-3 -right-2 rounded-full backdrop-blur hover:bg-gray-500 dark:hover:bg-gray-700 transition-colors"
      onClick={copyToClipboard}
      >
        <ClipboardCopyIcon className="w-4 h-4" />
    </Button>
    )
  }, [children])
  return (
    <div className='code-copy-wrapper relative'>
      {children}
      {MemolizedCopyBtn}
    </div>
  )
})