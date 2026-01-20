import { SpeedCodeHighlight } from '@renderer/components/chat/common/SpeedCodeHighlight';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Clipboard, Wrench, X } from "lucide-react";
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { WebSearchResults } from './WebSearchResults';

interface ToolCallResultProps {
  toolCall: ToolCallSegment
  index: number
  isDarkMode: boolean
}

// Memoize the component to prevent unnecessary re-renders
export const ToolCallResult: React.FC<ToolCallResultProps> = React.memo(({ toolCall: tc, isDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false);

  // 检测是否为 Web Search 结果
  const isWebSearch = tc.name === 'web_search'
  const webSearchData = isWebSearch && tc.content?.results ? tc.content : null
  const isError = tc.isError;

  // Memoize JSON stringification
  const jsonContent = useMemo(() => {
    return JSON.stringify(tc.content, null, 2)
  }, [tc.content])

  const onCopyClick = (e: React.MouseEvent, content: any) => {
    e.stopPropagation();
    const text = typeof content === 'string' ? content : jsonContent;
    navigator.clipboard.writeText(text);
    toast.success('Result Copied');
  }

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30
      }}
      className='my-3 w-full max-w-full font-sans'
    >
      <div className={cn(
        "group relative flex flex-col transition-all",
        isOpen ? "gap-2" : "gap-0"
      )}>

        {/* Tech Capsule Header */}
        <div
          onClick={toggleOpen}
          className={cn(
            "relative z-10 flex w-auto self-start items-center gap-3 px-3 py-1.5 cursor-pointer select-none",
            "rounded-md border transition-all duration-200 ease-out",
            "border-transparent", // Start transparent/subtle
            isOpen
              ? "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200/50 dark:border-zinc-700/50"
              : "bg-white/50 dark:bg-zinc-900/30 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-zinc-100/50 dark:border-zinc-800/50"
          )}
        >
          {/* Status Indicator (Icon) */}
          <div className={cn(
            "flex items-center justify-center w-3.5 h-3.5 rounded-full ring-1",
            isError
              ? "bg-red-100 text-red-600 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-900"
              : "bg-emerald-100 text-emerald-600 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-900"
          )}>
            {isError ? <X className="w-2 h-2" /> : <Check className="w-2 h-2" />}
          </div>

          {/* Tool Identifier */}
          <div className="flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
            <span className={cn(
              "font-mono text-[11px] font-semibold tracking-tight",
              isError ? "text-red-700 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200"
            )}>
              {tc.name}
            </span>
          </div>

          {/* Divider */}
          <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-700 mx-1" />

          {/* Metadata / Action */}
          <div className="flex items-center gap-3">
            {tc.cost && (
              <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                {(tc.cost / 1000).toFixed(3)}s
              </span>
            )}

            <ChevronDown className={cn(
              "w-3 h-3 text-zinc-400 dark:text-zinc-500 transition-transform duration-300",
              isOpen && "rotate-180 text-zinc-600 dark:text-zinc-300"
            )} />
          </div>
        </div>

        {/* Data Log Content */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginLeft: 0 }}
              animate={{ height: "auto", opacity: 1, marginLeft: 12 }}
              transition={{
                duration: 0.3,
                ease: "circOut"
              }}
              exit={{
                height: 0,
                opacity: 0,
                marginLeft: 0,
                transition: {
                  duration: 0.2,
                  ease: "easeInOut"
                }
              }}
              className="overflow-hidden"
            >
              {/* Connection Line */}
              <div className="absolute left-[13px] top-[34px] bottom-0 w-px bg-zinc-200 dark:bg-zinc-800 origin-top" />

              <div className={cn(
                "relative rounded-lg overflow-hidden border ml-1",
                isError
                  ? "bg-red-50/10 dark:bg-red-950/10 border-red-100 dark:border-red-900/30"
                  : "bg-white/50 dark:bg-black/20 border-zinc-200 dark:border-zinc-800"
              )}>

                {isWebSearch && webSearchData ? (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50">
                    <WebSearchResults results={webSearchData.results} />
                  </div>
                ) : (
                  <>
                    {/* Technical Header */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-50/80 dark:bg-zinc-900/80 border-b border-zinc-100 dark:border-zinc-800 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                          Output Payload
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-sm transition-all"
                        onClick={(e) => onCopyClick(e, tc.content)}
                      >
                        <Clipboard className="w-2.5 h-2.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300" />
                      </Button>
                    </div>

                    {/* Code Block */}
                    <div className="max-h-64 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#09090b]">
                      <SpeedCodeHighlight
                        code={jsonContent}
                        language="json"
                        isDarkMode={isDarkMode}
                      /* Passing style via props not supported, relying on SpeedCodeHighlight's internal style. 
                         Ideally would refactor SpeedCodeHighlight to accept style or className properly.
                         For now, the container handles most layout. */
                      />
                    </div>
                    {/* Footer Decoration */}
                    <div className="h-1 w-full bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800" />
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});
