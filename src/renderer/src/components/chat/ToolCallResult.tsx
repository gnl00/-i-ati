import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';
import { Check, ChevronDown, Clipboard, Clock, X } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import React, { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco, tomorrowNight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { toast } from 'sonner';

interface ToolCallResultProps {
  toolCall: any
  index: number
  isDarkMode: boolean
}

export const ToolCallResult: React.FC<ToolCallResultProps> = ({ toolCall: tc, index, isDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const isError = tc.isError;

  const onCopyClick = (e: React.MouseEvent, content: any) => {
    e.stopPropagation();
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    toast.success('Result Copied');
    setTimeout(() => setIsCopied(false), 2000);
  }

  return (
    <MotionConfig transition={{ type: "spring", stiffness: 400, damping: 30, mass: 1 }}>
      <div className="my-2 w-fit max-w-full">
        <motion.div
          layout
          initial={false}
          animate={{
            backgroundColor: isDarkMode ? (isError ? "rgba(69, 10, 10, 0.4)" : "rgba(24, 24, 27, 0.6)") : (isError ? "rgba(254, 242, 242, 0.8)" : "rgba(255, 255, 255, 1)"),
          }}
          style={{ borderRadius: 24 }}
          className={cn(
            "relative overflow-hidden border shadow-sm",
            isError
              ? "border-red-200 dark:border-red-900/50"
              : "border-zinc-200 dark:border-zinc-800"
          )}
        >
          <motion.button
            layout="position"
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "flex w-full items-center justify-between gap-4 px-3 py-1.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors select-none",
              /* When open, we might want to separate the header visually or keep it seamless. 
                 The iPhone Air demo keeps the header integrated. */
            )}
          >
            {/* Left Side: Status + Name */}
            <motion.div layout="position" className="flex items-center gap-3">
              <div className={cn(
                "flex items-center justify-center w-5 h-5 rounded-full border shadow-sm shrink-0",
                isError
                  ? "bg-red-100 border-red-200 text-red-600 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400"
                  : "bg-green-100/50 border-green-200 text-green-600 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400"
              )}>
                {isError ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
              </div>
              <span className={cn(
                "font-mono text-xs font-bold truncate max-w-[200px]",
                isError ? "text-red-700 dark:text-red-300" : "text-zinc-700 dark:text-zinc-300"
              )}>
                {tc.name}
              </span>
            </motion.div>

            {/* Right Side: Meta */}
            <motion.div layout="position" className="flex items-center gap-3 text-[10px] shrink-0">
              {tc.cost && (
                <div className={cn(
                  "flex items-center gap-1 opacity-60 font-medium",
                  isError ? "text-red-800 dark:text-red-200" : "text-zinc-500 dark:text-zinc-400"
                )}>
                  <Clock className="w-3 h-3" />
                  <span className="font-mono">{tc.cost ? tc.cost / 1000 : 0}s</span>
                </div>
              )}
              <motion.div
                animate={{ rotate: isOpen ? 180 : 0 }}
                className={cn(
                  "opacity-40",
                  isError ? "text-red-900 dark:text-red-100" : "text-zinc-900 dark:text-zinc-100"
                )}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.div>
            </motion.div>
          </motion.button>

          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "relative border-t",
                  isError ? "border-red-100/50 dark:border-red-900/30" : "border-zinc-100 dark:border-zinc-800/50"
                )}
              >
                <div className="absolute right-2 top-2 z-10">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 bg-white/50 dark:bg-zinc-800/50 backdrop-blur hover:bg-white/80 dark:hover:bg-zinc-700/80"
                    onClick={(e) => onCopyClick(e, tc.content)}
                  >
                    {isCopied ? <Check className="w-3 h-3 text-green-500" /> : <Clipboard className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />}
                  </Button>
                </div>
                <div className={cn(
                  "overflow-hidden bg-zinc-50/50 dark:bg-black/20",
                  // Inner shadow for depth
                  "shadow-inner"
                )}>
                  <div className="max-h-[400px] overflow-auto custom-scrollbar p-3">
                    <SyntaxHighlighter
                      language="json"
                      style={isDarkMode ? tomorrowNight : docco}
                      customStyle={{
                        margin: 0,
                        padding: 0,
                        fontSize: '0.75rem',
                        background: 'transparent',
                      }}
                      wrapLongLines={true}
                    >
                      {JSON.stringify(tc.content, null, 2)}
                    </SyntaxHighlighter>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </MotionConfig>
  );
};
