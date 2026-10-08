import { Puzzle, X } from 'lucide-react';
import { useId, useState } from 'react';

export function ActiveSkillsSlot({
  names,
  onDeactivate,
  disabled = false,
}: {
  names: string[];
  onDeactivate: (name: string) => Promise<boolean> | void;
  disabled?: boolean;
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const skillsId = useId();

  if (!names.length) return null;

  const visibleNames = expanded ? names : names.slice(0, 3);
  const hiddenCount = names.length - 3;

  return (
    <div
      role="group"
      aria-label="Active skills"
      className="flex min-w-0 items-start gap-2.5 px-4 pt-3"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 text-[11px] text-(--chat-text-secondary)">
        <Puzzle aria-hidden="true" className="size-3" />
        Skills
      </span>
      <div
        id={skillsId}
        className="flex max-h-24 min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-y-auto overscroll-contain"
      >
        <ul className="contents" aria-label="Active skill names">
          {visibleNames.map((name) => (
            <li
              key={name}
              title={name}
              className="inline-flex h-6 max-w-40 min-w-0 items-center gap-1 rounded-md border border-(--chat-border-standard) bg-(--chat-surface-hover) pl-2 pr-0.5 font-mono text-[11px] text-(--chat-text-body)"
            >
              <span className="min-w-0 truncate">{name}</span>
              <button
                type="button"
                title={`Deactivate ${name}`}
                aria-label={`Deactivate ${name}`}
                disabled={disabled}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-(--chat-text-secondary) enabled:hover:bg-(--chat-surface-raised) enabled:hover:text-(--chat-text-primary) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent) enabled:active:scale-95 disabled:opacity-40 motion-reduce:enabled:active:scale-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  void onDeactivate(name);
                }}
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={skillsId}
            aria-label={
              expanded
                ? 'Show fewer active skills'
                : `Show ${hiddenCount} more active skills`
            }
            className="inline-flex h-6 shrink-0 items-center rounded-md px-1.5 text-[11px] text-(--chat-text-secondary) hover:bg-(--chat-surface-hover) hover:text-(--chat-text-primary) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent) active:scale-95 motion-reduce:active:scale-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show less' : `+${hiddenCount}`}
          </button>
        )}
      </div>
    </div>
  );
}
