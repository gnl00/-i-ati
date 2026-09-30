import { useEffect, useRef, useState } from 'react';
import { ArrowDownRight } from 'lucide-react';
import { useSheetStore } from '@renderer/features/chat/state/sheetStore';

const HINT_TIMEOUT_MS = 2500;

const ChatSheetHover = (): React.JSX.Element | null => {
  const sheetOpenState = useSheetStore((state) => state.sheetOpenState);
  const setSheetOpenState = useSheetStore((state) => state.setSheetOpenState);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [revealed, setRevealed] = useState(false);

  const clearTimer = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  const hideHint = (): void => {
    clearTimer();
    setRevealed(false);
  };

  const openSheet = (): void => {
    hideHint();
    setSheetOpenState(true);
  };

  const scheduleHide = (): void => {
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      setRevealed(false);
    }, HINT_TIMEOUT_MS);
  };

  const toggleHint = (): void => {
    if (revealed) {
      hideHint();
    } else {
      setRevealed(true);
      scheduleHide();
    }
  };

  useEffect(() => {
    if (sheetOpenState) hideHint();
    return clearTimer;
  }, [sheetOpenState]);

  if (sheetOpenState) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Reveal sidebar shortcut"
        aria-expanded={revealed}
        className="app-undragable peer fixed left-0 top-10 z-50 h-5 w-5 cursor-pointer bg-transparent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-(--app-accent)"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') toggleHint();
        }}
        onFocus={() => {
          if (!revealed) {
            setRevealed(true);
            scheduleHide();
          }
        }}
        onClick={() => {
          if (revealed) openSheet();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') hideHint();
        }}
      />
      <button
        type="button"
        aria-label="Open sidebar"
        aria-hidden={!revealed}
        tabIndex={revealed ? 0 : -1}
        data-revealed={revealed}
        className={`app-undragable fixed left-0 top-10 z-40 flex size-14 origin-top-left items-center justify-center rounded-br-full border border-t-0 border-l-0 border-white/70 bg-slate-200/55 text-(--app-text-body) shadow-[0_6px_18px_-8px_rgba(15,23,42,0.22)] backdrop-blur-xl transition-[opacity,scale] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-200/70 hover:text-(--app-text-primary) focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-(--app-accent) peer-focus-visible:transition-none motion-reduce:transition-none dark:border-white/10 dark:bg-zinc-700/60 dark:shadow-black/20 dark:backdrop-blur-none dark:hover:bg-zinc-700/75 ${revealed ? 'pointer-events-auto scale-100 opacity-100 duration-[190ms]' : 'pointer-events-none scale-[0.92] opacity-0 duration-[140ms]'}`}
        onPointerEnter={clearTimer}
        onPointerLeave={scheduleHide}
        onFocus={clearTimer}
        onBlur={scheduleHide}
        onKeyDown={(event) => {
          if (event.key === 'Escape') hideHint();
        }}
        onClick={openSheet}
      >
        <ArrowDownRight
          aria-hidden="true"
          className="size-[18px] -translate-x-1 -translate-y-1"
        />
      </button>
    </>
  );
};

export default ChatSheetHover;
