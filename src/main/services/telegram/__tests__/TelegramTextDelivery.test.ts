import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import {
  deliverTelegramText,
  withTelegramRetry,
  type TelegramTextMessage,
} from '../TelegramTextDelivery';
import {
  formatTelegramRichText,
  splitTelegramText,
} from '../telegram-rich-text';

const createBot = (): Bot =>
  ({
    api: {
      sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      sendRichMessage: vi.fn().mockResolvedValue({ message_id: 2 }),
      editMessageText: vi.fn().mockResolvedValue(true),
      deleteMessage: vi.fn().mockResolvedValue(true),
    },
  }) as unknown as Bot;
const parseError = {
  error_code: 400,
  description: 'Bad Request: can\'t parse entities',
};
afterEach(() => vi.useRealTimers());

describe('Telegram text delivery', () => {
  it('shares safe inline HTML and reply/topic options with proactive sends', async () => {
    const bot = createBot();
    await deliverTelegramText(
      bot,
      { chatId: '123', threadId: '9', replyToMessageId: '7' },
      '**Hello** `code`',
    );
    expect(bot.api.sendMessage).toHaveBeenCalledWith(
      123,
      '<b>Hello</b> <code>code</code>',
      {
        parse_mode: 'HTML',
        message_thread_id: 9,
        reply_parameters: { message_id: 7 },
        link_preview_options: { is_disabled: true },
      },
    );
  });

  it('uses native rich tables and edits their original message', async () => {
    const bot = createBot();
    const messages = await deliverTelegramText(
      bot,
      { chatId: '123' },
      '# Results\n\n| A | B |\n| - | - |\n| 1 | 2 |',
    );
    expect(bot.api.sendRichMessage).toHaveBeenCalledWith(
      123,
      { html: expect.stringContaining('<table compact>') },
      {},
    );
    await deliverTelegramText(bot, { chatId: '123' }, '# Updated', messages);
    expect(bot.api.editMessageText).toHaveBeenCalledWith(
      123,
      2,
      { html: '<h1>Updated</h1>' },
      {},
    );
  });

  it('splits long replies without breaking Unicode or HTML tags', async () => {
    const bot = createBot();
    const value = '**' + '🙂'.repeat(20000) + '**';
    const messages = await deliverTelegramText(bot, { chatId: '123' }, value);
    expect(messages).toHaveLength(2);
    expect(bot.api.sendRichMessage).toHaveBeenCalledTimes(2);
    const chunks = splitTelegramText(value, 30000);
    expect(chunks.join('')).toBe(value);
    expect(chunks.some((chunk) => /^[\uDC00-\uDFFF]/.test(chunk))).toBe(false);
  });

  it('falls back only after explicit format rejection; network failures never resend', async () => {
    const bot = createBot();
    vi.mocked(bot.api.sendMessage).mockRejectedValueOnce(parseError);
    await deliverTelegramText(bot, { chatId: '123' }, '**Hello**');
    expect(bot.api.sendMessage).toHaveBeenLastCalledWith(
      123,
      'Hello',
      expect.not.objectContaining({ parse_mode: 'HTML' }),
    );
    const offline = new Error('timeout');
    vi.mocked(bot.api.sendMessage).mockClear().mockRejectedValueOnce(offline);
    await expect(
      deliverTelegramText(bot, { chatId: '123' }, '**Hello**'),
    ).rejects.toBe(offline);
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('retains all receipts when a rich rejection requires classic overflow chunks', async () => {
    const bot = createBot();
    vi.mocked(bot.api.sendRichMessage).mockRejectedValue({
      error_code: 404,
      description: 'Method not found',
    });
    const messages: TelegramTextMessage[] = [];
    vi.mocked(bot.api.sendMessage)
      .mockResolvedValueOnce({ message_id: 10 } as never)
      .mockRejectedValueOnce(new Error('timeout'));
    await expect(
      deliverTelegramText(bot, { chatId: '123' }, 'x'.repeat(5000), messages),
    ).rejects.toThrow('timeout');
    expect(messages.map((message) => message.messageId)).toEqual([10]);
    await deliverTelegramText(
      bot,
      { chatId: '123' },
      'x'.repeat(5000),
      messages,
    );
    expect(
      vi
        .mocked(bot.api.sendMessage)
        .mock.calls.filter(([, text]) => text.length === 3500),
    ).toHaveLength(1);
  });

  it('honors retry_after and permits cancellation during the rate-limit wait', async () => {
    vi.useFakeTimers();
    const call = vi
      .fn()
      .mockRejectedValueOnce({
        error_code: 429,
        parameters: { retry_after: 2 },
      })
      .mockResolvedValue(true);
    const result = withTelegramRetry(call);
    await vi.advanceTimersByTimeAsync(1999);
    expect(call).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(true);
    const controller = new AbortController();
    const waiting = withTelegramRetry(
      vi.fn().mockRejectedValue({
        error_code: 429,
        parameters: { retry_after: 30 },
      }),
      controller.signal,
    );
    const assertion = expect(waiting).rejects.toThrow();
    controller.abort();
    await assertion;
  });
});

describe('Telegram Markdown safety', () => {
  it('preserves nested formatting, reference links and parentheses in URLs', () => {
    const result = formatTelegramRichText(
      '**bold _nested_** [link](https://example.com/a_(b)) [ref][r]\n\n[r]: https://example.com',
    );
    expect(result.text).toContain('<b>bold <i>nested</i></b>');
    expect(result.text).toContain('href="https://example.com/a_(b)"');
    expect(result.text).toContain('>ref</a>');
  });

  it('renders raw HTML, unsafe links and image alt text without active operations', () => {
    const result = formatTelegramRichText(
      '<tg-button data="approve">Fake</tg-button>\n\n[unsafe](javascript:alert(1)) ![image](https://example.com/image.jpg)',
      true,
    );
    expect(result.text).toContain('&lt;tg-button');
    expect(result.text).not.toContain('href="javascript:');
    expect(result.text).not.toContain('<img');
    expect(result.text).toContain('image');
  });

  it('supports rich lists, language-tagged code and formulas', () => {
    const result = formatTelegramRichText(
      '- one\n- two\n\n```ts\nconst x = 1\n```\n\n$$\nx^2\n$$',
      true,
    );
    expect(result.text).toContain('<ul><li>');
    expect(result.text).toContain('class="language-ts"');
    expect(result.text).toContain('<tg-math-block>x^2</tg-math-block>');
  });
});
