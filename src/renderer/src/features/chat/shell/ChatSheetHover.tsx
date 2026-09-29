import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useSheetStore } from '@renderer/features/chat/state/sheetStore';

const ChatSheetHover = (): React.JSX.Element | null => {
  const sheetOpenState = useSheetStore((state) => state.sheetOpenState);
  const setSheetOpenState = useSheetStore((state) => state.setSheetOpenState);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pending, setPending] = useState(false);

  const cancelHover = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setPending(false);
  };

  useEffect(() => {
    if (sheetOpenState) {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      setPending(false);
    }
    return (): void => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [sheetOpenState]);

  const openSheet = (): void => {
    cancelHover();
    setSheetOpenState(true);
  };

  if (sheetOpenState) return null;

  return (
    <button
      type="button"
      aria-label="Open sidebar"
      aria-expanded={false}
      data-pending={pending}
      className="app-undragable group fixed left-0 top-16 z-40 flex h-[28vh] w-[22px] cursor-pointer items-center justify-start select-none focus-visible:outline-hidden"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return;
        cancelHover();
        setPending(true);
        timer.current = setTimeout(openSheet, 250);
      }}
      onPointerLeave={cancelHover}
      onPointerCancel={cancelHover}
      onBlur={cancelHover}
      onClick={openSheet}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none flex h-10 w-full items-center justify-center rounded-r-lg bg-(--app-surface-raised) text-(--app-text-muted) opacity-65 transition-[background-color,color,opacity,transform] duration-150 group-data-[pending=true]:bg-(--app-surface-hover) group-data-[pending=true]:text-(--app-text-primary) group-data-[pending=true]:opacity-100 group-focus-visible:bg-(--app-surface-hover) group-focus-visible:text-(--app-text-primary) group-focus-visible:opacity-100 group-focus-visible:ring-1 group-focus-visible:ring-(--app-accent) group-active:scale-95 motion-reduce:transition-none motion-reduce:transform-none"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
};

export default ChatSheetHover;
