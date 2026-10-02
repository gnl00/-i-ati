import { cn } from '@renderer/shared/lib/utils';
import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SlashCommand } from './useSlashCommands';

interface CommandPaletteProps {
  isOpen: boolean;
  commands: SlashCommand[];
  selectedIndex: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onCommandClick: (command: SlashCommand) => void | Promise<void>;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  commands,
  selectedIndex,
  textareaRef,
  onCommandClick,
}) => {
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!isOpen || !textarea) return;

    const updateAnchor = (): void => {
      const { top, left, width } = textarea.getBoundingClientRect();
      setAnchor({ top: top - 10, left, width });
    };
    updateAnchor();
    const observer = new ResizeObserver(updateAnchor);
    observer.observe(textarea);
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return (): void => {
      observer.disconnect();
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [isOpen, textareaRef]);

  if (!isOpen || !anchor || commands.length === 0) return null;

  return createPortal(
    <div
      className="fixed z-9999"
      style={{ ...anchor, transform: 'translateY(-100%)' }}
    >
      <div
        className="@container overflow-hidden rounded-[10px] border border-(--app-border-standard) bg-(--app-surface-raised) p-1 shadow-[0_8px_24px_rgb(0_0_0/0.08)] dark:shadow-[0_8px_24px_rgb(0_0_0/0.2)]"
        role="group"
        aria-label="Slash commands"
      >
        {commands.map((command, index) => (
          <button
            key={command.cmd}
            type="button"
            className={cn(
              'flex min-h-10 w-full items-center gap-4 rounded-md px-3 py-2 text-left text-(--app-text-primary) focus-visible:outline-2 focus-visible:outline-(--app-accent) active:scale-[0.99]',
              index === selectedIndex
                ? 'bg-(--app-surface-hover)'
                : 'hover:bg-(--app-surface-hover)',
            )}
            aria-label={`${command.label}: ${command.description} (${command.cmd})`}
            aria-current={index === selectedIndex ? 'true' : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void onCommandClick(command)}
          >
            <span
              className="min-w-0 flex-1 truncate text-[13px] font-semibold @[520px]:flex-none"
              title={command.label}
            >
              {command.label}
            </span>
            <span
              className="hidden min-w-0 flex-1 truncate text-[11px] text-(--app-text-secondary) @[520px]:block"
              title={command.description}
            >
              {command.description}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-(--app-text-secondary)">
              {command.cmd}
            </span>
            <span
              className="w-3 shrink-0 text-[11px] text-(--app-text-secondary)"
              aria-hidden="true"
            >
              {index === selectedIndex ? '↵' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
