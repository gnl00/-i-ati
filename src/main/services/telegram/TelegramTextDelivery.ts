import type { Bot } from 'grammy';
import { setTimeout as delay } from 'node:timers/promises';
import {
  formatTelegramRichText,
  prefersTelegramRichMessage,
  splitTelegramText,
} from './telegram-rich-text';

export type TelegramTextTarget = {
  chatId: string;
  threadId?: string;
  replyToMessageId?: string;
};
export type TelegramTextMessage = {
  messageId: number;
  rich: boolean;
  text: string;
};

const apiError = (
  error: unknown,
): {
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
} => (error && typeof error === 'object' ? error : {});

export async function withTelegramRetry<T>(
  call: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await call();
    } catch (error) {
      const response = apiError(error);
      // Only an explicit rejection is safe to retry. Timeouts may have delivered the message.
      if (
        attempt >= 2 ||
        response.error_code !== 429 ||
        !response.parameters?.retry_after
      )
        throw error;
      await delay(response.parameters.retry_after * 1000, undefined, {
        signal,
      });
    }
  }
}

export const isTelegramFormattingError = (error: unknown): boolean => {
  const response = apiError(error);
  return (
    response.error_code === 400 &&
    /can't parse|cannot parse|entity|entities|rich message|rich_message|too many blocks|too many columns/i.test(
      response.description ?? '',
    )
  );
};

const isUnsupportedMethod = (error: unknown): boolean => {
  const response = apiError(error);
  return (
    [400, 404].includes(response.error_code ?? 0) &&
    /method.*(?:not found|not supported|unknown)|unknown method/i.test(
      response.description ?? '',
    )
  );
};

/** Mutate receipts after every successful call so retries cannot duplicate delivered chunks. */
export async function deliverTelegramText(
  bot: Bot,
  target: TelegramTextTarget,
  value: string,
  messages: TelegramTextMessage[] = [],
): Promise<TelegramTextMessage[]> {
  let rich =
    prefersTelegramRichMessage(value) ||
    messages.some((message) => message.rich);
  let chunks = splitTelegramText(value, rich ? 30000 : 3500);
  const options = {
    ...(target.threadId ? { message_thread_id: Number(target.threadId) } : {}),
    ...(target.replyToMessageId
      ? { reply_parameters: { message_id: Number(target.replyToMessageId) } }
      : {}),
  };
  for (let index = 0; index < chunks.length; index += 1) {
    const text = chunks[index];
    const existing = messages[index];
    if (existing?.text === text && existing.rich === rich) continue;
    const formatted = formatTelegramRichText(text, rich);
    const send = async (plain = false): Promise<number> => {
      const body = plain ? formatted.fallbackText : formatted.text;
      if (existing) {
        try {
          await withTelegramRetry(() =>
            bot.api.editMessageText(
              Number(target.chatId),
              existing.messageId,
              rich ? { html: body } : body,
              rich
                ? {}
                : {
                    ...(plain
                      ? {}
                      : formatted.parseMode
                        ? { parse_mode: formatted.parseMode }
                        : {}),
                    ...(formatted.parseMode
                      ? { link_preview_options: { is_disabled: true } }
                      : {}),
                  },
            ),
          );
        } catch (error) {
          if (!String(error).toLowerCase().includes('message is not modified'))
            throw error;
        }
        return existing.messageId;
      }
      const sent = await withTelegramRetry<{ message_id: number }>(() =>
        rich
          ? bot.api.sendRichMessage(
              Number(target.chatId),
              { html: body },
              options,
            )
          : bot.api.sendMessage(Number(target.chatId), body, {
              ...options,
              ...(plain
                ? {}
                : formatted.parseMode
                  ? { parse_mode: formatted.parseMode }
                  : {}),
              ...(formatted.parseMode
                ? { link_preview_options: { is_disabled: true } }
                : {}),
            }),
      );
      return sent.message_id;
    };
    try {
      const messageId = await send();
      messages[index] = { messageId, rich, text };
    } catch (error) {
      if (
        rich &&
        (isUnsupportedMethod(error) || isTelegramFormattingError(error))
      ) {
        // A rejected rich send/edit is safe to retry with classic, balanced HTML chunks.
        rich = false;
        chunks = [
          ...chunks.slice(0, index),
          ...splitTelegramText(chunks.slice(index).join(''), 3500),
        ];
        index -= 1;
      } else if (isTelegramFormattingError(error)) {
        const messageId = await send(true);
        messages[index] = { messageId, rich: false, text };
      } else {
        throw error;
      }
    }
  }
  // Preserve successfully updated content before removing obsolete overflow messages.
  while (messages.length > chunks.length) {
    const last = messages[messages.length - 1];
    await withTelegramRetry(() =>
      bot.api.deleteMessage(Number(target.chatId), last.messageId),
    );
    messages.pop();
  }
  return messages;
}
