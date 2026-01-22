import React, { useEffect, useMemo, useState } from 'react'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@renderer/components/ui/drawer'
import { Button } from '@renderer/components/ui/button'
import { toast } from 'sonner'
import { Badge } from '@renderer/components/ui/badge'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'

type ProviderAdvanceConfigDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  providerDefinition?: ProviderDefinition
  onSave: (payload: Record<string, any> | undefined) => void
  trigger: React.ReactNode
}

const FORBIDDEN_OVERRIDE_KEYS = new Set(['stream', 'messages', 'tools', 'model'])

const isPlainObject = (value: any): value is Record<string, any> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const hasForbiddenKey = (value: any): boolean => {
  if (!isPlainObject(value)) return false
  for (const [key, inner] of Object.entries(value)) {
    if (FORBIDDEN_OVERRIDE_KEYS.has(key)) return true
    if (isPlainObject(inner) && hasForbiddenKey(inner)) return true
    if (Array.isArray(inner)) {
      for (const item of inner) {
        if (hasForbiddenKey(item)) return true
      }
    }
  }
  return false
}

const parsePayloadOverrides = (raw: string): { ok: true; value: Record<string, any> | undefined } | { ok: false; error: string } => {
  if (!raw.trim()) {
    return { ok: true, value: undefined }
  }
  try {
    const parsed = JSON.parse(raw)
    if (!isPlainObject(parsed)) {
      return { ok: false, error: 'Payload must be a JSON object' }
    }
    if (hasForbiddenKey(parsed)) {
      return { ok: false, error: 'Payload contains forbidden keys (stream/messages/tools/model)' }
    }
    return { ok: true, value: parsed }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Invalid JSON' }
  }
}

export const ProviderAdvanceConfigDrawer: React.FC<ProviderAdvanceConfigDrawerProps> = ({
  open,
  onOpenChange,
  providerDefinition,
  onSave,
  trigger
}) => {
  const [draft, setDraft] = useState<string>('')

  const initialValue = useMemo(() => {
    const overrides = providerDefinition?.requestOverrides
    if (!overrides || Object.keys(overrides).length === 0) {
      return ''
    }
    try {
      return JSON.stringify(overrides, null, 2)
    } catch {
      return ''
    }
  }, [providerDefinition?.id])

  useEffect(() => {
    setDraft(initialValue)
  }, [initialValue])

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        {trigger}
      </DrawerTrigger>
      <DrawerContent className="max-h-[80vh] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <DrawerHeader className="px-6 pt-6">
          <DrawerTitle className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Request Payload Overrides
          </DrawerTitle>
          <DrawerDescription className="text-xs text-slate-500 dark:text-slate-400 space-x-2">
            <span>
              Applies to provider
            </span>
            {providerDefinition && (
                <Badge
                    variant="outline"
                    className="text-[10px] font-semibold px-3 py-0 bg-slate-100/80 dark:bg-slate-900/80 border-slate-300/50 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 backdrop-blur-sm"
                >
                    {providerDefinition && `${providerDefinition.displayName}`}
                </Badge>
            )}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-6 pb-4 space-y-3">
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/40 p-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Paste a JSON object to append into every request payload.
              Keys <span className="font-mono">stream</span>, <span className="font-mono">messages</span>, <span className="font-mono">tools</span>, <span className="font-mono">model</span> are blocked.
            </p>
          </div>
          <div className="min-h-[220px] rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-gray-950/40 overflow-hidden">
            <CodeMirror
              value={draft}
              height="220px"
              extensions={[json()]}
              onChange={(value) => setDraft(value)}
              theme="dark"
              placeholder='{\n  \"temperature\": 0.7,\n  \"tool_config\": { \"mode\": \"auto\" }\n}'
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightSpecialChars: true,
                foldGutter: true,
                drawSelection: true,
                dropCursor: true,
                allowMultipleSelections: true,
                indentOnInput: true,
                syntaxHighlighting: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                rectangularSelection: true,
                crosshairCursor: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                closeBracketsKeymap: true,
                defaultKeymap: true,
                searchKeymap: true,
                historyKeymap: true,
                foldKeymap: true,
                completionKeymap: true,
                lintKeymap: true
              }}
              style={{
                fontFamily: 'JetBrains Mono, Fira Code, ui-monospace, monospace',
                fontSize: '12px',
                height: '220px'
              }}
            />
          </div>
        </div>
        <DrawerFooter className="px-6 pb-6">
          <div className="flex items-center gap-2 w-full">
            <DrawerClose asChild>
              <Button variant="outline" className="flex-1 rounded-xl">
                Cancel
              </Button>
            </DrawerClose>
            <Button
              className="flex-1 rounded-xl"
              onClick={() => {
                const parsed = parsePayloadOverrides(draft)
                if (!parsed.ok) {
                  toast.error(parsed.error)
                  return
                }
                onSave(parsed.value)
                toast.success('Request payload updated')
                onOpenChange(false)
              }}
            >
              Save
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
