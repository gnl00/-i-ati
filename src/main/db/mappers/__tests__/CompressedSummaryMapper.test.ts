import { describe, expect, it } from 'vitest'
import {
  toCompressedSummaryEntity,
  toCompressedSummaryInsertRow
} from '../CompressedSummaryMapper'

describe('CompressedSummaryMapper', () => {
  it('maps an entity into an insert row', () => {
    const entity: CompressedSummaryEntity = {
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [10, 11, 12],
      startMessageId: 10,
      endMessageId: 12,
      summary: 'summary',
      originalTokenCount: 1200,
      summaryTokenCount: 300,
      compressionRatio: 0.25,
      compressedAt: 100,
      compressionModel: 'gpt-5',
      compressionVersion: 2,
      status: 'active'
    }

    expect(toCompressedSummaryInsertRow(entity)).toEqual({
      chat_id: 1,
      chat_uuid: 'chat-1',
      message_ids: JSON.stringify([10, 11, 12]),
      start_message_id: 10,
      end_message_id: 12,
      summary: 'summary',
      original_token_count: 1200,
      summary_token_count: 300,
      compression_ratio: 0.25,
      compressed_at: 100,
      compression_model: 'gpt-5',
      compression_version: 2,
      status: 'active'
    })
  })

  it('maps a row back into an entity', () => {
    expect(toCompressedSummaryEntity({
      id: 9,
      chat_id: 1,
      chat_uuid: 'chat-1',
      message_ids: JSON.stringify([10, 11, 12]),
      start_message_id: 10,
      end_message_id: 12,
      summary: 'summary',
      original_token_count: 1200,
      summary_token_count: 300,
      compression_ratio: 0.25,
      compressed_at: 100,
      compression_model: 'gpt-5',
      compression_version: 2,
      status: 'superseded'
    })).toEqual({
      id: 9,
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [10, 11, 12],
      startMessageId: 10,
      endMessageId: 12,
      summary: 'summary',
      originalTokenCount: 1200,
      summaryTokenCount: 300,
      compressionRatio: 0.25,
      compressedAt: 100,
      compressionModel: 'gpt-5',
      compressionVersion: 2,
      status: 'superseded'
    })
  })
})
