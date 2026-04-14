import { MeiliSearch } from 'meilisearch';
import { config } from '../config/index.js';

let _client: MeiliSearch | null = null;

export function getMeilisearch(): MeiliSearch {
  if (!_client) {
    _client = new MeiliSearch({
      host: config.MEILISEARCH_URL,
      apiKey: config.MEILISEARCH_KEY,
    });
  }
  return _client;
}

export const INDEXES = {
  USERS: 'users',
  MESSAGES: 'messages',
} as const;

export async function initSearchIndexes(): Promise<void> {
  const client = getMeilisearch();

  // Users index
  await client.createIndex(INDEXES.USERS, { primaryKey: 'id' });
  await client.index(INDEXES.USERS).updateSettings({
    searchableAttributes: ['displayName', 'phoneNumber'],
    filterableAttributes: ['id'],
    sortableAttributes: ['displayName'],
    typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 } },
  });

  // Messages index
  await client.createIndex(INDEXES.MESSAGES, { primaryKey: 'id' });
  await client.index(INDEXES.MESSAGES).updateSettings({
    searchableAttributes: ['plaintext'],
    filterableAttributes: ['chatId', 'senderId'],
    sortableAttributes: ['sentAt'],
    pagination: { maxTotalHits: 1000 },
  });
}
