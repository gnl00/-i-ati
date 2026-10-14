import { useRef, useState } from 'react';
import { AlignLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig';
import { cn } from '@renderer/shared/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/shared/components/ui/tooltip';

export function CleanOutputToggle({
  onInteractionStart,
  variant = 'surface',
}: {
  onInteractionStart?: () => void;
  variant?: 'default' | 'baseline' | 'surface';
}): React.ReactElement {
  const enabled = useAppConfigStore(
    (state) => state.appConfig?.cleanOutput === true,
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const toggle = async (): Promise<void> => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const store = useAppConfigStore.getState();
      await store.setAppConfig({
        ...store.getAppConfig(),
        cleanOutput: !enabled,
      });
    } catch {
      toast.error('Could not save clean output preference');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <TooltipProvider delayDuration={350}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Clean output"
            aria-pressed={enabled}
            disabled={saving}
            onPointerDownCapture={onInteractionStart}
            onClick={() => void toggle()}
            className={cn(
              'shared-prompt-action-button app-undragable inline-flex h-8 w-8 shrink-0 items-center justify-center border rounded-[10px]',
              'transition-[background-color,border-color,color,transform] duration-150 ease-out motion-reduce:transition-none',
              'enabled:active:scale-95 motion-reduce:transform-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background',
              'disabled:cursor-wait disabled:opacity-50',
              variant === 'baseline'
                ? 'rounded-xl border-slate-200/50 bg-slate-50/50 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 dark:border-(--app-border-subtle) dark:bg-(--app-surface) dark:text-(--app-text-secondary) dark:hover:border-(--app-border-standard) dark:hover:bg-(--app-surface-hover) dark:hover:text-(--app-text-primary)'
                : 'border-slate-200/45 bg-white/35 text-slate-500 hover:border-slate-300/65 hover:bg-slate-50/80 hover:text-slate-700 dark:border-(--chat-border-subtle) dark:bg-(--chat-surface) dark:text-(--chat-text-secondary) dark:hover:border-(--chat-border-standard) dark:hover:bg-(--chat-surface-hover) dark:hover:text-(--chat-text-primary)',
              enabled &&
                'border-emerald-200/75 bg-emerald-50/65 text-emerald-700 hover:border-emerald-300/80 hover:bg-emerald-100/70 hover:text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-950/35 dark:text-emerald-300 dark:hover:border-emerald-600/60 dark:hover:bg-emerald-900/35 dark:hover:text-emerald-200',
            )}
          >
            <AlignLeft aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="rounded-lg border border-slate-700/50 bg-slate-900/95 px-3 py-1.5 text-xs text-slate-100 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-(--app-border-standard) dark:bg-(--app-surface-raised) dark:text-(--app-text-primary) dark:backdrop-blur-none">
          <p className="font-medium">Clean output: {enabled ? 'On' : 'Off'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
