// @vitest-environment happy-dom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ModelOption } from '@renderer/shared/config/modelTypes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const noop = vi.fn();
  const state = {
    imageSrcBase64List: [],
    messages: [],
    runPhase: 'idle',
    postRunJobs: { title: 'idle', compression: 'idle' },
    currentChatUuid: null as string | null,
    currentChatId: null as number | null,
    chatList: [],
    permissionApprovalMode: 'manual',
    setImageSrcBase64List: noop,
    ensureSelectedModelRef: vi.fn(),
    setSelectedThinkingLevel: noop,
    setSelectedModelRef: noop,
    setPermissionApprovalMode: noop,
    editUserInstructionDraft: noop,
    resetChatContext: noop,
    toggleWebSearch: noop,
    prependChatListEntry: noop,
    selectChatShell: noop,
    updateWorkspacePath: noop,
  };
  return {
    state,
    noop,
    modelOptions: [{
      account: { id: 'test-account', label: 'Test provider', providerId: 'test', apiUrl: '', apiKey: '', models: [] },
      definition: { id: 'test', displayName: 'Test provider', adapterPluginId: 'test-adapter' },
      model: { id: 'test-model', label: 'Test model', type: 'llm' }
    }] as ModelOption[],
    identity: vi.fn(),
    submit: vi.fn(),
    activateSkill: vi.fn().mockResolvedValue(true),
    deactivateSkill: vi.fn().mockResolvedValue(true),
    skillLoading: false,
    skillsUpdating: false,
    skills: [{ name: 'pdf', description: 'Read and create PDFs' }] as SkillMetadata[],
    activeSkills: [] as string[],
    skillOptions: null as null | { onChatCreated: (chatUuid: string) => void },
    selectDirectory: vi.fn().mockResolvedValue({ success: false }),
  };
});
vi.mock('@renderer/features/chat/state/chatStore', () => ({
  useChatStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    {
      getState: (): typeof mocks.state => mocks.state,
    },
  ),
}));
vi.mock('@renderer/infrastructure/config/appConfig', () => ({
  useAppConfigStore: (): object => ({
    getModelOptions: (): ModelOption[] => mocks.modelOptions,
    resolveModelRef: (): undefined => undefined,
    plugins: [],
  }),
}));
vi.mock('@renderer/features/settings', () => ({
  useMcpConnection: (): object => ({
    syncWithConfig: mocks.noop,
    hydrateFromRuntime: mocks.noop,
  }),
}));
vi.mock('@renderer/features/chat/runtime/useChatRun', () => ({
  default: (): object => ({
    onSubmit: mocks.submit,
    cancel: mocks.noop,
    steer: mocks.noop,
  }),
  getActiveChatRunIdentity: mocks.identity,
}));
vi.mock('../useSkillActivation', () => ({
  useSkillActivation: (options: { onChatCreated: (chatUuid: string) => void }): object => {
    mocks.skillOptions = options;
    return {
      skills: mocks.skills,
      activeSkills: mocks.activeSkills,
      loading: mocks.skillLoading,
      loadError: null,
      refreshSkills: mocks.noop,
      activateSkill: mocks.activateSkill,
      deactivateSkill: mocks.deactivateSkill,
      isUpdatingSkills: mocks.skillsUpdating,
    };
  },
}));
vi.mock('@renderer/infrastructure/ipc', () => ({
  invokeSelectDirectory: mocks.selectDirectory,
}));
vi.mock('../../common/CustomCaretOverlay', () => ({
  CustomCaretOverlay: (): null => null,
}));
import ChatInputArea, { type ChatInputAreaHandle } from '../ChatInputArea';
import { resetChatInputQueueStoreForTests, useChatInputQueueStore } from '../chatInputQueueStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Welcome composer interaction boundaries', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onFocus = vi.fn();
  const parentClick = vi.fn();
  const inputRef = createRef<ChatInputAreaHandle>();

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.activateSkill.mockReset().mockResolvedValue(true);
    mocks.deactivateSkill.mockReset().mockResolvedValue(true);
    mocks.skillsUpdating = false;
    mocks.activeSkills = [];
    mocks.state.ensureSelectedModelRef.mockReset();
    mocks.state.currentChatId = null;
    mocks.state.currentChatUuid = null;
    mocks.state.runPhase = 'idle';
    mocks.state.postRunJobs = { title: 'idle', compression: 'idle' };
    mocks.identity.mockReturnValue(null);
    resetChatInputQueueStoreForTests();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <div onClick={parentClick}>
          <ChatInputArea
            ref={inputRef}
            welcomeVisualMode
            onWelcomeFocusStateChange={onFocus}
          />
        </div>,
      );
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function paste(text: string): Event {
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text, items: [] } })
    return event
  }

  async function renderComposer(welcomeVisualMode = true): Promise<void> {
    // The mocked selectors do not subscribe; a new callback publishes each snapshot.
    await act(async () => root.render(
      <div onClick={parentClick}>
        <ChatInputArea
          ref={inputRef}
          welcomeVisualMode={welcomeVisualMode}
          onWelcomeFocusStateChange={focused => onFocus(focused)}
        />
      </div>,
    ));
  }

  it('resizes Chat from its current automatic height and restores automatic sizing', async () => {
    await renderComposer(false);
    const frame = container.querySelector<HTMLElement>('#inputArea')!;
    const textarea = container.querySelector('textarea')!;
    const handle = container.querySelector<HTMLElement>('[aria-label="Resize input area"]')!;
    expect(handle).not.toBeNull();
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe('');
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({ height: 120 } as DOMRect);
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    const pointer = (type: string, clientY: number, pointerId = 1): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { clientY, pointerId, button: 0 });
      return event;
    };
    await act(async () => handle.dispatchEvent(pointer('pointerdown', 300)));
    await act(async () => handle.dispatchEvent(pointer('pointermove', 200, 2)));
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe('');
    await act(async () => handle.dispatchEvent(pointer('pointermove', 200)));
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe('220px');
    await act(async () => handle.dispatchEvent(pointer('pointermove', 2000)));
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe('96px');
    await act(async () => handle.dispatchEvent(pointer('pointermove', -2000)));
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe(`${Math.max(96, window.innerHeight * 0.6)}px`);
    await act(async () => handle.dispatchEvent(pointer('pointerup', -2000)));
    await act(async () => handle.dispatchEvent(pointer('pointermove', 200)));
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe(`${Math.max(96, window.innerHeight * 0.6)}px`);
    await act(async () => handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe('');
    await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe('144px');
    await act(async () => handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(frame.style.getPropertyValue('--chat-input-height')).toBe('');
    await renderComposer(true);
    expect(container.querySelector('[aria-label="Resize input area"]')).toBeNull();
  });

  it('keeps an empty Welcome expanded after blur while skills remain active', async () => {
    mocks.activeSkills = ['pdf'];
    await renderComposer();
    const textarea = container.querySelector('textarea')!;
    const frame = container.querySelector<HTMLElement>('#inputArea')!;
    expect(textarea.value).toBe('');
    expect(frame.dataset.expanded).toBe('true');
    expect(container.querySelector('[aria-label="Active skills"] li')?.textContent).toBe('pdf');
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')?.disabled).toBe(true);

    await act(async () => textarea.focus());
    await act(async () => textarea.blur());
    expect(onFocus).toHaveBeenLastCalledWith(false);
    expect(frame.dataset.expanded).toBe('true');

    mocks.activeSkills = [];
    await renderComposer();
    expect(container.querySelector('[aria-label="Active skills"]')).toBeNull();
    expect(frame.dataset.expanded).toBe('false');
  });

  it.each([true, false])('retains active skills after sending only the user draft (Welcome: %s)', async welcomeVisualMode => {
    mocks.state.currentChatId = 1;
    mocks.state.currentChatUuid = 'skill-chat';
    mocks.activeSkills = ['pdf', 'documents'];
    mocks.state.ensureSelectedModelRef.mockReturnValue({ accountId: 'a', modelId: 'm' });
    await renderComposer(welcomeVisualMode);
    await act(async () => inputRef.current?.fillInput('Summarize this report'));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith('Summarize this report', [], expect.anything());
    expect(container.querySelector('textarea')?.value).toBe('');
    expect(Array.from(container.querySelectorAll('[aria-label="Active skills"] li'), name => name.textContent)).toEqual(['pdf', 'documents']);
    expect(mocks.activateSkill).not.toHaveBeenCalled();
  });

  it('updates active names within a chat and resets disclosure when the chat changes', async () => {
    mocks.state.currentChatId = 1;
    mocks.state.currentChatUuid = 'chat-a';
    mocks.activeSkills = ['pdf', 'documents', 'read', 'write'];
    await renderComposer(false);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Show 1 more active skills"]')!.click());
    expect(container.querySelectorAll('[aria-label="Active skills"] li')).toHaveLength(4);

    mocks.activeSkills = ['pdf', 'read', 'write', 'ui', 'think'];
    await renderComposer(false);
    expect(Array.from(container.querySelectorAll('[aria-label="Active skills"] li'), name => name.textContent)).toEqual(['pdf', 'read', 'write', 'ui', 'think']);

    mocks.state.currentChatId = 2;
    mocks.state.currentChatUuid = 'chat-b';
    mocks.activeSkills = ['ui', 'think', 'ponytail', 'health'];
    await renderComposer(false);
    expect(Array.from(container.querySelectorAll('[aria-label="Active skills"] li'), name => name.textContent)).toEqual(['ui', 'think', 'ponytail']);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Show 1 more active skills"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it.each([true, false])('deactivates only the chosen skill while preserving the draft, attachment and caret (Welcome: %s)', async welcomeVisualMode => {
    mocks.state.currentChatId = 1;
    mocks.state.currentChatUuid = 'skill-chat';
    mocks.activeSkills = ['pdf', 'documents'];
    await renderComposer(welcomeVisualMode);
    await act(async () => inputRef.current?.fillInput('Keep this draft'));
    const textarea = container.querySelector('textarea')!;
    const attachment = 'x'.repeat(8000);
    await act(async () => textarea.dispatchEvent(paste(attachment)));
    await act(async () => textarea.focus());
    textarea.setSelectionRange(2, 6);
    await act(async () => container.querySelector<HTMLSpanElement>('[aria-label="Active skills"] li span')!.click());
    expect(mocks.deactivateSkill).not.toHaveBeenCalled();

    const deactivate = container.querySelector<HTMLButtonElement>('[aria-label="Deactivate pdf"]')!;
    deactivate.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await act(async () => deactivate.click());
    expect(mocks.deactivateSkill).toHaveBeenCalledExactlyOnceWith('pdf');
    mocks.activeSkills = ['documents'];
    await renderComposer(welcomeVisualMode);

    expect(container.querySelector('textarea')).toBe(textarea);
    expect(textarea.value).toBe('Keep this draft');
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(6);
    expect(document.activeElement).toBe(textarea);
    expect(container.querySelector('pre')?.textContent).toBe(attachment);
    expect(Array.from(container.querySelectorAll('[aria-label="Active skills"] li'), name => name.textContent)).toEqual(['documents']);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('preserves the active tag and draft when deactivation fails', async () => {
    mocks.activeSkills = ['pdf'];
    mocks.deactivateSkill.mockResolvedValueOnce(false);
    await renderComposer();
    await act(async () => inputRef.current?.fillInput('Keep this draft'));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Deactivate pdf"]')!.click());
    expect(mocks.deactivateSkill).toHaveBeenCalledExactlyOnceWith('pdf');
    expect(container.querySelector('textarea')?.value).toBe('Keep this draft');
    expect(container.querySelector('[aria-label="Active skills"] li')?.textContent).toBe('pdf');
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each(['streaming', 'title pending', 'compression pending', 'skills updating'])('disables deactivation during %s', async status => {
    mocks.activeSkills = ['pdf'];
    if (status === 'streaming') mocks.state.runPhase = 'streaming';
    else if (status === 'title pending') mocks.state.postRunJobs.title = 'pending';
    else if (status === 'compression pending') mocks.state.postRunJobs.compression = 'pending';
    else mocks.skillsUpdating = true;
    await renderComposer();
    const deactivate = container.querySelector<HTMLButtonElement>('[aria-label="Deactivate pdf"]')!;
    expect(deactivate.disabled).toBe(true);
    await act(async () => deactivate.click());
    expect(mocks.deactivateSkill).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Active skills"] li')?.textContent).toBe('pdf');
  });

  it.each([true, false])('holds an already scheduled queue until deactivation settles (success: %s)', async success => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let resolve!: (deactivated: boolean) => void;
      mocks.deactivateSkill.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; }));
      const scope = { chatUuid: 'queue-chat', submissionId: null };
      mocks.state.currentChatId = 1;
      mocks.state.currentChatUuid = scope.chatUuid;
      mocks.activeSkills = ['pdf'];
      await renderComposer();
      await act(async () => {
        useChatInputQueueStore.getState().setMessages(scope, [{ id: 'queued-task', status: 'queued', text: 'queued task', images: [] }]);
      });
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Deactivate pdf"]')!.click());
      // The timer predates the hook's updating snapshot, so the synchronous lock must hold it.
      expect(mocks.skillsUpdating).toBe(false);
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(mocks.submit).not.toHaveBeenCalled();
      expect(useChatInputQueueStore.getState().owners['chat:queue-chat']?.messages.map(item => item.text)).toEqual(['queued task']);

      mocks.skillsUpdating = true;
      await renderComposer();
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(mocks.submit).not.toHaveBeenCalled();
      await act(async () => resolve(success));
      mocks.skillsUpdating = false;
      mocks.activeSkills = success ? [] : ['pdf'];
      await renderComposer();
      await act(async () => vi.advanceTimersByTimeAsync(200));
      expect(mocks.deactivateSkill).toHaveBeenCalledExactlyOnceWith('pdf');
      expect(mocks.submit).toHaveBeenCalledExactlyOnceWith('queued task', [], expect.anything());
      expect(useChatInputQueueStore.getState().owners['chat:queue-chat']?.messages).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([['Enter', '/sk:pdf'], ['Send', '/sk:pdf'], ['Enter', '/SK:pdf'], ['Send', '/SK:pdf']])('activates a standalone skill via %s (%s) without submitting a model request', async (method, command) => {
    await act(async () => inputRef.current?.fillInput(command));
    const textarea = container.querySelector('textarea')!;
    await act(async () => {
      if (method === 'Enter') textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      else container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click();
    });
    expect(mocks.activateSkill).toHaveBeenCalledExactlyOnceWith('pdf');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(textarea.value).toBe('');
    expect(useChatInputQueueStore.getState().owners['pending']?.messages ?? []).toEqual([]);
  });

  it('preserves a failed skill command and its attachment', async () => {
    mocks.activateSkill.mockResolvedValueOnce(false);
    const textarea = container.querySelector('textarea')!;
    const attachment = 'x'.repeat(8000);
    await act(async () => textarea.dispatchEvent(paste(attachment)));
    await act(async () => inputRef.current?.fillInput('/sk:missing'));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());
    expect(textarea.value).toBe('/sk:missing');
    expect(container.querySelector('pre')?.textContent).toBe(attachment);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each(['Enter', 'Send'])('requires a skill choice for an empty command via %s', async method => {
    await act(async () => inputRef.current?.fillInput('/sk:'));
    await act(async () => {
      if (method === 'Enter') container.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      else container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click();
    });
    expect(mocks.activateSkill).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(container.querySelector('textarea')?.value).toBe('/sk:');
  });

  it('requires explicit selection for a partial skill name', async () => {
    await act(async () => inputRef.current?.fillInput('/sk:p'));
    const textarea = container.querySelector('textarea')!;
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(mocks.activateSkill).toHaveBeenCalledExactlyOnceWith('pdf');
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(textarea.value).toBe('');
  });

  it('preserves edits and attachments when activation creates the Welcome chat', async () => {
    let resolve!: (success: boolean) => void;
    mocks.activateSkill.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; }));
    await act(async () => inputRef.current?.fillInput('/sk:pdf'));
    const textarea = container.querySelector('textarea')!;
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await act(async () => inputRef.current?.fillInput('new task draft'));
    const attachment = 'x'.repeat(8000);
    await act(async () => textarea.dispatchEvent(paste(attachment)));
    await act(async () => {
      mocks.skillOptions?.onChatCreated('skill-chat');
      mocks.state.currentChatId = 1;
      mocks.state.currentChatUuid = 'skill-chat';
      root.render(<div onClick={parentClick}><ChatInputArea ref={inputRef} welcomeVisualMode onWelcomeFocusStateChange={focused => onFocus(focused)} /></div>);
      resolve(true);
    });
    expect(textarea.value).toBe('new task draft');
    expect(container.querySelector('pre')?.textContent).toBe(attachment);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it.each([true, false])('holds an already scheduled queue until skill activation settles (success: %s)', async success => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let resolve!: (activated: boolean) => void;
      mocks.activateSkill.mockImplementationOnce(() => new Promise<boolean>(done => { resolve = done; }));
      const scope = { chatUuid: 'queue-chat', submissionId: null };
      const renderComposer = (): void => {
        // Mocked selectors do not subscribe, so changing a prop publishes the hook snapshot.
        root.render(<div onClick={parentClick}><ChatInputArea ref={inputRef} welcomeVisualMode onWelcomeFocusStateChange={focused => onFocus(focused)} /></div>);
      };
      await act(async () => {
        mocks.state.currentChatId = 1;
        mocks.state.currentChatUuid = scope.chatUuid;
        renderComposer();
      });
      await act(async () => {
        useChatInputQueueStore.getState().setMessages(scope, [{ id: 'queued-task', status: 'queued', text: 'queued task', images: [] }]);
      });
      await act(async () => inputRef.current?.fillInput('/sk:pdf'));
      const textarea = container.querySelector('textarea')!;
      await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      // The timer was scheduled before the hook could publish its activating state.
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(mocks.submit).not.toHaveBeenCalled();
      expect(useChatInputQueueStore.getState().owners['chat:queue-chat']?.messages.map(item => item.text)).toEqual(['queued task']);
      await act(async () => {
        mocks.skillsUpdating = true;
        renderComposer();
      });
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(mocks.submit).not.toHaveBeenCalled();
      await act(async () => {
        mocks.skillsUpdating = false;
        resolve(success);
        renderComposer();
      });
      expect(textarea.value).toBe(success ? '' : '/sk:pdf');
      await act(async () => vi.advanceTimersByTimeAsync(200));
      expect(mocks.activateSkill).toHaveBeenCalledExactlyOnceWith('pdf');
      expect(mocks.submit).toHaveBeenCalledExactlyOnceWith('queued task', [], expect.anything());
      expect(useChatInputQueueStore.getState().owners['chat:queue-chat']?.messages).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a skill mention with task text on the normal message path', async () => {
    mocks.state.ensureSelectedModelRef.mockReturnValue({ accountId: 'a', modelId: 'm' });
    await act(async () => inputRef.current?.fillInput('/sk:pdf process this file'));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());
    expect(mocks.activateSkill).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledWith('/sk:pdf process this file', [], expect.anything());
    mocks.state.ensureSelectedModelRef.mockReset();
  });

  it('keeps short pastes native and converts large text into a previewable attachment', async () => {
    const textarea = container.querySelector('textarea')!
    const short = paste('short text')
    await act(async () => textarea.dispatchEvent(short))
    expect(short.defaultPrevented).toBe(false)
    const text = '  日志\r\n'.repeat(1600)
    const large = paste(text)
    await act(async () => textarea.dispatchEvent(large))
    expect(large.defaultPrevented).toBe(true)
    expect(textarea.value).toBe('')
    expect(container.querySelector('pre')?.textContent).toBe(text)
    expect(container.querySelector('#inputArea')?.getAttribute('data-expanded')).toBe('true')
    const restore = container.querySelector<HTMLButtonElement>('[aria-label="Paste pasted-text-1.txt as text"]')!
    await act(async () => restore.click())
    expect(textarea.value).toBe(text)
    expect(container.querySelector('[aria-label="Text attachments"]')).toBeNull()
  })

  it('restores a converted paste at its original selection after subsequent edits', async () => {
    await act(async () => inputRef.current?.fillInput('left SELECT right'))
    const textarea = container.querySelector('textarea')!
    textarea.setSelectionRange(5, 11)
    const text = 'x'.repeat(8000)
    await act(async () => textarea.dispatchEvent(paste(text)))
    expect(textarea.value).toBe('left  right')
    await act(async () => inputRef.current?.fillInput('prefix ' + textarea.value))
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Paste pasted-text-1.txt as text"]')!.click())
    expect(textarea.value).toBe('prefix left ' + text + ' right')
  })

  it('keeps consecutive paste contents separate and removes only the selected attachment', async () => {
    const textarea = container.querySelector('textarea')!
    await act(async () => textarea.dispatchEvent(paste('first '.repeat(1400))))
    await act(async () => textarea.dispatchEvent(paste('second '.repeat(1200))))
    expect(container.querySelectorAll('details')).toHaveLength(2)
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove pasted-text-1.txt"]')!.click())
    expect(container.querySelectorAll('details')).toHaveLength(1)
    expect(container.querySelector('pre')?.textContent).toBe('second '.repeat(1200))
  })

  it('allows attachment-only sending and preserves its original text on submission failure', async () => {
    mocks.state.ensureSelectedModelRef.mockReturnValue({ accountId: 'a', modelId: 'm' })
    const textarea = container.querySelector('textarea')!
    const text = 'x'.repeat(8000)
    await act(async () => textarea.dispatchEvent(paste(text)))
    mocks.submit.mockRejectedValueOnce(new Error('send failed'))
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(mocks.submit).toHaveBeenCalledWith('', [], expect.objectContaining({ textAttachments: [expect.objectContaining({ text })] }))
    expect(container.querySelector('pre')?.textContent).toBe(text)
    mocks.state.ensureSelectedModelRef.mockReset()
  })

  it.each([false, true])('preserves new content after first submission rejection (editing queue: %s)', async editing => {
    mocks.state.ensureSelectedModelRef.mockReturnValue({ accountId: 'a', modelId: 'm' })
    let reject!: (error: Error) => void
    mocks.submit.mockImplementationOnce(() => {
      mocks.identity.mockReturnValue({ chatUuid: null, submissionId: 's-rejected' })
      return new Promise((_resolve, rejectPromise) => { reject = rejectPromise })
    })
    await act(async () => inputRef.current?.fillInput('first'))
    const textarea = container.querySelector('textarea')!
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    if (editing) {
      await act(async () => {
        const scope = { chatUuid: null, submissionId: 's-rejected' }
        useChatInputQueueStore.getState().setMessages(scope, [{ id: 'edit-1', status: 'queued', text: 'queued original', images: [] }])
        useChatInputQueueStore.getState().beginEditing(scope)
      })
    }
    await act(async () => inputRef.current?.fillInput('new draft with edits'))
    const attachment = 'x'.repeat(8000)
    await act(async () => textarea.dispatchEvent(paste(attachment)))
    await act(async () => {
      mocks.identity.mockReturnValue(null)
      reject(new Error('rejected'))
    })
    expect(textarea.value).toBe('new draft with edits')
    expect(container.querySelector('pre')?.textContent).toBe(attachment)
    expect(useChatInputQueueStore.getState().owners['pending']?.messages.map(item => item.text)).toContain('first')
    mocks.state.ensureSelectedModelRef.mockReset()
  })

  it('activates Welcome feedback only for textarea focus while toolbar focus keeps the panel expanded', async () => {
    const textarea = container.querySelector('textarea')!;
    const workspace = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Workspace',
    )!;
    await act(async () => textarea.focus());
    expect(onFocus).toHaveBeenLastCalledWith(true);
    await act(async () => workspace.focus());
    expect(onFocus).toHaveBeenLastCalledWith(false);
    expect(
      container.querySelector('#inputArea')?.getAttribute('data-expanded'),
    ).toBe('true');
    await act(async () => workspace.click());
    expect(mocks.selectDirectory).toHaveBeenCalledOnce();
    expect(parentClick).not.toHaveBeenCalled();
    await act(async () => workspace.blur());
    expect(
      container.querySelector('#inputArea')?.getAttribute('data-expanded'),
    ).toBe('false');
    await act(async () => textarea.click());
    expect(parentClick).toHaveBeenCalledOnce();
  });

  for (const label of ['Permission approval mode', 'combobox']) {
    it(`keeps ${label} open and restores trigger focus without activating Welcome feedback`, async () => {
      const trigger =
        label === 'combobox'
          ? container.querySelector<HTMLButtonElement>('[role="combobox"]')!
          : container.querySelector<HTMLButtonElement>(
              `[aria-label="${label}"]`,
            )!;
      await act(async () =>
        trigger.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
        ),
      );
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(
        container.querySelector('#inputArea')?.getAttribute('data-expanded'),
      ).toBe('true');
      const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
      await act(async () => menu.click());
      expect(parentClick).not.toHaveBeenCalled();
      await act(async () =>
        menu.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 160));
      });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
      expect(onFocus).not.toHaveBeenLastCalledWith(true);
      expect(
        container.querySelector('#inputArea')?.getAttribute('data-expanded'),
      ).toBe('true');
    });
  }

  for (const label of ['Permission approval mode', 'combobox']) {
    for (const closeWith of ['Escape', 'trigger', 'selection'] as const) {
      it(`keeps ${label} expanded throughout exit animation and focus restoration via ${closeWith}`, async () => {
        const getStyles = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
          const styles = getStyles(element, pseudo);
          if (element.getAttribute('role') !== 'menu') return styles;
          return new Proxy(styles, {
            get(target, property): unknown {
              if (property === 'animationName') return element.getAttribute('data-state') === 'open' ? 'enter' : 'exit';
              return Reflect.get(target, property);
            }
          });
        });
        const trigger = label === 'combobox'
          ? container.querySelector<HTMLButtonElement>('[role="combobox"]')!
          : container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
        await act(async () => trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })));
        const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
        expect(menu).not.toBeNull();
        const frame = container.querySelector<HTMLElement>('#inputArea')!;
        const states: string[] = [];
        const observer = new MutationObserver(records => {
          states.push(...records.map(record => record.oldValue ?? ''));
        });
        observer.observe(frame, { attributes: true, attributeFilter: ['data-expanded'], attributeOldValue: true });
        try {
          await act(async () => {
            if (closeWith === 'Escape') menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            else if (closeWith === 'trigger') trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
            else menu.querySelector<HTMLElement>(label === 'combobox' ? '[role="menuitem"]' : '[role="menuitemradio"]')!.click();
          });
          expect(menu.dataset.state).toBe('closed');
          // The menu remains mounted beyond the former 120ms hold timeout.
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
          expect(menu.isConnected).toBe(true);
          expect(frame.dataset.expanded).toBe('true');
          await act(async () => menu.dispatchEvent(Object.assign(new Event('animationend', { bubbles: true }), { animationName: 'exit' })));
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
          expect(menu.isConnected).toBe(false);
          expect(document.activeElement).toBe(trigger);
          expect(frame.dataset.expanded).toBe('true');
          expect(states).not.toContain('false');
          expect(onFocus).not.toHaveBeenLastCalledWith(true);
          // Releasing the hold must still allow an empty composer to collapse after blur.
          await act(async () => trigger.blur());
          expect(frame.dataset.expanded).toBe('false');
        } finally {
          observer.disconnect();
        }
      });
    }
  }

  it('does not submit or pass action-row clicks to ancestors when Send is disabled', async () => {
    const send = container.querySelector<HTMLButtonElement>('button:disabled')!;
    expect(send).not.toBeNull();
    await act(async () => send.click());
    expect(mocks.noop).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.anything(),
    );
    await act(async () =>
      container
        .querySelector<HTMLElement>('.shared-prompt-baseline-right')!
        .click(),
    );
    expect(parentClick).not.toHaveBeenCalled();
  });
});
