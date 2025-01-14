import React, { useRef } from 'react'
import { PrismAsync as SyntaxHighlighter } from 'react-syntax-highlighter'
import { dracula, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { toast } from "@renderer/components/ui/use-toast"
import { Button } from "../ui/button"
import { ClipboardCopyIcon } from "@radix-ui/react-icons"

const MemoSyntaxHighlighter = React.memo(SyntaxHighlighter)

const PreTag = ({ children }: { children: React.ReactNode }) => {
  const codeRef = useRef<HTMLDivElement>(null)
  return (
      <div className="preTag relative" ref={codeRef}>
          {children}
      </div>
  )
}

export const SyntaxHighlighterWrapper = React.memo(({ children, language }: { children: string, language: string }) => {
  const copyToClipboard = async () => {
    try {
        await navigator.clipboard.writeText(String(children));
        toast({
            variant: 'default',
            duration: 1000,
            className: 'flex fixed bottom-1 right-1 sm:w-1/3 md:w-1/4 lg:w-1/5',
            description: '✅ Code copied',
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
    <div className='relative'>
      <MemoSyntaxHighlighter
      // customStyle={{ padding: '0', maxHeight: '300px', overflow: 'scroll' }}
      customStyle={{ padding: '0' }}
      PreTag={'div'}
      children={String(children).replace(/\n$/, '')}
      language={language}
      style={dracula}
      wrapLongLines={true}
      />
      <Button
        variant="ghost"
        size="icon"
        className="absolute -top-2 -right-2 rounded-full backdrop-blur hover:bg-gray-500 dark:hover:bg-gray-700 transition-colors"
        onClick={copyToClipboard}
        >
          <ClipboardCopyIcon className="w-4 h-4" />
      </Button>
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
            description: '✅ Code copied',
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
    <div className='code-copy-wrapper relative'>
      {children}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -top-3 -right-2 rounded-full backdrop-blur hover:bg-gray-500 dark:hover:bg-gray-700 transition-colors"
        onClick={copyToClipboard}
        >
          <ClipboardCopyIcon className="w-4 h-4" />
      </Button>
    </div>
  )
})