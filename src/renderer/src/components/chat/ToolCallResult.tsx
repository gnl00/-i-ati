import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@renderer/components/ui/accordion";
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';
import { Check, ChevronDown, Clipboard, Clock, X } from "lucide-react";
import React, { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SpeedCodeHighlight } from './SpeedCodeHighlight';
import { WebSearchResults } from './WebSearchResults';

interface ToolCallResultProps {
  toolCall: any
  index: number
  isDarkMode: boolean
}

// Memoize the component to prevent unnecessary re-renders
export const ToolCallResult: React.FC<ToolCallResultProps> = React.memo(({ toolCall: tc, index, isDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false); // Track accordion open state
  const [isPending, startTransition] = useTransition(); // For non-urgent updates

  // 检测是否为 Web Search 结果
  const isWebSearch = tc.name === 'web_search'
  const webSearchData = isWebSearch && tc.content?.results ? tc.content : null

  // Memoize JSON stringification to avoid recalculating on every render
  const jsonContent = useMemo(() => {
    return JSON.stringify(tc.content, null, 2)
  }, [tc.content])

  const onCopyClick = (e: React.MouseEvent, content: any) => {
    e.stopPropagation();
    const text = typeof content === 'string' ? content : jsonContent;
    navigator.clipboard.writeText(text);
    toast.success('Result Copied');
  }

  const isError = tc.isError;

  // Handle accordion open/close with startTransition to mark as non-urgent
  const handleAccordionChange = (value: string) => {
    startTransition(() => {
      setIsOpen(value === 'tool-use-' + index);
    });
  };

  return (
    <Accordion
      type="single"
      collapsible
      className='my-2 w-full max-w-full animate-tool-result-in'
      onValueChange={handleAccordionChange}
    >
      <AccordionItem value={'tool-use-' + index} className='border-none'>
        <AccordionTrigger className={cn(
          'py-0 hover:no-underline', // Remove default padding
        )}>
          <div className={cn(
            "flex items-center justify-between gap-3 px-3 py-1.5 rounded-full border transition-all cursor-pointer select-none",
            isError
              ? "bg-red-50/80 dark:bg-red-900/20 border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/30"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          )}>
            {/* Left: Icon & Name */}
            <div className="flex items-center gap-2 overflow-hidden">
              {isError ? (
                <X className={cn(
                  "w-3.5 h-3.5",
                  "text-red-500"
                )} />
              ) : (
                <Check className={cn(
                  "w-3.5 h-3.5",
                  "text-green-600 dark:text-green-400"
                )} />
              )}

              <div className={cn(
                "w-px h-3",
                isError ? "bg-red-200 dark:bg-red-800" : "bg-zinc-200 dark:bg-zinc-700"
              )} />

              <span className={cn(
                "font-mono font-bold text-xs truncate max-w-[200px]",
                isError ? "text-red-700 dark:text-red-300" : "text-zinc-700 dark:text-zinc-300"
              )}>
                {tc.name}
              </span>
            </div>

            {/* Right: Meta */}
            <div className="flex items-center gap-2 text-[10px] flex-shrink-0">
              {tc.cost && (
                <div className={cn(
                  "flex items-center gap-1 opacity-60",
                  isError ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
                )}>
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">{tc.cost ? tc.cost / 1000 : 0}s</span>
                </div>
              )}
              <ChevronDown className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180",
                isError ? "text-red-400" : "text-zinc-400 dark:text-zinc-500"
              )} />
            </div>
          </div>
        </AccordionTrigger>

        <AccordionContent className="mt-2 pb-1 relative px-0">
          {isWebSearch && webSearchData ? (
            <WebSearchResults results={webSearchData.results} />
          ) : (
            // CRITICAL: Only render SyntaxHighlighter when accordion is actually open
            // This prevents blocking the main thread when component first mounts
            <div className={cn(
              "relative rounded-lg overflow-hidden border shadow-inner group max-w-full",
              isError
                ? "bg-red-50/30 dark:bg-red-900/10 border-red-100 dark:border-red-900/30"
                : "bg-zinc-50/50 dark:bg-black/20 border-zinc-200/50 dark:border-zinc-800"
            )}>
              <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 bg-white/80 dark:bg-zinc-800/80 backdrop-blur hover:bg-gray-100 dark:hover:bg-zinc-700"
                  onClick={(e) => onCopyClick(e, tc.content)}
                >
                  <Clipboard className="w-3 h-3 text-zinc-500" />
                </Button>
              </div>
              <div className="max-h-60 overflow-auto custom-scrollbar max-w-full">
                {/* {isOpen ? (
                  // Only render expensive code highlighting when accordion is open
                  <SpeedCodeHighlight
                    code={jsonContent}
                    language="json"
                    isDarkMode={isDarkMode}
                  />
                ) : (
                  // Lightweight placeholder when collapsed
                  <div className="p-4 text-xs text-zinc-500 dark:text-zinc-400 text-center">
                    Click to view details
                  </div>
                )} */}
                <SpeedCodeHighlight
                  code={jsonContent}
                  language="json"
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
});
