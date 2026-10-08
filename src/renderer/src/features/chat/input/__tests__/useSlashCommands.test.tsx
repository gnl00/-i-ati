// @vitest-environment happy-dom
import { act, type KeyboardEvent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSlashCommands, type SlashCommand, type UseSlashCommandsOptions } from '../useSlashCommands';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const store = vi.hoisted(() => ({
  resetChatContext: vi.fn(),
  toggleWebSearch: vi.fn(),
  currentChatUuid: 'chat-1' as string | null,
  updateWorkspacePath: vi.fn(async () => undefined),
}));

vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: (selector: (state: typeof store) => unknown): unknown => selector(store),
}));

describe('useSlashCommands', () => {
  let root: Root;
  let container: HTMLDivElement;
  let snapshot: ReturnType<typeof useSlashCommands>;
  const onCommandExecute = vi.fn();
  const onSkillCommandSubmit = vi.fn(async () => false);
  const pdfAction = vi.fn(async () => true);
  const pdfOtherAction = vi.fn(async () => true);
  let skillCommands: SlashCommand[];

  const render = async (options: UseSlashCommandsOptions = {}): Promise<void> => {
    function Harness(): null {
      snapshot = useSlashCommands({
        skillCommands,
        onCommandExecute,
        onSkillCommandSubmit,
        ...options,
      });
      return null;
    }
    await act(async () => root.render(<Harness />));
  };

  const input = async (text: string): Promise<void> => {
    await act(async () => snapshot.handleInputChange(text));
  };

  const key = async (value: string): Promise<{ handled: boolean; prevented: boolean }> => {
    const preventDefault = vi.fn();
    let handled = false;
    await act(async () => {
      handled = snapshot.handleKeyDown({ key: value, shiftKey: false, preventDefault } as unknown as KeyboardEvent<HTMLTextAreaElement>);
    });
    return { handled, prevented: preventDefault.mock.calls.length > 0 };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    store.currentChatUuid = 'chat-1';
    pdfAction.mockResolvedValue(true);
    onSkillCommandSubmit.mockResolvedValue(false);
    skillCommands = [
      { cmd: '/sk:pdf-other', label: 'PDF Other', description: 'Another PDF skill', action: pdfOtherAction },
      { cmd: '/sk:pdf', label: 'PDF', description: 'Create and read PDFs', action: pdfAction },
    ];
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await render();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps existing commands and executes the selected clear action', async () => {
    await input('/clear');
    expect(snapshot.filteredCommands.map(command => command.cmd)).toEqual(['/clear', '/clear-workspace']);
    expect(await key('Enter')).toEqual({ handled: true, prevented: true });
    expect(store.resetChatContext).toHaveBeenCalledOnce();
    expect(store.toggleWebSearch).toHaveBeenCalledWith(false);
    expect(onCommandExecute).toHaveBeenCalledWith(expect.objectContaining({ cmd: '/clear' }));
    expect(snapshot.isOpen).toBe(false);
  });

  it('accepts surrounding whitespace and executes only an exact skill', async () => {
    await input('  /sk:pdf \n');
    expect(snapshot.query).toBe('sk:pdf');
    expect(snapshot.filteredCommands.map(command => command.cmd)).toEqual(['/sk:pdf']);
    expect(snapshot.selectedIndex).toBe(0);
    await key('Enter');
    expect(pdfAction).toHaveBeenCalledOnce();
    expect(pdfOtherAction).not.toHaveBeenCalled();
    expect(snapshot.isOpen).toBe(false);
  });

  it('normalizes the command prefix while preserving exact skill-name casing', async () => {
    await input('/SK:pdf');
    expect(snapshot.query).toBe('sk:pdf');
    expect(snapshot.filteredCommands.map(command => command.cmd)).toEqual(['/sk:pdf']);
    await key('Enter');
    expect(pdfAction).toHaveBeenCalledOnce();
    await input('/SK:PDF');
    expect(snapshot.query).toBe('sk:PDF');
    expect(snapshot.selectedIndex).toBe(-1);
    await key('Enter');
    expect(onSkillCommandSubmit).toHaveBeenLastCalledWith('/sk:PDF');
    expect(pdfAction).toHaveBeenCalledOnce();
    expect(pdfOtherAction).not.toHaveBeenCalled();
    expect(snapshot.isOpen).toBe(true);
  });

  it('routes an unmatched skill to exact submission until the user selects a candidate', async () => {
    skillCommands = [skillCommands[0]];
    await render();
    await input('/sk:pdf');
    expect(snapshot.selectedIndex).toBe(-1);
    expect(await key('Enter')).toEqual({ handled: true, prevented: true });
    expect(onSkillCommandSubmit).toHaveBeenCalledWith('/sk:pdf');
    expect(pdfOtherAction).not.toHaveBeenCalled();
    expect(snapshot.isOpen).toBe(true);
    await key('ArrowDown');
    expect(snapshot.selectedIndex).toBe(0);
    await key('Enter');
    expect(pdfOtherAction).toHaveBeenCalledOnce();
  });

  it('requires explicit candidate selection for partial and empty skill prefixes', async () => {
    await input('/sk:p');
    expect(snapshot.selectedIndex).toBe(-1);
    await key('ArrowUp');
    expect(snapshot.selectedIndex).toBe(1);
    await key('Enter');
    expect(pdfAction).toHaveBeenCalledOnce();
    await input('/sk:');
    expect(snapshot.selectedIndex).toBe(-1);
    await key('Enter');
    expect(onSkillCommandSubmit).toHaveBeenLastCalledWith('/sk:');
    expect(pdfOtherAction).not.toHaveBeenCalled();
    expect(snapshot.isOpen).toBe(true);
    await key('ArrowDown');
    expect(snapshot.selectedIndex).toBe(0);
    await key('Enter');
    expect(pdfOtherAction).toHaveBeenCalledOnce();
  });

  it('keeps the draft and palette after failed activation', async () => {
    pdfAction.mockResolvedValue(false);
    await input('/sk:pdf');
    await key('Enter');
    expect(onCommandExecute).not.toHaveBeenCalled();
    expect(snapshot.isOpen).toBe(true);
    expect(snapshot.query).toBe('sk:pdf');
  });

  it('closes the palette only after exact submission succeeds', async () => {
    onSkillCommandSubmit.mockResolvedValue(true);
    await input('/sk:missing');
    await key('Enter');
    expect(snapshot.isOpen).toBe(false);
    expect(snapshot.query).toBe('');
    expect(onCommandExecute).not.toHaveBeenCalled();
  });

  it('keeps a newer command draft when an earlier activation finishes', async () => {
    let complete!: (success: boolean) => void;
    pdfAction.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    await input('/sk:pdf');
    let execution!: Promise<boolean>;
    await act(async () => { execution = snapshot.executeCommand(skillCommands[1]); });
    await input('/sk:pdf-other');
    await act(async () => {
      complete(true);
      await execution;
    });
    expect(snapshot.isOpen).toBe(true);
    expect(snapshot.query).toBe('sk:pdf-other');
    expect(onCommandExecute).not.toHaveBeenCalled();
  });

  it('submits unmatched or malformed standalone skill tokens without silently consuming Enter', async () => {
    await input('/sk:missing');
    expect(snapshot.filteredCommands).toEqual([]);
    expect(await key('Enter')).toEqual({ handled: true, prevented: true });
    expect(onSkillCommandSubmit).toHaveBeenLastCalledWith('/sk:missing');
    await input('/sk:PDF');
    expect(snapshot.selectedIndex).toBe(-1);
    await key('Enter');
    expect(onSkillCommandSubmit).toHaveBeenLastCalledWith('/sk:PDF');
    expect(pdfAction).not.toHaveBeenCalled();
  });

  it('leaves skill commands followed by a task to ordinary message submission', async () => {
    for (const text of ['/sk:pdf read this file', '/sk:pdf\nRead this file']) {
      await input(text);
      expect(snapshot.isOpen).toBe(false);
      expect(await key('Enter')).toEqual({ handled: false, prevented: false });
    }
    expect(pdfAction).not.toHaveBeenCalled();
    expect(onSkillCommandSubmit).not.toHaveBeenCalled();
  });

  it('allows ordinary submission when no command matches and closes with Escape', async () => {
    await input('/unknown');
    expect(await key('Enter')).toEqual({ handled: false, prevented: false });
    await input('/sk:');
    expect(await key('Escape')).toEqual({ handled: true, prevented: true });
    expect(snapshot.isOpen).toBe(false);
  });
});
